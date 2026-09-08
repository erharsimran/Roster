import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { PrismaService } from '../../prisma.service';
import { PermissionService } from '../../common/services/permission.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' })],
  controllers: [SchedulingController],
  providers: [SchedulingService, PrismaService, PermissionService],
})
export class SchedulingModule {}
