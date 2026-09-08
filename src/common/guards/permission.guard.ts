import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionService, ScopeType } from '../services/permission.service';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<string>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!requiredPermission) return true; // route isn't permission-gated

    const req = context.switchToHttp().getRequest();
    const user = req.user; // populated by your auth (JWT) guard, which must run first
    if (!user) throw new ForbiddenException('Not authenticated');

    const { scopeType, scopeId } = this.resolveScope(req);

    const allowed = await this.permissionService.can(user.id, requiredPermission, {
      scopeType,
      scopeId,
    });

    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission "${requiredPermission}" for this ${scopeType}`,
      );
    }

    // Fire-and-forget audit write — every permission-gated mutation gets logged automatically.
    // In production, push this onto the job queue instead of awaiting it inline.
    this.prisma.auditLog.create({
      data: {
        orgId: req.orgId ?? scopeId, // resolved org context, set by upstream tenant middleware
        userId: user.id,
        action: requiredPermission,
        resourceType: req.route?.path ?? 'unknown',
        resourceId: req.params?.id ?? null,
        metadata: { method: req.method, params: req.params },
      },
    }).catch(() => {
      /* never let audit-log failure block the actual request */
    });

    return true;
  }

  /**
   * Convention: routes scoped to a location carry `:locationId`, org-wide
   * routes carry `:orgId`. Adjust here if a route needs a different lookup
   * (e.g. resolving locationId from a shiftId param).
   */
  private resolveScope(req: any): { scopeType: ScopeType; scopeId: string } {
    if (req.params?.locationId) {
      return { scopeType: 'location', scopeId: req.params.locationId };
    }
    if (req.params?.orgId) {
      return { scopeType: 'organization', scopeId: req.params.orgId };
    }
    throw new ForbiddenException(
      'Route is permission-gated but has no locationId/orgId param to scope against',
    );
  }
}
