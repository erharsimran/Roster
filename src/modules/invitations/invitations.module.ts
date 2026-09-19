// src/modules/invitations/invitations.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { PlatformController } from '../platform/platform.controller';
import { PlatformService } from '../platform/platform.service';
import { PrismaService } from '../../prisma.service';
import { PermissionService } from '../../common/services/permission.service';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

@Module({
    imports: [
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'defaultSecretKey',
            signOptions: { expiresIn: '7d' },
        }),
    ],
    controllers: [InvitationsController, PlatformController],
    providers: [
        InvitationsService,
        PlatformService,
        PrismaService,
        PermissionService,
        SuperAdminGuard,
    ],
    exports: [InvitationsService, PlatformService],
})
export class InvitationsModule { }