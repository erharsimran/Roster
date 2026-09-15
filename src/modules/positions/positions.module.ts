import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { PrismaService } from '../../prisma.service';
// PermissionService comes from the @Global CommonModule (see app.module.ts) —
// no import needed here, just declare it as a constructor dependency in the service.

@Module({
  controllers: [PositionsController],
  providers: [PositionsService, PrismaService],
  exports: [PositionsService],
})
export class PositionsModule {}