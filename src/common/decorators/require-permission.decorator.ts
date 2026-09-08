import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Usage:
 *   @RequirePermission('schedule:publish')
 *   @Post(':locationId/publish')
 *   publishSchedule(@Param('locationId') locationId: string) { ... }
 *
 * The guard reads `locationId` (or `orgId`) from route params automatically —
 * see PermissionGuard for the scope-resolution convention.
 */
export const RequirePermission = (permissionKey: string) =>
  SetMetadata(PERMISSION_KEY, permissionKey);
