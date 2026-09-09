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
import { CreateEmployeeDto, UpdateEmployeeProfileDto, AssignPositionsDto } from './dto/employee.dto';

@Injectable()
export class EmployeesService {
    private readonly logger = new Logger(EmployeesService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Verifies the caller is an Admin or Owner in the target organization.
     */
    private async assertAdminAccess(callerUserId: string, orgId: string) {
        const callerRole = await this.prisma.userRole.findFirst({
            where: {
                userId: callerUserId,
                scopeId: orgId,
                scopeType: 'organization',
            },
            include: { role: true },
        });

        if (!callerRole || !['Owner', 'Admin'].includes(callerRole.role.name)) {
            throw new ForbiddenException('Only Organization Owners and Admins can manage employees');
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
                    // Check if already assigned to this role and scope
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

        return this.prisma.user.findMany({
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
        });
    }

    async assignPositions(
        callerUserId: string,
        orgId: string,
        targetUserId: string,
        dto: AssignPositionsDto,
    ) {
        await this.assertAdminAccess(callerUserId, orgId);

        // Verify all positions belong to the org
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
            // Clear previous positions for this org's scope
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

            // Insert new assignments
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