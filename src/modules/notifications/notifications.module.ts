import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { PrismaService } from '../../prisma.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';

@Module({
    imports: [
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get<string>('REDIS_HOST', 'localhost'),
                    port: config.get<number>('REDIS_PORT', 6379),
                },
            }),
        }),
        BullModule.registerQueue({
            name: NOTIFICATIONS_QUEUE,
        }),
    ],
    providers: [NotificationsService, NotificationsProcessor, PrismaService],
    exports: [NotificationsService],
})
export class NotificationsModule { }