import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import Redis from 'ioredis';

export type ScopeType = 'organization' | 'location';

export interface PermissionScope {
  scopeType: ScopeType;
  scopeId: string;
}

const CACHE_TTL_SECONDS = 300; // 5 min — permission assignments change rarely

@Injectable()
export class PermissionService {
  private redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  /**
   * The single gate every protected action goes through.
   * Never check user.role directly anywhere else in the codebase — always call this.
   */
  async can(userId: string, permissionKey: string, scope: PermissionScope): Promise<boolean> {
    const permissions = await this.getPermissionsForScope(userId, scope);
    return permissions.includes(permissionKey);
  }

  private async getPermissionsForScope(userId: string, scope: PermissionScope): Promise<string[]> {
    const cacheKey = `perms:${userId}:${scope.scopeType}:${scope.scopeId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Org-level roles cascade down to every location under that org, so pull both:
    // roles scoped directly to this location, AND roles scoped to its parent org.
    const location = scope.scopeType === 'location'
      ? await this.prisma.location.findUnique({ where: { id: scope.scopeId } })
      : null;

    const orConditions: any[] = [
      { scopeType: scope.scopeType, scopeId: scope.scopeId },
    ];
    if (location) {
      orConditions.push({ scopeType: 'organization', scopeId: location.orgId });
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, OR: orConditions },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    const permissions = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissions.add(rp.permission.key);
      }
    }

    const result = Array.from(permissions);
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    return result;
  }

  /** Call this whenever a user's roles change so stale cache doesn't linger. */
  async invalidateCache(userId: string): Promise<void> {
    const keys = await this.redis.keys(`perms:${userId}:*`);
    if (keys.length) await this.redis.del(...keys);
  }
}
