export const NOTIFICATIONS_QUEUE = 'notifications';

export enum NotificationJobType {
    ROSTER_PUBLISHED = 'roster.published',
    SHIFT_TRADE_REQUESTED = 'shift.trade_requested',
    SHIFT_TRADE_RESOLVED = 'shift.trade_resolved',
    UPCOMING_SHIFT_REMINDER = 'shift.reminder',
}

export interface RosterPublishedJobPayload {
    locationId: string;
    locationName: string;
    startDate: string;
    endDate: string;
    publishedCount: number;
}

export interface ShiftTradeRequestedJobPayload {
    tradeId: string;
    tradeType: 'swap' | 'drop';
    sourceUserId: string;
    targetUserId?: string | null;
    shiftId: string;
}

export interface ShiftTradeResolvedJobPayload {
    tradeId: string;
    tradeType: 'swap' | 'drop';
    status: 'approved' | 'rejected';
    sourceUserId: string;
    targetUserId?: string | null;
}

export interface ShiftReminderJobPayload {
    shiftId: string;
    userId: string;
    startTime: string;
    locationName: string;
}