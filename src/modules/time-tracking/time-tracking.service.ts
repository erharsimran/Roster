import {
    Injectable,
    NotFoundException,
    ConflictException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PermissionService } from '../../common/services/permission.service';
import { ClockInDto, ClockOutDto, SetLocationCoordinatesDto } from './dto/time-tracking.dto';

@Injectable()
export class TimeTrackingService {
    private readonly logger = new Logger(TimeTrackingService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionService: PermissionService,
    ) { }

    /**
     * Shared check for manager-facing timesheet actions (view/approve).
     * getTimesheetsByLocation and approveTimeEntry previously had NO access
     * check at all — any authenticated user, from any organization, could
     * view or approve any location's time entries. This closes that gap.
     */
    private async assertTimesheetAccess(userId: string, locationId: string) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
            select: { id: true, orgId: true },
        });
        if (!location) throw new NotFoundException('Location not found');

        const allowed = await this.permissionService.can(userId, 'time:approve_timesheets', {
            scopeType: 'location',
            scopeId: location.id,
        });
        if (!allowed) {
            throw new ForbiddenException('Insufficient permissions to view or approve timesheets for this location');
        }
        return location;
    }

    /**
     * Calculates surface distance in meters between two GPS coordinates using Haversine formula.
     */
    private calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371000; // Earth radius in meters
        const toRad = (deg: number) => (deg * Math.PI) / 180;

        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Number((R * c).toFixed(2));
    }

    /**
     * 1. CONFIGURE STORE GEOFENCE COORDINATES
     */
    async setLocationCoordinates(managerUserId: string, locationId: string, dto: SetLocationCoordinatesDto) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
        });

        if (!location) throw new NotFoundException('Location not found');

        const allowed = await this.permissionService.can(managerUserId, 'locations:manage', {
            scopeType: 'location',
            scopeId: location.id,
        });

        if (!allowed) {
            throw new ForbiddenException('Insufficient permissions to modify location coordinates');
        }

        return this.prisma.location.update({
            where: { id: locationId },
            data: {
                latitude: dto.latitude,
                longitude: dto.longitude,
                geofenceRadiusMeters: dto.geofenceRadiusMeters || 150,
            },
            select: {
                id: true,
                name: true,
                latitude: true,
                longitude: true,
                geofenceRadiusMeters: true,
            },
        });
    }

    /**
     * 2. CLOCK IN (GPS & Shift Verification)
     */
    async clockIn(userId: string, dto: ClockInDto) {
        // Prevent multiple concurrent active punches
        const activeEntry = await this.prisma.timeEntry.findFirst({
            where: { userId, status: 'active' },
        });

        if (activeEntry) {
            throw new ConflictException('You are already clocked into an active shift. Clock out first.');
        }

        const location = await this.prisma.location.findUnique({
            where: { id: dto.locationId },
        });

        if (!location) throw new NotFoundException('Location not found');

        const now = new Date();

        // 1. Geofence Verification
        let distanceMeters = 0;
        let isGeofenceViolation = false;

        if (location.latitude !== null && location.longitude !== null) {
            distanceMeters = this.calculateDistanceMeters(
                dto.latitude,
                dto.longitude,
                location.latitude,
                location.longitude,
            );
            if (distanceMeters > location.geofenceRadiusMeters) {
                isGeofenceViolation = true;
            }
        }

        // 2. Identify Matching Shift if not explicitly provided
        let targetShiftId = dto.shiftId;
        let varianceMinutes = 0;

        if (!targetShiftId) {
            // Find shift starting within +/- 2 hours of current time
            const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
            const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

            const matchingShift = await this.prisma.shift.findFirst({
                where: {
                    locationId: dto.locationId,
                    assignedUserId: userId,
                    status: 'published',
                    startTime: { gte: windowStart, lte: windowEnd },
                },
                orderBy: { startTime: 'asc' },
            });

            if (matchingShift) {
                targetShiftId = matchingShift.id;
                varianceMinutes = Math.round((now.getTime() - matchingShift.startTime.getTime()) / 60000);
            }
        } else {
            const shift = await this.prisma.shift.findUnique({ where: { id: targetShiftId } });
            if (shift) {
                varianceMinutes = Math.round((now.getTime() - shift.startTime.getTime()) / 60000);
            }
        }

        // Flag if punched outside geofence or punched >15 minutes late/early
        const shouldFlag = isGeofenceViolation || Math.abs(varianceMinutes) > 15;

        return this.prisma.timeEntry.create({
            data: {
                orgId: location.orgId,
                locationId: location.id,
                userId,
                shiftId: targetShiftId || null,
                clockIn: now,
                clockInLat: dto.latitude,
                clockInLng: dto.longitude,
                clockInDistance: distanceMeters,
                status: shouldFlag ? 'flagged' : 'active',
                varianceMinutes,
                notes: dto.notes?.trim() || (isGeofenceViolation ? `Clocked in ${distanceMeters}m away (radius: ${location.geofenceRadiusMeters}m)` : null),
            },
            include: {
                location: { select: { name: true, geofenceRadiusMeters: true } },
                shift: { select: { startTime: true, endTime: true } },
            },
        });
    }

    /**
     * 3. CLOCK OUT
     */
    async clockOut(userId: string, dto: ClockOutDto) {
        const activeEntry = await this.prisma.timeEntry.findFirst({
            where: { userId, status: { in: ['active', 'flagged'] }, clockOut: null },
            include: { location: true },
        });

        if (!activeEntry) {
            throw new NotFoundException('No active clock-in found for this user');
        }

        const now = new Date();
        let distanceMeters = 0;
        let isGeofenceViolation = false;

        if (activeEntry.location.latitude !== null && activeEntry.location.longitude !== null) {
            distanceMeters = this.calculateDistanceMeters(
                dto.latitude,
                dto.longitude,
                activeEntry.location.latitude,
                activeEntry.location.longitude,
            );
            if (distanceMeters > activeEntry.location.geofenceRadiusMeters) {
                isGeofenceViolation = true;
            }
        }

        const finalStatus = activeEntry.status === 'flagged' || isGeofenceViolation ? 'flagged' : 'completed';

        return this.prisma.timeEntry.update({
            where: { id: activeEntry.id },
            data: {
                clockOut: now,
                clockOutLat: dto.latitude,
                clockOutLng: dto.longitude,
                clockOutDistance: distanceMeters,
                status: finalStatus,
                notes: dto.notes
                    ? `${activeEntry.notes || ''} | Out note: ${dto.notes}`.trim()
                    : activeEntry.notes,
            },
            include: {
                location: { select: { name: true } },
            },
        });
    }

    /**
     * 4. MANAGER TIMESHEET AUDIT & APPROVAL
     */
    async getTimesheetsByLocation(managerUserId: string, locationId: string, startDate: string, endDate: string) {
        await this.assertTimesheetAccess(managerUserId, locationId);

        const entries = await this.prisma.timeEntry.findMany({
            where: {
                locationId,
                clockIn: {
                    gte: new Date(startDate),
                    lte: new Date(endDate),
                },
            },
            include: {
                user: { select: { id: true, fullName: true, email: true } },
                shift: {
                    select: {
                        id: true,
                        startTime: true,
                        endTime: true,
                        position: { select: { name: true, hourlyRate: true } },
                    },
                },
            },
            orderBy: { clockIn: 'desc' },
        });

        return entries.map((entry) => {
            const durationHours = entry.clockOut
                ? Number(((entry.clockOut.getTime() - entry.clockIn.getTime()) / (1000 * 60 * 60)).toFixed(2))
                : null;

            const rate = entry.shift?.position?.hourlyRate ? Number(entry.shift.position.hourlyRate) : 0;
            const actualCost = durationHours !== null ? Number((durationHours * rate).toFixed(2)) : 0;

            return {
                ...entry,
                durationHours,
                actualCost,
            };
        });
    }

    async approveTimeEntry(managerUserId: string, entryId: string) {
        const entry = await this.prisma.timeEntry.findUnique({
            where: { id: entryId },
            include: { location: true },
        });

        if (!entry) throw new NotFoundException('Time entry not found');

        // Previously this method never checked the caller had ANY relationship
        // to the entry's org/location — any authenticated user could approve
        // any time entry system-wide. Now scoped to the entry's actual location.
        await this.assertTimesheetAccess(managerUserId, entry.locationId);

        return this.prisma.timeEntry.update({
            where: { id: entryId },
            data: {
                status: 'approved',
                reviewedBy: managerUserId,
                reviewedAt: new Date(),
            },
        });
    }
}