export enum RealtimeEvent {
    SHIFT_CREATED = 'shift:created',
    SHIFT_MOVED = 'shift:moved',
    SHIFT_DELETED = 'shift:deleted',
    SHIFT_CLAIMED = 'shift:claimed',
    ROSTER_PUBLISHED = 'roster:published',
    TIME_ENTRY_PUNCHED = 'time_entry:punched',
    COMPLIANCE_ALERT = 'compliance:alert',
}

export const getRealtimeLocationRoom = (locationId: string): string => `location:${locationId}`;
export const getRealtimeOrgRoom = (orgId: string): string => `org:${orgId}`;