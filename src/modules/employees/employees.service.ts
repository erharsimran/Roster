import {
    Injectable,
    NotFoundException,
    ConflictException,
    ForbiddenException,
    InternalServerErrorException,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PermissionService } from '../../common/services/permission.service';
import {
    CreateEmployeeDto,
    UpdateEmployeeProfileDto,
    AssignPositionsDto,
} from './dto/employee.dto';
import { ScopeType } from '@prisma/client';

@Injectable()
export class EmployeesService {
    private readonly logger = new Logger(EmployeesService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionService: PermissionService,
    ) { }

    /**
     * Verifies the caller holds 'users:manage' for the org. Was previously
     * hardcoded to role names ['Owner','Admin'] — meant a custom role granted
     * 'users:manage' via the organization-roles module could never actually
     * onboard/offboard employees. Now checks the real permission.
     */
    private async assertAdminAccess(callerUserId: string, orgId: string) {
        const allowed = await this.permissionService.can(callerUserId, 'users:manage', {
            scopeType: 'organization',
            scopeId: orgId,
        });

        if (!allowed) {
            throw new ForbiddenException('You do not have permission to manage employees in this organization');
        }
    }

    async create(callerUserId: string, dto: CreateEmployeeDto) {
        await this.assertAdminAccess(callerUserId, dto.orgId);

        // 1. Verify the scope target exists (Organization or Location)
        if (dto.scopeType === 'organization') {
            if (dto.scopeId !== dto.orgId) {
                throw new BadRequestException('Organization scopeId must match the orgId');
            }
        } else {
            const location = await this.prisma.location.findFirst({
                where: { id: dto.scopeId, orgId: dto.orgId },
            });
            if (!location) {
                throw new NotFoundException(`Location ${dto.scopeId} not found in this organization`);
            }
        }

        // 2. Resolve Role
        const role = await this.prisma.role.findUnique({
            where: {
                orgId_name: {
                    orgId: dto.orgId,
                    name: dto.roleName.trim(),
                },
            },
        });

        if (!role) {
            throw new NotFoundException(`Role "${dto.roleName}" does not exist in this organization`);
        }

        // 3. Verify positions belong to this organization
        if (dto.positionIds && dto.positionIds.length > 0) {
            const matchingPositions = await this.prisma.position.count({
                where: {
                    id: { in: dto.positionIds },
                    orgId: dto.orgId,
                },
            });

            if (matchingPositions !== dto.positionIds.length) {
                throw new BadRequestException('One or more selected positions do not belong to this organization');
            }
        }

        try {
            return await this.prisma.$transaction(async (tx) => {
                // 4. Create or fetch user by email
                let user = await tx.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });

                if (!user) {
                    user = await tx.user.create({
                        data: {
                            email: dto.email.trim().toLowerCase(),
                            fullName: dto.fullName.trim(),
                            phone: dto.phone?.trim() || null,
                        },
                    });
                } else {
                    const existingRole = await tx.userRole.findUnique({
                        where: {
                            userId_roleId_scopeType_scopeId: {
                                userId: user.id,
                                roleId: role.id,
                                scopeType: dto.scopeType,
                                scopeId: dto.scopeId,
                            },
                        },
                    });

                    if (existingRole) {
                        throw new ConflictException(`User already holds role "${role.name}" for this scope`);
                    }
                }

                // 5. Create user_role assignment
                const userRole = await tx.userRole.create({
                    data: {
                        userId: user.id,
                        roleId: role.id,
                        scopeType: dto.scopeType,
                        scopeId: dto.scopeId,
                    },
                    include: { role: true },
                });

                // 6. Assign Positions
                if (dto.positionIds && dto.positionIds.length > 0) {
                    const positionLinks = dto.positionIds.map((posId) => ({
                        userId: user.id,
                        positionId: posId,
                    }));

                    await tx.employeePosition.createMany({
                        data: positionLinks,
                        skipDuplicates: true,
                    });
                }

                // 7. Audit log entry
                await tx.auditLog.create({
                    data: {
                        orgId: dto.orgId,
                        userId: callerUserId,
                        action: 'employee.onboard',
                        resourceType: 'user',
                        resourceId: user.id,
                        metadata: {
                            employeeEmail: user.email,
                            assignedRole: role.name,
                            scopeType: dto.scopeType,
                            scopeId: dto.scopeId,
                            positionsAssigned: dto.positionIds || [],
                        },
                    },
                });

                return {
                    user: {
                        id: user.id,
                        email: user.email,
                        fullName: user.fullName,
                        phone: user.phone,
                    },
                    roleAssignment: {
                        role: userRole.role.name,
                        scopeType: userRole.scopeType,
                        scopeId: userRole.scopeId,
                    },
                };
            });
        } catch (error: any) {
            this.logger.error(`Failed to onboard employee: ${error.message}`, error.stack);
            if (
                error instanceof ConflictException ||
                error instanceof BadRequestException ||
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }
            throw new InternalServerErrorException('Failed to onboard employee');
        }
    }

    async findAllByOrg(callerUserId: string, orgId: string) {
        await this.assertAdminAccess(callerUserId, orgId);

        const [users, locations] = await Promise.all([
            this.prisma.user.findMany({
                where: {
                    userRoles: {
                        some: {
                            role: { orgId },
                        },
                    },
                },
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    phone: true,
                    createdAt: true,
                    userRoles: {
                        where: { role: { orgId } },
                        select: {
                            scopeType: true,
                            scopeId: true,
                            role: { select: { id: true, name: true } },
                        },
                    },
                    employeePositions: {
                        where: { position: { orgId } },
                        select: {
                            position: { select: { id: true, name: true, hourlyRate: true } },
                        },
                    },
                },
                orderBy: { fullName: 'asc' },
            }),
            this.prisma.location.findMany({
                where: { orgId },
                select: { id: true, name: true },
            }),
        ]);

        const locationMap = new Map(locations.map((loc) => [loc.id, loc.name]));

        // Shape output to support both nested structures and direct flat field lookups
        return users.map((user) => {
            const primaryRole = user.userRoles[0];
            const scopeName =
                primaryRole?.scopeType === 'organization'
                    ? 'All Locations'
                    : locationMap.get(primaryRole?.scopeId) || 'Unknown Location';

            return {
                ...user,
                roleName: primaryRole?.role?.name ?? 'Employee',
                scopeType: primaryRole?.scopeType ?? 'organization',
                scopeName,
                positions: user.employeePositions.map((ep) => ep.position),
            };
        });
    }

    async updateProfile(
        callerUserId: string,
        orgId: string,
        targetUserId: string,
        dto: UpdateEmployeeProfileDto,
    ) {
        await this.assertAdminAccess(callerUserId, orgId);

        const targetUser = await this.prisma.user.findUnique({
            where: { id: targetUserId },
            include: {
                userRoles: {
                    where: { role: { orgId } },
                    include: { role: true },
                },
            },
        });

        if (!targetUser || targetUser.userRoles.length === 0) {
            throw new NotFoundException('Employee not found in this organization');
        }

        return this.prisma.$transaction(async (tx) => {
            // 1. Update basic user profile attributes
            const updatedUser = await tx.user.update({
                where: { id: targetUserId },
                data: {
                    ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
                    ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
                },
                select: { id: true, email: true, fullName: true, phone: true },
            });

            // 2. Reassign role or scope if provided
            if (dto.roleName || dto.scopeType || dto.scopeId) {
                const currentAssignment = targetUser.userRoles[0];

                let targetRoleId = currentAssignment.roleId;
                if (dto.roleName) {
                    const newRole = await tx.role.findUnique({
                        where: { orgId_name: { orgId, name: dto.roleName.trim() } },
                    });
                    if (!newRole) {
                        throw new NotFoundException(`Role "${dto.roleName}" does not exist in this organization`);
                    }
                    targetRoleId = newRole.id;
                }

                const targetScopeType = (dto.scopeType as ScopeType) || currentAssignment.scopeType;
                let targetScopeId = dto.scopeId || currentAssignment.scopeId;

                if (targetScopeType === 'organization') {
                    targetScopeId = orgId;
                } else if (dto.scopeId) {
                    const loc = await tx.location.findFirst({ where: { id: dto.scopeId, orgId } });
                    if (!loc) throw new NotFoundException(`Location ${dto.scopeId} not found`);
                }

                // Delete previous organization-scoped role and replace with updated one
                await tx.userRole.delete({
                    where: { id: currentAssignment.id },
                });

                await tx.userRole.create({
                    data: {
                        userId: targetUserId,
                        roleId: targetRoleId,
                        scopeType: targetScopeType,
                        scopeId: targetScopeId,
                    },
                });
            }

            // 3. Audit trail
            await tx.auditLog.create({
                data: {
                    orgId,
                    userId: callerUserId,
                    action: 'employee.profile_updated',
                    resourceType: 'user',
                    resourceId: targetUserId,
                    metadata: { changes: { ...dto } },
                },
            });

            return updatedUser;
        });
    }

    async offboard(callerUserId: string, orgId: string, targetUserId: string) {
        await this.assertAdminAccess(callerUserId, orgId);

        if (callerUserId === targetUserId) {
            throw new BadRequestException('You cannot offboard yourself from the organization');
        }

        // Check if employee exists in this org
        const targetRoles = await this.prisma.userRole.findMany({
            where: {
                userId: targetUserId,
                role: { orgId },
            },
            include: { role: true },
        });

        if (targetRoles.length === 0) {
            throw new NotFoundException('Employee not found in this organization');
        }

        // Prevent offboarding the last Owner
        const isOwner = targetRoles.some((ur) => ur.role.name === 'Owner');
        if (isOwner) {
            const ownerCount = await this.prisma.userRole.count({
                where: {
                    role: { orgId, name: 'Owner' },
                },
            });
            if (ownerCount <= 1) {
                throw new BadRequestException('Cannot offboard the sole Owner of the organization');
            }
        }

        return this.prisma.$transaction(async (tx) => {
            // 1. Remove all roles associated with this tenant
            await tx.userRole.deleteMany({
                where: {
                    userId: targetUserId,
                    role: { orgId },
                },
            });

            // 2. Remove position links for this tenant's positions
            const orgPositions = await tx.position.findMany({
                where: { orgId },
                select: { id: true },
            });
            const orgPositionIds = orgPositions.map((p) => p.id);

            await tx.employeePosition.deleteMany({
                where: {
                    userId: targetUserId,
                    positionId: { in: orgPositionIds },
                },
            });

            // 3. Audit log
            await tx.auditLog.create({
                data: {
                    orgId,
                    userId: callerUserId,
                    action: 'employee.offboard',
                    resourceType: 'user',
                    resourceId: targetUserId,
                    metadata: {
                        revokedRoles: targetRoles.map((r) => r.role.name),
                    },
                },
            });

            return { success: true, message: 'Employee offboarded successfully' };
        });
    }

    async assignPositions(
        callerUserId: string,
        orgId: string,
        targetUserId: string,
        dto: AssignPositionsDto,
    ) {
        await this.assertAdminAccess(callerUserId, orgId);

        const validPositions = await this.prisma.position.findMany({
            where: {
                id: { in: dto.positionIds },
                orgId,
            },
            select: { id: true },
        });

        if (validPositions.length !== dto.positionIds.length) {
            throw new BadRequestException('One or more selected positions are invalid for this organization');
        }

        return this.prisma.$transaction(async (tx) => {
            const existingOrgPositions = await tx.position.findMany({
                where: { orgId },
                select: { id: true },
            });
            const orgPositionIds = existingOrgPositions.map((p) => p.id);

            await tx.employeePosition.deleteMany({
                where: {
                    userId: targetUserId,
                    positionId: { in: orgPositionIds },
                },
            });

            const positionLinks = dto.positionIds.map((posId) => ({
                userId: targetUserId,
                positionId: posId,
            }));

            await tx.employeePosition.createMany({
                data: positionLinks,
            });

            await tx.auditLog.create({
                data: {
                    orgId,
                    userId: callerUserId,
                    action: 'employee.positions_reassigned',
                    resourceType: 'user',
                    resourceId: targetUserId,
                    metadata: { assignedPositions: dto.positionIds },
                },
            });

            return { success: true, assignedPositionsCount: dto.positionIds.length };
        });
    }
}