import { Module } from '@nestjs/common';
import { ShiftLifecycleCronService } from './shift-lifecycle.cron';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../../prisma.service';

@Module({
    imports: [NotificationsModule],
    providers: [ShiftLifecycleCronService, PrismaService],
})
export class CronModule { }