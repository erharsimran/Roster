import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller';
import { ShiftTradeController } from './shift-trade.controller';
import { SchedulingService } from './scheduling.service';
import { SchedulingGridService } from './scheduling-grid.service';
import { ShiftTradeService } from './shift-trade.service';
import { PrismaService } from '../../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module'; // <-- 1. Import module
@Module({
  imports: [
    NotificationsModule,
  ],
  controllers: [SchedulingController, ShiftTradeController],
  providers: [
    SchedulingService,
    SchedulingGridService,
    ShiftTradeService,
    PrismaService,
  ],
  exports: [
    SchedulingService,
    SchedulingGridService,
    ShiftTradeService,
  ],
})
export class SchedulingModule { }