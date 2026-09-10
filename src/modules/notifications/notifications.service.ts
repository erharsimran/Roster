import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
    NOTIFICATIONS_QUEUE,
    NotificationJobType,
    RosterPublishedJobPayload,
    ShiftTradeRequestedJobPayload,
    ShiftTradeResolvedJobPayload,
    ShiftReminderJobPayload,
} from './notifications.constants';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        @InjectQueue(NOTIFICATIONS_QUEUE)
        private readonly notificationsQueue: Queue,
    ) { }

    /**
     * Dispatches a broadcast job when a location roster is published.
     */
    async queueRosterPublishedNotification(payload: RosterPublishedJobPayload) {
        this.logger.log(`Enqueuing roster published alert for location ${payload.locationId}`);
        return this.notificationsQueue.add(
            NotificationJobType.ROSTER_PUBLISHED,
            payload,
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: true,
            },
        );
    }

    /**
     * Dispatches an alert when a shift swap or drop is created.
     */
    async queueTradeRequestedNotification(payload: ShiftTradeRequestedJobPayload) {
        return this.notificationsQueue.add(
            NotificationJobType.SHIFT_TRADE_REQUESTED,
            payload,
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1500 },
                removeOnComplete: true,
            },
        );
    }

    /**
     * Dispatches an alert when a manager resolves a trade.
     */
    async queueTradeResolvedNotification(payload: ShiftTradeResolvedJobPayload) {
        return this.notificationsQueue.add(
            NotificationJobType.SHIFT_TRADE_RESOLVED,
            payload,
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1500 },
                removeOnComplete: true,
            },
        );
    }

    /**
     * Schedules a delayed shift reminder (e.g., 2 hours prior to shift start).
     */
    async queueShiftReminder(payload: ShiftReminderJobPayload, delayMs: number) {
        return this.notificationsQueue.add(
            NotificationJobType.UPCOMING_SHIFT_REMINDER,
            payload,
            {
                delay: Math.max(0, delayMs),
                attempts: 2,
                removeOnComplete: true,
            },
        );
    }
}