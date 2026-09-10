import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ShiftLifecycleCronService {
    private readonly logger = new Logger(ShiftLifecycleCronService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsService: NotificationsService,
    ) { }

    /**
     * 1. 2-HOUR PRE-SHIFT REMINDER DISPATCHER
     * Runs every 15 minutes. Scans for published shifts starting in 105–120 minutes
     * that have not yet had a reminder sent.
     */
    @Cron(CronExpression.EVERY_10_MINUTES)
    async handleUpcomingShiftReminders() {
        this.logger.log('Executing automated shift reminder sweep...');

        const now = new Date();
        const windowStart = new Date(now.getTime() + 105 * 60 * 1000); // Now + 1h 45m
        const windowEnd = new Date(now.getTime() + 120 * 60 * 1000);   // Now + 2h 00m

        const upcomingShifts = await this.prisma.shift.findMany({
            where: {
                status: 'published',
                assignedUserId: { not: null },
                reminderSent: false,
                startTime: {
                    gte: windowStart,
                    lte: windowEnd,
                },
            },
            include: {
                location: { select: { name: true } },
            },
        });

        if (upcomingShifts.length === 0) {
            return;
        }

        this.logger.log(`Found ${upcomingShifts.length} upcoming shift(s) requiring reminders.`);

        for (const shift of upcomingShifts) {
            // Enqueue the BullMQ job immediately
            await this.notificationsService.queueShiftReminder(
                {
                    shiftId: shift.id,
                    userId: shift.assignedUserId!,
                    startTime: shift.startTime.toISOString(),
                    locationName: shift.location.name,
                },
                0, // Execute immediately since the shift is already ~2 hours out
            );

            // Mark reminderSent to prevent duplicate notifications
            await this.prisma.shift.update({
                where: { id: shift.id },
                data: { reminderSent: true },
            });
        }
    }

    /**
     * 2. ABANDONED CLOCK-IN CLEANER
     * Runs every hour. If an employee clocks in and forgets to clock out,
     * active entries older than 16 hours are auto-flagged for manager review.
     */
    @Cron(CronExpression.EVERY_HOUR)
    async handleAbandonedClockIns() {
        this.logger.log('Checking for abandoned active time entries...');

        const threshold = new Date(Date.now() - 16 * 60 * 60 * 1000); // 16 hours ago

        const staleEntries = await this.prisma.timeEntry.findMany({
            where: {
                status: 'active',
                clockOut: null,
                clockIn: { lte: threshold },
            },
            include: {
                shift: true,
            },
        });

        if (staleEntries.length === 0) {
            return;
        }

        this.logger.warn(`Found ${staleEntries.length} abandoned punch(es). Auto-flagging for manager review.`);

        for (const entry of staleEntries) {
            // Auto-set clockOut to scheduled shift end if available, otherwise clockIn + 8 hours
            const fallbackEnd = entry.shift?.endTime ?? new Date(entry.clockIn.getTime() + 8 * 60 * 60 * 1000);

            await this.prisma.timeEntry.update({
                where: { id: entry.id },
                data: {
                    clockOut: fallbackEnd,
                    status: 'flagged',
                    notes: `${entry.notes ? entry.notes + ' | ' : ''}SYSTEM: Auto-closed after 16 hours of inactivity. Requires manager review.`,
                },
            });
        }
    }
}