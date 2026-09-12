import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@Injectable()
export class OrganizationRolesService {
    constructor(private readonly prisma: PrismaService) { }

    async listPermissions() {
        return this.prisma.permission.findMany({
            orderBy: { key: 'asc' },
        });
    }

    async listOrgRoles(orgId: string) {
        const roles = await this.prisma.role.findMany({
            where: { orgId },
            include: {
                rolePermissions: {
                    include: {
                        permission: true,
                    },
                },
                lastUpdatedByUser: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
                _count: {
                    select: {
                        userRoles: true,
                    },
                },
            },
            orderBy: [{ isSystemRole: 'desc' }, { name: 'asc' }],
        });

        return roles.map((role) => ({
            id: role.id,
            orgId: role.orgId,
            name: role.name,
            isSystemRole: role.isSystemRole,
            userCount: role._count.userRoles,
            lastUpdatedBy: role.lastUpdatedByUser,
            permissions: role.rolePermissions.map((rp) => rp.permission),
        }));
    }

    async createRole(orgId: string, userId: string, dto: CreateRoleDto) {
        const existing = await this.prisma.role.findUnique({
            where: {
                orgId_name: {
                    orgId,
                    name: dto.name.trim(),
                },
            },
        });

        if (existing) {
            throw new ConflictException(
                `Role '${dto.name}' already exists in this organization`,
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const role = await tx.role.create({
                data: {
                    orgId,
                    name: dto.name.trim(),
                    isSystemRole: false,
                    lastUpdatedBy: userId,
                },
            });

            if (dto.permissionIds && dto.permissionIds.length > 0) {
                await tx.rolePermission.createMany({
                    data: dto.permissionIds.map((permissionId) => ({
                        roleId: role.id,
                        permissionId,
                    })),
                });
            }

            return tx.role.findUnique({
                where: { id: role.id },
                include: {
                    rolePermissions: {
                        include: { permission: true },
                    },
                    lastUpdatedByUser: {
                        select: { id: true, fullName: true, email: true },
                    },
                },
            });
        });
    }

    async updateRole(
        orgId: string,
        roleId: string,
        userId: string,
        dto: UpdateRoleDto,
    ) {
        const role = await this.prisma.role.findFirst({
            where: { id: roleId, orgId },
        });

        if (!role) {
            throw new NotFoundException('Role not found within this organization');
        }

        if (role.isSystemRole && dto.name && dto.name !== role.name) {
            throw new ForbiddenException('Cannot rename system preset roles');
        }

        return this.prisma.$transaction(async (tx) => {
            const updateData: any = {
                lastUpdatedBy: userId,
            };

            if (dto.name && dto.name !== role.name) {
                updateData.name = dto.name.trim();
            }

            await tx.role.update({
                where: { id: role.id },
                data: updateData,
            });

            if (dto.permissionIds !== undefined) {
                if (role.name.toLowerCase() === 'owner') {
                    throw new ForbiddenException('Cannot modify permissions for the primary Owner role');
                }

                await tx.rolePermission.deleteMany({
                    where: { roleId: role.id },
                });

                if (dto.permissionIds.length > 0) {
                    await tx.rolePermission.createMany({
                        data: dto.permissionIds.map((permissionId) => ({
                            roleId: role.id,
                            permissionId,
                        })),
                    });
                }
            }

            return tx.role.findUnique({
                where: { id: role.id },
                include: {
                    rolePermissions: {
                        include: { permission: true },
                    },
                    lastUpdatedByUser: {
                        select: { id: true, fullName: true, email: true },
                    },
                },
            });
        });
    }

    async deleteRole(orgId: string, roleId: string) {
        const role = await this.prisma.role.findFirst({
            where: { id: roleId, orgId },
            include: {
                _count: {
                    select: { userRoles: true },
                },
            },
        });

        if (!role) {
            throw new NotFoundException('Role not found within this organization');
        }

        if (role.isSystemRole) {
            throw new ForbiddenException('System preset roles cannot be deleted');
        }

        if (role._count.userRoles > 0) {
            throw new BadRequestException(
                `Cannot delete role '${role.name}': currently assigned to ${role._count.userRoles} team member(s). Reassign them first.`,
            );
        }

        await this.prisma.role.delete({
            where: { id: role.id },
        });

        return { success: true, message: `Role '${role.name}' deleted successfully` };
    }
}