import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma.service';
import {
    NOTIFICATIONS_QUEUE,
    NotificationJobType,
    RosterPublishedJobPayload,
    ShiftTradeRequestedJobPayload,
    ShiftTradeResolvedJobPayload,
    ShiftReminderJobPayload,
    TimeOffRequestedJobPayload,
    TimeOffReviewedJobPayload,
} from './notifications.constants';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
    private readonly logger = new Logger(NotificationsProcessor.name);

    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing background job: ${job.name} [ID: ${job.id}]`);

        switch (job.name) {
            case NotificationJobType.ROSTER_PUBLISHED:
                return this.handleRosterPublished(job.data as RosterPublishedJobPayload);

            case NotificationJobType.SHIFT_TRADE_REQUESTED:
                return this.handleTradeRequested(job.data as ShiftTradeRequestedJobPayload);

            case NotificationJobType.SHIFT_TRADE_RESOLVED:
                return this.handleTradeResolved(job.data as ShiftTradeResolvedJobPayload);

            case NotificationJobType.UPCOMING_SHIFT_REMINDER:
                return this.handleShiftReminder(job.data as ShiftReminderJobPayload);

            case NotificationJobType.TIME_OFF_REQUESTED:
                return this.handleTimeOffRequested(job.data as TimeOffRequestedJobPayload);

            case NotificationJobType.TIME_OFF_REVIEWED:
                return this.handleTimeOffReviewed(job.data as TimeOffReviewedJobPayload);

            default:
                this.logger.warn(`Unhandled notification job type: ${job.name}`);
                return null;
        }
    }

    private async handleRosterPublished(data: RosterPublishedJobPayload) {
        // Find all scheduled employees within this location's window
        const activeShifts = await this.prisma.shift.findMany({
            where: {
                locationId: data.locationId,
                status: 'published',
                startTime: { gte: new Date(data.startDate), lte: new Date(data.endDate) },
                assignedUserId: { not: null },
            },
            select: {
                assignedUser: { select: { id: true, email: true, fullName: true } },
            },
        });

        const uniqueUsers = Array.from(
            new Map(activeShifts.map((s) => [s.assignedUser!.id, s.assignedUser!])).values(),
        );

        this.logger.log(
            `Dispatched roster publish notification to ${uniqueUsers.length} employee(s) at ${data.locationName}.`,
        );

        return { notifiedCount: uniqueUsers.length };
    }

    private async handleTradeRequested(data: ShiftTradeRequestedJobPayload) {
        if (data.tradeType === 'swap' && data.targetUserId) {
            const recipient = await this.prisma.user.findUnique({
                where: { id: data.targetUserId },
                select: { email: true, fullName: true },
            });
            this.logger.log(`Sent 1-to-1 swap request notification to ${recipient?.fullName} (${recipient?.email})`);
        } else {
            this.logger.log(`Sent shift drop alert to location managers for trade ${data.tradeId}`);
        }
        return { success: true };
    }

    private async handleTradeResolved(data: ShiftTradeResolvedJobPayload) {
        const requester = await this.prisma.user.findUnique({
            where: { id: data.sourceUserId },
            select: { email: true, fullName: true },
        });
        this.logger.log(
            `Notified ${requester?.fullName} that trade ${data.tradeId} was marked ${data.status}.`,
        );
        return { success: true };
    }

    private async handleShiftReminder(data: ShiftReminderJobPayload) {
        const user = await this.prisma.user.findUnique({
            where: { id: data.userId },
            select: { email: true, fullName: true },
        });
        this.logger.log(
            `Sent 2-hour shift reminder to ${user?.fullName} for shift starting at ${data.startTime} at ${data.locationName}.`,
        );
        return { success: true };
    }

    private async handleTimeOffRequested(data: TimeOffRequestedJobPayload) {
        // Notify managers/admins at this location — mirrors handleTradeRequested's
        // "drop to pool" branch, which also targets location management rather
        // than a single recipient.
        const location = await this.prisma.location.findUnique({
            where: { id: data.locationId },
            select: { orgId: true },
        });

        // Note: this targets the three seeded role names for notification
        // purposes only (who to ping), not an authorization decision — the
        // actual review endpoint is gated by the 'timeoff:approve' permission.
        // A custom role granted 'timeoff:approve' won't be picked up here yet;
        // fine for now since notifications are log-only stubs, but worth
        // switching to a permission-based lookup once real delivery is wired up.
        const managers = location
            ? await this.prisma.userRole.findMany({
                where: {
                    OR: [
                        { scopeType: 'location', scopeId: data.locationId },
                        { scopeType: 'organization', scopeId: location.orgId },
                    ],
                    role: { name: { in: ['Owner', 'Admin', 'Manager'] } },
                },
                select: { userId: true },
                distinct: ['userId'],
            })
            : [];

        this.logger.log(
            `Notified ${managers.length} manager(s) at ${data.locationName} of a new time-off request (${data.startDate} - ${data.endDate}).`,
        );
        return { success: true };
    }

    private async handleTimeOffReviewed(data: TimeOffReviewedJobPayload) {
        const user = await this.prisma.user.findUnique({
            where: { id: data.userId },
            select: { email: true, fullName: true },
        });
        this.logger.log(
            `Notified ${user?.fullName} that their time-off request was ${data.status}.`,
        );
        return { success: true };
    }
}