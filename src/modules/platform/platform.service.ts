import {
    Injectable,
    ConflictException,
    Logger,
    InternalServerErrorException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateOrgOwnerInviteDto } from '../invitations/dto/invitation.dto';
import { getFrontendUrl } from '../../common/config/app-urls.config';
import { NotificationsService } from '../notifications/notifications.service';

import * as crypto from 'crypto';

@Injectable()
export class PlatformService {
    private readonly logger = new Logger(PlatformService.name);

    constructor(private readonly prisma: PrismaService, private readonly notificationsService: NotificationsService) { }

    async inviteOrgOwner(
        dto: { email: string; organizationName?: string },
        invitedById?: string,
    ) {
        if (!invitedById) {
            throw new BadRequestException('Inviter ID could not be identified from the current authentication session.');
        }

        const email = dto.email.toLowerCase().trim();
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Days

        // 1. Create DB invitation record
        const invitation = await this.prisma.invitation.create({
            data: {
                email,
                token,
                type: 'PLATFORM_ORG_OWNER',
                status: 'pending',
              invitedById,
              expiresAt,
          },
      });

        // 2. Build claim URL
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        const claimUrl = `${frontendUrl}/onboarding/claim?token=${invitation.token}`;

        // 3. Push to BullMQ queue
        await this.notificationsService.queueInvitationEmail({
            email,
            organizationName: dto.organizationName,
            claimUrl,
            type: 'PLATFORM_ORG_OWNER',
        });

        return {
          success: true,
          message: 'Platform invitation issued successfully',
          invitationId: invitation.id,
          claimUrl,
      };
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