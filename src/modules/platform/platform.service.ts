import {
    Injectable,
    ConflictException,
    Logger,
    InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateOrgOwnerInviteDto } from '../invitations/dto/invitation.dto';
import * as crypto from 'crypto';

@Injectable()
export class PlatformService {
    private readonly logger = new Logger(PlatformService.name);

    constructor(private readonly prisma: PrismaService) { }

    async inviteOrgOwner(userId: string, dto: CreateOrgOwnerInviteDto) {
        const email = dto.email.toLowerCase().trim();

        const existingUser = await this.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            throw new ConflictException(`User with email "${email}" already exists`);
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Days

        try {
            const invitation = await this.prisma.invitation.create({
                data: {
                    email,
                    token,
                    type: 'PLATFORM_ORG_OWNER',
                    status: 'pending',
                    invitedById: userId,
                    expiresAt,
                },
            });

            const inviteLink = `${process.env.APP_FRONTEND_URL || 'http://localhost:3000'}/onboarding/claim?token=${token}`;

            return {
                id: invitation.id,
                email: invitation.email,
                inviteLink,
                expiresAt: invitation.expiresAt,
            };
        } catch (error: any) {
            this.logger.error(`Failed to create platform invite: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Failed to create platform invite');
        }
    }

    async listAllOrganizations() {
        return this.prisma.organization.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: {
                        locations: true,
                        positions: true,
                        roles: true,
                    },
                },
            },
        });
    }
}