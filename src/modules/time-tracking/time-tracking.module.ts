import { Module } from '@nestjs/common';
import { TimeTrackingController } from './time-tracking.controller';
import { TimeTrackingService } from './time-tracking.service';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [TimeTrackingController],
    providers: [TimeTrackingService, PrismaService],
    exports: [TimeTrackingService],
})
export class TimeTrackingModule { }