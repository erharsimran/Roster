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
import { CreateShiftDto, PublishRosterDto } from './dto/shift.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService, // <-- Inject
  ) { }
  /**
   * Asserts location belongs to org and caller has permission to view/manage shifts.
   */
  private async assertLocationAccess(userId: string, locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, orgId: true, name: true, timezone: true },
    });

    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

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

    if (!callerRole || !['Owner', 'Admin', 'Manager'].includes(callerRole.role.name)) {
      throw new ForbiddenException('You lack authorization to manage shifts for this location');
    }

    return location;
  }

  /**
   * Validates cross-location conflicts for an employee across the entire organization.
   */
  private async validateShiftConflicts(
    orgId: string,
    assignedUserId: string,
    startTime: Date,
    endTime: Date,
    excludeShiftId?: string,
  ) {
    const conflictingShift = await this.prisma.shift.findFirst({
      where: {
        id: excludeShiftId ? { not: excludeShiftId } : undefined,
        assignedUserId,
        status: { in: ['scheduled', 'published'] },
        location: { orgId },
        AND: [
          { startTime: { lt: endTime } },
          { endTime: { gt: startTime } },
        ],
      },
      include: {
        location: { select: { name: true } },
      },
    });

    if (conflictingShift) {
      throw new ConflictException(
        `Employee already has an overlapping shift scheduled at "${conflictingShift.location.name}" from ${conflictingShift.startTime.toISOString()} to ${conflictingShift.endTime.toISOString()}`,
      );
    }
  }

  /**
   * Creates a draft shift in scheduled status.
   */
  async create(callerUserId: string, dto: CreateShiftDto) {
    const location = await this.assertLocationAccess(callerUserId, dto.locationId);
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    // Enforce chronological integrity and max 24-hour shift duration
    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }

    if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Single shift duration cannot exceed 24 continuous hours');
    }

    // Validate position belongs to this organization
    if (dto.positionId) {
      const position = await this.prisma.position.findFirst({
        where: { id: dto.positionId, orgId: location.orgId },
      });
      if (!position) {
        throw new NotFoundException('Position does not belong to this organization');
      }
    }

    // Validate assigned employee exists and check cross-location overlap
    if (dto.assignedUserId) {
      const employee = await this.prisma.user.findUnique({
        where: { id: dto.assignedUserId },
      });
      if (!employee) {
        throw new NotFoundException('Assigned employee does not exist');
      }

      await this.validateShiftConflicts(location.orgId, dto.assignedUserId, start, end);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const shift = await tx.shift.create({
          data: {
            locationId: dto.locationId,
            positionId: dto.positionId || null,
            assignedUserId: dto.assignedUserId || null,
            startTime: start,
            endTime: end,
            status: 'scheduled',
            createdBy: callerUserId,
          },
          include: {
            position: { select: { id: true, name: true, hourlyRate: true } },
            assignedUser: { select: { id: true, fullName: true, email: true } },
          },
        });

        // Audit Log Entry
        await tx.auditLog.create({
          data: {
            orgId: location.orgId,
            userId: callerUserId,
            action: 'shift.create',
            resourceType: 'shift',
            resourceId: shift.id,
            metadata: {
              locationId: shift.locationId,
              assignedUserId: shift.assignedUserId,
              startTime: shift.startTime.toISOString(),
              endTime: shift.endTime.toISOString(),
            },
          },
        });

        return shift;
      });
    } catch (error: any) {
      this.logger.error(`Failed to create shift: ${error.message}`, error.stack);
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('An error occurred while creating the shift');
    }
  }

  /**
   * Retrieves flat shift records for a location filtered by date range.
   */
  async findByLocation(
    callerUserId: string,
    locationId: string,
    startDate?: string,
    endDate?: string,
  ) {
    await this.assertLocationAccess(callerUserId, locationId);

    const whereClause: any = { locationId };
    if (startDate && endDate) {
      whereClause.startTime = { gte: new Date(startDate) };
      whereClause.endTime = { lte: new Date(endDate) };
    }

    return this.prisma.shift.findMany({
      where: whereClause,
      include: {
        position: { select: { id: true, name: true, hourlyRate: true } },
        assignedUser: { select: { id: true, fullName: true, email: true, phone: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

/**
   * Publishes all scheduled/draft shifts for a location in a specified window.
   */
  async publishRoster(callerUserId: string, locationId: string, dto: PublishRosterDto) {
    const location = await this.assertLocationAccess(callerUserId, locationId);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException('startDate must be earlier than endDate');
    }

    // 1. Atomically update shifts and record audit log
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.shift.updateMany({
        where: {
          locationId,
          status: 'scheduled',
          startTime: { gte: start },
          endTime: { lte: end },
        },
        data: {
          status: 'published',
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: location.orgId,
          userId: callerUserId,
          action: 'roster.publish',
          resourceType: 'location',
          resourceId: locationId,
          metadata: {
            startDate: dto.startDate,
            endDate: dto.endDate,
            publishedShiftCount: count,
          },
        },
      });

      return {
        success: true,
        publishedCount: count,
        period: { start: dto.startDate, end: dto.endDate },
      };
    });

    // 2. Queue background notification only if shifts were published
    if (result.publishedCount > 0) {
      await this.notificationsService.queueRosterPublishedNotification({
        locationId: location.id,
        locationName: location.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        publishedCount: result.publishedCount,
      });
    }

    return result;
  }
  /**
   * 1-Click "Copy Last Week" engine:
   * Clones all shifts from source week into target week as draft (scheduled) shifts,
   * adjusting timestamps by the week offset and reporting any skipped double-bookings.
   */
  async copyWeek(callerUserId: string, locationId: string, dto: { sourceStartDate: string; targetStartDate: string; skipConflicts?: boolean }) {
    const location = await this.assertLocationAccess(callerUserId, locationId);

    const srcStart = new Date(dto.sourceStartDate);
    const srcEnd = new Date(srcStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const targetStart = new Date(dto.targetStartDate);

    const timeShiftDeltaMs = targetStart.getTime() - srcStart.getTime();

    // Fetch source week shifts
    const sourceShifts = await this.prisma.shift.findMany({
      where: {
        locationId,
        startTime: { gte: srcStart, lt: srcEnd },
      },
    });

    if (sourceShifts.length === 0) {
      throw new NotFoundException('No shifts found in the source week to copy');
    }

    return this.prisma.$transaction(async (tx) => {
      const createdShifts: any[] = [];
      const skippedConflicts: any[] = [];

      for (const shift of sourceShifts) {
        const newStart = new Date(shift.startTime.getTime() + timeShiftDeltaMs);
        const newEnd = new Date(shift.endTime.getTime() + timeShiftDeltaMs);

        // Check if assigned employee has conflict in destination week
        if (shift.assignedUserId) {
          const conflict = await tx.shift.findFirst({
            where: {
              assignedUserId: shift.assignedUserId,
              status: { in: ['scheduled', 'published'] },
              location: { orgId: location.orgId },
              AND: [{ startTime: { lt: newEnd } }, { endTime: { gt: newStart } }],
            },
          });

          if (conflict) {
            if (dto.skipConflicts) {
              skippedConflicts.push({
                shiftId: shift.id,
                userId: shift.assignedUserId,
                scheduledTime: newStart.toISOString(),
                reason: 'Target time slot already occupied',
              });
              continue;
            } else {
              throw new ConflictException(`Conflict detected for user ${shift.assignedUserId} in target week`);
            }
          }
        }

        const cloned = await tx.shift.create({
          data: {
            locationId: shift.locationId,
            positionId: shift.positionId,
            assignedUserId: shift.assignedUserId,
            startTime: newStart,
            endTime: newEnd,
            status: 'scheduled', // Cloned shifts always start as draft
            createdBy: callerUserId,
          },
        });
        createdShifts.push(cloned);
      }

      await tx.auditLog.create({
        data: {
          orgId: location.orgId,
          userId: callerUserId,
          action: 'roster.copy_week',
          resourceType: 'location',
          resourceId: locationId,
          metadata: {
            sourceStartDate: dto.sourceStartDate,
            targetStartDate: dto.targetStartDate,
            copiedCount: createdShifts.length,
            skippedCount: skippedConflicts.length,
          },
        },
      });

      return {
        success: true,
        copiedCount: createdShifts.length,
        skippedCount: skippedConflicts.length,
        skippedConflicts,
      };
    });
  }
}