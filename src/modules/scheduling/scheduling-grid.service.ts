import {
    Injectable,
    NotFoundException,
    ConflictException,
    ForbiddenException,
    InternalServerErrorException,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
    GetScheduleGridDto,
    GridGroupBy,
    MoveShiftDto,
    DuplicateShiftDto,
    UpdateLocationOperatingHoursDto,
    QuickDropShiftDto,
} from './dto/schedule-grid.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeEvent } from '../realtime/realtime.constants';

interface TimeInterval {
    start: number;
    end: number;
}

export interface CoverageGap {
    date: string;
    type: 'MISSING_LEADERSHIP' | 'STORE_UNSTAFFED';
    missingFrom: string;
    missingTo: string;
    message: string;
}

@Injectable()
export class SchedulingGridService {
    private readonly logger = new Logger(SchedulingGridService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtimeGateway: RealtimeGateway,
    ) { }

    private async assertLocationAccess(userId: string, locationId: string) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
        });

        if (!location) throw new NotFoundException('Location not found');

        const callerRole = await this.prisma.userRole.findFirst({
            where: {
                userId,
                OR: [
                    { scopeType: 'organization', scopeId: location.orgId },
                    { scopeType: 'location', scopeId: location.id },
                ],
            },
            include: { role: true },
        });

        if (!callerRole) throw new ForbiddenException('No access to this location schedule');

        return {
            location,
            isManager: ['Owner', 'Admin', 'Manager'].includes(callerRole.role.name),
        };
    }

    /**
     * Continuous interval-merge algorithm to detect gaps in leadership presence.
     */
    private detectLeadershipGaps(
        shifts: any[],
        operatingHoursConfig: Record<string, any> | null,
        timeZone: string,
    ): CoverageGap[] {
        if (!operatingHoursConfig) return [];

        const gaps: CoverageGap[] = [];
        const shiftsByDate = new Map<string, any[]>();

        for (const shift of shifts) {
            const dateKey = shift.startTime.toISOString().split('T')[0];
            if (!shiftsByDate.has(dateKey)) shiftsByDate.set(dateKey, []);
            shiftsByDate.get(dateKey)!.push(shift);
        }

        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        for (const [dateStr, dayShifts] of shiftsByDate.entries()) {
            const dateObj = new Date(dateStr + 'T00:00:00Z');
            const dayOfWeek = dayNames[dateObj.getUTCDay()];
            const dayConfig = operatingHoursConfig[dayOfWeek];

            if (!dayConfig || !dayConfig.isOpen) continue;

            const [openHour, openMin] = dayConfig.open.split(':').map(Number);
            const [closeHour, closeMin] = dayConfig.close.split(':').map(Number);

            const storeOpen = new Date(dateStr);
            storeOpen.setUTCHours(openHour, openMin, 0, 0);

            const storeClose = new Date(dateStr);
            storeClose.setUTCHours(closeHour, closeMin, 0, 0);

            const openMs = storeOpen.getTime();
            const closeMs = storeClose.getTime();

            // Filter shifts with Manager/TL/ATL position or Admin/Manager role
            const leadershipIntervals: TimeInterval[] = dayShifts
                .filter((s) => s.position?.isLeadership === true || s.assignedUser?.userRoles?.some((ur: any) => ['Owner', 'Admin', 'Manager'].includes(ur.role.name)))
                .map((s) => ({
                    start: Math.max(openMs, new Date(s.startTime).getTime()),
                    end: Math.min(closeMs, new Date(s.endTime).getTime()),
                }))
                .filter((i) => i.start < i.end)
                .sort((a, b) => a.start - b.start);

            // Merge overlapping intervals
            const merged: TimeInterval[] = [];
            for (const current of leadershipIntervals) {
                if (merged.length === 0) {
                    merged.push({ ...current });
                    continue;
                }
                const last = merged[merged.length - 1];
                if (current.start <= last.end) {
                    last.end = Math.max(last.end, current.end);
                } else {
                    merged.push({ ...current });
                }
            }

            // Check for uncovered intervals throughout the operating day
            let currentPointer = openMs;
            for (const block of merged) {
                if (block.start > currentPointer) {
                    gaps.push({
                        date: dateStr,
                        type: 'MISSING_LEADERSHIP',
                        missingFrom: new Date(currentPointer).toISOString().substring(11, 16),
                        missingTo: new Date(block.start).toISOString().substring(11, 16),
                        message: `No Manager/Lead on duty between ${new Date(currentPointer).toISOString().substring(11, 16)} and ${new Date(block.start).toISOString().substring(11, 16)}`,
                    });
                }
                currentPointer = Math.max(currentPointer, block.end);
            }

            if (currentPointer < closeMs) {
                gaps.push({
                    date: dateStr,
                    type: 'MISSING_LEADERSHIP',
                    missingFrom: new Date(currentPointer).toISOString().substring(11, 16),
                    missingTo: new Date(closeMs).toISOString().substring(11, 16),
                    message: `No Manager/Lead on duty between ${new Date(currentPointer).toISOString().substring(11, 16)} and ${new Date(closeMs).toISOString().substring(11, 16)}`,
                });
            }
        }

        return gaps;
    }

    async updateOperatingHours(userId: string, locationId: string, dto: UpdateLocationOperatingHoursDto) {
        const { location } = await this.assertLocationAccess(userId, locationId);

        return this.prisma.location.update({
            where: { id: locationId },
            data: {
                operatingHours: dto.operatingHours as any,
                requireLeadershipOnDuty: dto.requireLeadershipOnDuty !== undefined ? dto.requireLeadershipOnDuty : location.requireLeadershipOnDuty,
            },
            select: {
                id: true,
                name: true,
                operatingHours: true,
                requireLeadershipOnDuty: true,
            },
        });
    }

    async getScheduleGrid(userId: string, locationId: string, query: GetScheduleGridDto) {
        const { location, isManager } = await this.assertLocationAccess(userId, locationId);
        const start = new Date(query.startDate);
        const end = new Date(query.endDate);

        const shifts = await this.prisma.shift.findMany({
            where: {
                locationId,
                startTime: { gte: start },
                endTime: { lte: end },
                status: isManager ? undefined : 'published',
            },
            include: {
                position: { select: { id: true, name: true, hourlyRate: true, isLeadership: true } },
                assignedUser: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        userRoles: { select: { role: { select: { name: true } } } },
                    },
                },
            },
            orderBy: { startTime: 'asc' },
        });

        const openShifts: any[] = [];
        const assignedShifts: any[] = [];

        for (const shift of shifts) {
            const durationHours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
            const rate = shift.position?.hourlyRate ? Number(shift.position.hourlyRate) : 0;
            const estimatedCost = durationHours * rate;

            const card = {
                id: shift.id,
                startTime: shift.startTime.toISOString(),
                endTime: shift.endTime.toISOString(),
                durationHours: Number(durationHours.toFixed(2)),
                status: shift.status,
                position: shift.position ? { id: shift.position.id, name: shift.position.name, isLeadership: shift.position.isLeadership } : null,
                assignedUser: shift.assignedUser
                    ? { id: shift.assignedUser.id, fullName: shift.assignedUser.fullName, email: shift.assignedUser.email }
                    : null,
                estimatedCost: Number(estimatedCost.toFixed(2)),
                isProjectedOvertime: false,
            };

            if (!shift.assignedUserId || !shift.assignedUser) {
                openShifts.push(card);
            } else {
                assignedShifts.push(card);
            }
        }

        let totalScheduledHours = 0;
        let totalEstimatedLaborCost = 0;
        const userHoursMap = new Map<string, number>();

        for (const s of assignedShifts) {
            totalScheduledHours += s.durationHours;
            totalEstimatedLaborCost += s.estimatedCost;
            const uId = s.assignedUser.id;
            userHoursMap.set(uId, (userHoursMap.get(uId) || 0) + s.durationHours);
        }

        for (const s of assignedShifts) {
            s.isProjectedOvertime = (userHoursMap.get(s.assignedUser.id) || 0) > 40;
        }

        // Run leadership gap detector if the rule is enabled for this location
        const complianceGaps = location.requireLeadershipOnDuty
            ? this.detectLeadershipGaps(shifts, location.operatingHours as any, location.timezone)
            : [];

        const rowsMap = new Map<string, any>();

        if (query.groupBy === GridGroupBy.POSITION) {
            for (const s of assignedShifts) {
                const rowKey = s.position ? s.position.id : 'unassigned_pos';
                const label = s.position ? s.position.name : 'Unassigned Position';

                if (!rowsMap.has(rowKey)) {
                    rowsMap.set(rowKey, { id: rowKey, label, isLeadership: s.position?.isLeadership || false, totalHours: 0, totalCost: 0, shifts: [] });
                }
                const row = rowsMap.get(rowKey)!;
                row.totalHours = Number((row.totalHours + s.durationHours).toFixed(2));
                row.totalCost = Number((row.totalCost + s.estimatedCost).toFixed(2));
                row.shifts.push(s);
            }
        } else {
            for (const s of assignedShifts) {
                const rowKey = s.assignedUser.id;
                const label = s.assignedUser.fullName;
                const subLabel = s.assignedUser.email;

                if (!rowsMap.has(rowKey)) {
                    rowsMap.set(rowKey, { id: rowKey, label, subLabel, totalHours: 0, totalCost: 0, shifts: [] });
                }
                const row = rowsMap.get(rowKey)!;
                row.totalHours = Number((row.totalHours + s.durationHours).toFixed(2));
                row.totalCost = Number((row.totalCost + s.estimatedCost).toFixed(2));
                row.shifts.push(s);
            }
        }

        return {
            metadata: {
                locationId: location.id,
                locationName: location.name,
                timezone: location.timezone,
                operatingHours: location.operatingHours,
                requireLeadershipOnDuty: location.requireLeadershipOnDuty,
                startDate: query.startDate,
                endDate: query.endDate,
                groupBy: query.groupBy || GridGroupBy.EMPLOYEE,
            },
            summary: {
                totalHours: Number(totalScheduledHours.toFixed(2)),
                estimatedCost: Number(totalEstimatedLaborCost.toFixed(2)),
                totalShiftsCount: shifts.length,
                openShiftsCount: openShifts.length,
                complianceAlertsCount: complianceGaps.length,
            },
            complianceAlerts: complianceGaps,
            openShifts,
            rows: Array.from(rowsMap.values()),
        };
    }

    async quickDrop(callerUserId: string, locationId: string, dto: QuickDropShiftDto) {
        const { location } = await this.assertLocationAccess(callerUserId, locationId);
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dateObj = new Date(dto.date + 'T00:00:00Z');
        const dayOfWeek = dayNames[dateObj.getUTCDay()];

        const operatingConfig = (location.operatingHours as any)?.[dayOfWeek];
        let startHour = 9;
        let startMin = 0;

        if (operatingConfig?.isOpen && operatingConfig?.open) {
            const [h, m] = operatingConfig.open.split(':').map(Number);
            startHour = h;
            startMin = m;
        }

        const startTime = new Date(dto.date + 'T00:00:00Z');
        startTime.setUTCHours(startHour, startMin, 0, 0);

        const duration = dto.durationHours || 8;
        const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);

        // Cross-location collision check
        const conflict = await this.prisma.shift.findFirst({
            where: {
                assignedUserId: dto.userId,
                status: { in: ['scheduled', 'published'] },
                location: { orgId: location.orgId },
                AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
            },
            include: { location: { select: { name: true } } },
        });

        if (conflict) {
            throw new ConflictException(`User already has a shift at "${conflict.location.name}" during this time`);
        }

        const createdShift = this.prisma.shift.create({
            data: {
                locationId,
                assignedUserId: dto.userId,
                positionId: dto.positionId || null,
                startTime,
                endTime,
                status: 'scheduled',
                createdBy: callerUserId,
            },
            include: {
                position: { select: { id: true, name: true, isLeadership: true } },
                assignedUser: { select: { id: true, fullName: true, email: true } },
            },
        });

        this.realtimeGateway.emitToLocation(
            locationId,
            RealtimeEvent.SHIFT_CREATED,
            createdShift,
        );
        return createdShift;
    }

    async moveShift(callerUserId: string, shiftId: string, dto: MoveShiftDto) {
        const shift = await this.prisma.shift.findUnique({
            where: { id: shiftId },
            include: { location: true },
        });

        if (!shift) throw new NotFoundException('Shift not found');
        await this.assertLocationAccess(callerUserId, shift.locationId);

        const start = new Date(dto.newStartTime);
        const end = new Date(dto.newEndTime);

        if (start.getTime() >= end.getTime()) {
            throw new BadRequestException('newStartTime must be earlier than newEndTime');
        }

        const targetUser = dto.targetUserId !== undefined ? dto.targetUserId : shift.assignedUserId;

        if (targetUser) {
            const conflict = await this.prisma.shift.findFirst({
                where: {
                    id: { not: shift.id },
                    assignedUserId: targetUser,
                    status: { in: ['scheduled', 'published'] },
                    location: { orgId: shift.location.orgId },
                    AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
                },
                include: { location: { select: { name: true } } },
            });

            if (conflict) {
                throw new ConflictException(`User already assigned at "${conflict.location.name}" for that timeframe`);
            }
        }

        const updatedShift = await this.prisma.shift.update({
            where: { id: shiftId },
            data: {
                assignedUserId: targetUser,
                positionId: dto.targetPositionId !== undefined ? dto.targetPositionId : shift.positionId,
                startTime: start,
                endTime: end,
            },
            include: {
                position: { select: { id: true, name: true, isLeadership: true } },
                assignedUser: { select: { id: true, fullName: true, email: true } },
            },
        });

        // Broadcast instant update to all managers viewing this location grid
        // this.realtimeGateway.emitToLocation(
        //     updatedShift.locationId,
        //     RealtimeEvent.SHIFT_MOVED,
        //     {
        //         shiftId: updatedShift.id,
        //         assignedUser: updatedShift.assignedUser,
        //         position: updatedShift.position,
        //         startTime: updatedShift.startTime,
        //         endTime: updatedShift.endTime,
        //         updatedBy: callerUserId,
        //     },
        // );
        return updatedShift;
    }

    async duplicateShift(callerUserId: string, shiftId: string, dto: DuplicateShiftDto) {
        const original = await this.prisma.shift.findUnique({
            where: { id: shiftId },
            include: { location: true },
        });

        if (!original) throw new NotFoundException('Source shift not found');
        await this.assertLocationAccess(callerUserId, original.locationId);

        const start = new Date(dto.newStartTime);
        const end = new Date(dto.newEndTime);
        const targetUserId = dto.targetUserId !== undefined ? dto.targetUserId : original.assignedUserId;

        if (targetUserId) {
            const conflict = await this.prisma.shift.findFirst({
                where: {
                    assignedUserId: targetUserId,
                    status: { in: ['scheduled', 'published'] },
                    location: { orgId: original.location.orgId },
                    AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
                },
            });

            if (conflict) throw new ConflictException('Conflict detected at the destination time slot');
        }

        return this.prisma.shift.create({
            data: {
                locationId: original.locationId,
                positionId: original.positionId,
                assignedUserId: targetUserId,
                startTime: start,
                endTime: end,
                status: 'scheduled',
                createdBy: callerUserId,
            },
            include: {
                position: { select: { id: true, name: true, isLeadership: true } },
                assignedUser: { select: { id: true, fullName: true, email: true } },
            },
        });
    }
}