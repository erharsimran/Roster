import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SchedulingService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private notificationQueue: Queue,
  ) {}

  listShiftsForLocation(locationId: string) {
    return this.prisma.shift.findMany({
      where: { locationId },
      orderBy: { startTime: 'asc' },
      include: { assignedUser: true, position: true },
    });
  }

  async createShift(locationId: string, dto: CreateShiftDto) {
    // Overlap check relies on idx_shifts_assigned_user — keep this query narrow.
    if (dto.assignedUserId) {
      const conflict = await this.prisma.shift.findFirst({
        where: {
          assignedUserId: dto.assignedUserId,
          startTime: { lt: new Date(dto.endTime) },
          endTime: { gt: new Date(dto.startTime) },
        },
      });
      if (conflict) {
        throw new Error('Employee already has an overlapping shift');
      }
    }

    return this.prisma.shift.create({
      data: {
        locationId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        positionId: dto.positionId,
        assignedUserId: dto.assignedUserId,
        createdBy: 'TODO-inject-current-user-id', // pull from req.user in controller in a real pass
        status: 'scheduled',
      },
    });
  }

  async publishSchedule(locationId: string) {
    const shifts = await this.prisma.shift.updateMany({
      where: { locationId, status: 'scheduled' },
      data: { status: 'published' },
    });

    // Fan-out never happens synchronously — enqueue one job per affected employee.
    // The worker (separate process) handles push/email/SMS dispatch and retries.
    await this.notificationQueue.add('schedule-published', { locationId });

    return { publishedCount: shifts.count };
  }
}
