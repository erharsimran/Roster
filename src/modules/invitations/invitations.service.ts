import {
    Injectable,
    BadRequestException,
    ConflictException,
    NotFoundException,
    ForbiddenException,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PermissionService } from '../../common/services/permission.service';
import { JwtService } from '@nestjs/jwt';
import {
    ClaimOrgOwnerInviteDto,
    CreateMemberInviteDto,
    ClaimMemberInviteDto,
} from './dto/invitation.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class InvitationsService {
    private readonly logger = new Logger(InvitationsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionService: PermissionService,
        private readonly jwtService: JwtService,
    ) { }

    private generateToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    async validateToken(token: string) {
        const invite = await this.prisma.invitation.findUnique({
            where: { token },
            include: {
                invitedBy: { select: { fullName: true, email: true } },
            },
        });

        if (!invite) {
            throw new NotFoundException('Invitation token is invalid');
        }
        if (invite.status !== 'pending') {
            throw new BadRequestException(`Invitation has already been ${invite.status}`);
        }
        if (new Date() > invite.expiresAt) {
            await this.prisma.invitation.update({
                where: { id: invite.id },
                data: { status: 'expired' },
            });
            throw new BadRequestException('Invitation has expired');
        }

        return {
            valid: true,
            email: invite.email,
            type: invite.type,
            orgId: invite.orgId,
            invitedBy: invite.invitedBy.fullName,
        };
    }

    async claimOrgOwnerInvite(dto: ClaimOrgOwnerInviteDto) {
        const invite = await this.prisma.invitation.findUnique({ where: { token: dto.token } });
        if (!invite || invite.status !== 'pending' || invite.type !== 'PLATFORM_ORG_OWNER') {
            throw new BadRequestException('Invalid or inactive organization owner invite token');
        }
        if (new Date() > invite.expiresAt) {
            throw new BadRequestException('Invitation has expired');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const timezone = dto.timezone || 'America/Toronto';

        try {
            return await this.prisma.$transaction(async (tx) => {
                // 1. Organization
                const org = await tx.organization.create({
                    data: {
                        name: dto.organizationName.trim(),
                        timezone,
                    },
                });

                // 2. Primary Location
                const location = await tx.location.create({
                    data: {
                        orgId: org.id,
                        name: dto.primaryLocationName.trim(),
                        timezone,
                        operatingHours: {
                            monday: { isOpen: true, open: '08:00', close: '22:00' },
                            tuesday: { isOpen: true, open: '08:00', close: '22:00' },
                            wednesday: { isOpen: true, open: '08:00', close: '22:00' },
                            thursday: { isOpen: true, open: '08:00', close: '22:00' },
                            friday: { isOpen: true, open: '08:00', close: '22:00' },
                            saturday: { isOpen: true, open: '09:00', close: '22:00' },
                            sunday: { isOpen: false, open: '09:00', close: '18:00' },
                        },
                    },
                });

                // 3. System Roles
                const ownerRole = await tx.role.create({
                    data: {
                        orgId: org.id,
                        name: 'Owner',
                        isSystemRole: true,
                    },
                });

                await tx.role.createMany({
                    data: [
                        { orgId: org.id, name: 'Admin', isSystemRole: true },
                        { orgId: org.id, name: 'Manager', isSystemRole: true },
                        { orgId: org.id, name: 'Employee', isSystemRole: true },
                    ],
                });

                // 4. User
                const user = await tx.user.create({
                    data: {
                        email: invite.email,
                        passwordHash: hashedPassword,
                        fullName: dto.fullName.trim(),
                    },
                });

                // 5. Assign User to Owner in user_roles
                await tx.userRole.create({
                    data: {
                        userId: user.id,
                        roleId: ownerRole.id,
                        scopeType: 'organization',
                        scopeId: org.id,
                    },
                });

                // 6. Mark invite accepted
                await tx.invitation.update({
                    where: { id: invite.id },
                    data: { status: 'accepted' },
                });

                // 7. Issue Session Token
                const accessToken = this.jwtService.sign({
                    sub: user.id,
                    email: user.email,
                    orgId: org.id,
                    role: 'Owner',
                });

                return {
                    accessToken,
                    user: {
                        id: user.id,
                        email: user.email,
                        fullName: user.fullName,
                        role: 'Owner',
                        orgId: org.id,
                        primaryLocationId: location.id,
                    },
                };
            });
        } catch (error: any) {
            this.logger.error(`Error claiming owner invite: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to provision organization workspace');
        }
    }

    async createMemberInvite(callerUserId: string, orgId: string, dto: CreateMemberInviteDto) {
        const allowed = await this.permissionService.can(callerUserId, 'employees:manage', {
            scopeType: 'organization',
            scopeId: orgId,
        });

        if (!allowed) {
            throw new ForbiddenException('You do not have permission to invite employees to this organization');
        }

        const email = dto.email.toLowerCase().trim();

        const existingUser = await this.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            const alreadyMember = await this.prisma.userRole.findFirst({
                where: { userId: existingUser.id, scopeType: dto.scopeType, scopeId: dto.scopeId },
            });
            if (alreadyMember) {
                throw new ConflictException('User is already assigned to this scope');
            }
        }

        const role = await this.prisma.role.findFirst({
            where: { orgId, name: { equals: dto.roleName.trim(), mode: 'insensitive' } },
        });
        if (!role) {
            throw new NotFoundException(`Role "${dto.roleName}" does not exist in this organization`);
        }

        const token = this.generateToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const invitation = await this.prisma.invitation.create({
            data: {
                email,
                token,
                type: 'TENANT_MEMBER',
                status: 'pending',
                orgId,
                roleName: role.name,
                scopeType: dto.scopeType,
                scopeId: dto.scopeId,
                positionIds: dto.positionIds || [],
                invitedById: callerUserId,
                expiresAt,
            },
        });

        const inviteLink = `${process.env.APP_FRONTEND_URL || 'http://localhost:3000'}/invite/accept?token=${token}`;

        return {
            id: invitation.id,
            email: invitation.email,
            inviteLink,
            expiresAt: invitation.expiresAt,
        };
    }

    async claimMemberInvite(dto: ClaimMemberInviteDto) {
        const invite = await this.prisma.invitation.findUnique({ where: { token: dto.token } });
        if (!invite || invite.status !== 'pending' || invite.type !== 'TENANT_MEMBER' || !invite.orgId) {
            throw new BadRequestException('Invalid or inactive member invitation token');
        }
        if (new Date() > invite.expiresAt) {
            throw new BadRequestException('Invitation has expired');
        }

        const role = await this.prisma.role.findFirst({
            where: { orgId: invite.orgId, name: invite.roleName! },
        });
        if (!role) {
            throw new NotFoundException(`Designated role "${invite.roleName}" is no longer configured`);
        }

        const hashedPassword = await bcrypt.hash(dto.password, 10);

        try {
            return await this.prisma.$transaction(async (tx) => {
                let user = await tx.user.findUnique({ where: { email: invite.email } });

                if (!user) {
                    user = await tx.user.create({
                        data: {
                            email: invite.email,
                            passwordHash: hashedPassword,
                            fullName: dto.fullName.trim(),
                            phone: dto.phone || null,
                        },
                    });
                } else if (!user.passwordHash) {
                    user = await tx.user.update({
                        where: { id: user.id },
                        data: {
                            passwordHash: hashedPassword,
                            fullName: dto.fullName.trim() || user.fullName,
                            phone: dto.phone || user.phone,
                        },
                    });
                }

                await tx.userRole.create({
                    data: {
                        userId: user.id,
                        roleId: role.id,
                        scopeType: invite.scopeType!,
                        scopeId: invite.scopeId!,
                    },
                });

                if (invite.positionIds && invite.positionIds.length > 0) {
                    for (const posId of invite.positionIds) {
                        await tx.employeePosition.upsert({
                            where: {
                                userId_positionId: {
                                    userId: user.id,
                                    positionId: posId,
                                },
                            },
                            create: {
                                userId: user.id,
                                positionId: posId,
                            },
                            update: {},
                        });
                    }
                }

                await tx.invitation.update({
                    where: { id: invite.id },
                    data: { status: 'accepted' },
                });

                const accessToken = this.jwtService.sign({
                    sub: user.id,
                    email: user.email,
                    orgId: invite.orgId,
                    role: role.name,
                });

                return {
                    accessToken,
                    user: {
                        id: user.id,
                        email: user.email,
                        fullName: user.fullName,
                        role: role.name,
                        orgId: invite.orgId,
                    },
                };
            });
        } catch (error: any) {
            this.logger.error(`Error claiming member invite: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to accept membership invitation');
        }
    }
}