/**
 * Single source of truth for permission keys and what each system role
 * gets by default. Both organization.service.ts (real org bootstrap) and
 * prisma/seed.ts (demo data) import from here so the two paths can't drift
 * out of sync with different key names again.
 */

export const PERMISSIONS = [
  'org:manage',
  'locations:manage',
  'roles:manage',
  'users:manage',
  'positions:manage',
  'shifts:read',
  'shifts:write',
  'shifts:publish',
  'shifts:claim',
  'shifts:swap_approve',
  'time:clock_in_out',
  'time:manage_entries',
  'time:approve_timesheets',
  'timeoff:approve',
  'payroll:read',
  'reports:read',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

/**
 * Default permission grants per system role. Owner/Admin get everything
 * (see design note in permission.service.ts on skipping inheritance graphs —
 * simplest thing that works). Manager and Employee are deliberately narrower;
 * an org can still create custom roles with any subset via the
 * organization-roles module.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  Owner: [...PERMISSIONS],
  Admin: [...PERMISSIONS],
  Manager: [
    'shifts:read',
    'shifts:write',
    'shifts:publish',
    'shifts:swap_approve',
    'time:clock_in_out',
    'time:manage_entries',
    'time:approve_timesheets',
    'timeoff:approve',
    'payroll:read',
    'reports:read',
  ],
  Employee: [
    'shifts:read',
    'shifts:claim',
    'time:clock_in_out',
  ],
};