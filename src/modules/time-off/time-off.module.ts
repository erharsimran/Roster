import { Module } from '@nestjs/common';
import { TimeOffController } from './time-off.controller';
import { TimeOffService } from './time-off.service';
import { PrismaService } from '../../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
// PermissionService comes from the @Global CommonModule — no import needed here.

@Module({
    imports: [NotificationsModule],
    controllers: [TimeOffController],
    providers: [TimeOffService, PrismaService],
})
export class TimeOffModule { }