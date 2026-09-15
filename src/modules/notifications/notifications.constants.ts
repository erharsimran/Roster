export const NOTIFICATIONS_QUEUE = 'notifications';

export enum NotificationJobType {
    ROSTER_PUBLISHED = 'roster.published',
    SHIFT_TRADE_REQUESTED = 'shift.trade_requested',
    SHIFT_TRADE_RESOLVED = 'shift.trade_resolved',
    UPCOMING_SHIFT_REMINDER = 'shift.reminder',
    TIME_OFF_REQUESTED = 'timeoff.requested',
    TIME_OFF_REVIEWED = 'timeoff.reviewed',
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

export interface TimeOffRequestedJobPayload {
    requestId: string;
    userId: string;
    locationId: string;
    locationName: string;
    startDate: string;
    endDate: string;
}

export interface TimeOffReviewedJobPayload {
    requestId: string;
    userId: string;
    status: 'approved' | 'denied';
    reason?: string;
}