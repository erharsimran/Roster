import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SetupOrgDto } from './dto/setup-org.dto';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../../common/constants/permissions.constants';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async setupAdminWorkspace(userId: string, dto: SetupOrgDto) {
    // 1. Invariant check: Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} does not exist`);
    }

    // 2. Invariant check: Prevent multi-org collisions for primary bootstrapping
    const existingOrgAssignment = await this.prisma.userRole.findFirst({
      where: {
        userId,
        scopeType: 'organization',
      },
    });

    if (existingOrgAssignment) {
      throw new ConflictException(
        'User is already assigned to an organization workspace. A user can only bootstrap one primary organization.',
      );
    }

    const orgTimezone = dto.timezone || 'UTC';

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // 3. Create the Organization
          const org = await tx.organization.create({
            data: {
              name: dto.organizationName.trim(),
              timezone: orgTimezone,
            },
          });

          // 4. Create the initial Primary Location
          const location = await tx.location.create({
            data: {
              orgId: org.id,
              name: dto.primaryLocationName.trim(),
              timezone: orgTimezone,
              address: dto.address?.trim() || null,
            },
          });

          // 5. Ensure all canonical permissions exist in the database
          for (const permKey of PERMISSIONS) {
            await tx.permission.upsert({
              where: { key: permKey },
              update: {},
              create: { key: permKey },
            });
          }

          const allPermissions = await tx.permission.findMany({
            select: { id: true, key: true },
          });
          const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

          // 6. Provision standard system roles for this Organization
          const rolesToCreate = [
            { name: 'Owner', isSystemRole: true },
            { name: 'Admin', isSystemRole: true },
            { name: 'Manager', isSystemRole: true },
            { name: 'Employee', isSystemRole: true },
          ];

          const roleMap = new Map<string, string>();
          for (const r of rolesToCreate) {
            const role = await tx.role.create({
              data: {
                orgId: org.id,
                name: r.name,
                isSystemRole: r.isSystemRole,
              },
            });
            roleMap.set(r.name, role.id);
          }

          // 7. Bind each system role's default permission set (see
          // DEFAULT_ROLE_PERMISSIONS — previously only Owner/Admin were bound
          // here, leaving Manager and Employee with zero permissions).
          const rolePermissionEntries = rolesToCreate.flatMap((r) => {
            const roleId = roleMap.get(r.name)!;
            const grantedKeys = DEFAULT_ROLE_PERMISSIONS[r.name] ?? [];
            return grantedKeys.map((key) => ({
              roleId,
              permissionId: permissionIdByKey.get(key)!,
            }));
          });

          await tx.rolePermission.createMany({
            data: rolePermissionEntries,
            skipDuplicates: true,
          });

          // 8. Bind the creator as Owner with organization-wide scope
          const userRole = await tx.userRole.create({
            data: {
              userId: user.id,
              roleId: roleMap.get('Owner')!,
              scopeType: 'organization',
              scopeId: org.id,
            },
            include: {
              role: {
                select: { name: true, isSystemRole: true },
              },
            },
          });

          // 9. Mandatory Audit Log entry
          await tx.auditLog.create({
            data: {
              orgId: org.id,
              userId: user.id,
              action: 'organization.bootstrap',
              resourceType: 'organization',
              resourceId: org.id,
              metadata: {
                organizationName: org.name,
                primaryLocationId: location.id,
                assignedRole: userRole.role.name,
                timestamp: new Date().toISOString(),
              },
            },
          });

          return {
            success: true,
            organization: {
              id: org.id,
              name: org.name,
              timezone: org.timezone,
            },
            primaryLocation: {
              id: location.id,
              name: location.name,
              timezone: location.timezone,
              address: location.address,
            },
            membership: {
              role: userRole.role.name,
              scopeType: userRole.scopeType,
              scopeId: userRole.scopeId,
            },
          };
        },
        {
          isolationLevel: 'Serializable',
          timeout: 10000,
        },
      );
    } catch (error: any) {
      this.logger.error(`Failed to bootstrap organization for user ${userId}: ${error.message}`, error.stack);

      if (error?.code === 'P2002') {
        throw new ConflictException('An organization or role with this identifier already exists.');
      }

      if (error instanceof ConflictException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('An unexpected database error occurred during organization creation.');
    }
  }
}