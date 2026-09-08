import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SchedulingService } from './scheduling.service';
import { CreateShiftDto } from './dto/create-shift.dto';

@Controller('locations/:locationId/shifts')
@UseGuards(PermissionGuard) // JWT auth guard runs before this globally — see app.module.ts
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get()
  @RequirePermission('schedule:view')
  listShifts(@Param('locationId') locationId: string) {
    return this.schedulingService.listShiftsForLocation(locationId);
  }

  @Post()
  @RequirePermission('schedule:create')
  createShift(@Param('locationId') locationId: string, @Body() dto: CreateShiftDto) {
    return this.schedulingService.createShift(locationId, dto);
  }

  @Post('publish')
  @RequirePermission('schedule:publish')
  publishSchedule(@Param('locationId') locationId: string) {
    // Publishing enqueues notification fan-out rather than sending synchronously —
    // see time-attendance / messaging modules for the job-queue pattern.
    return this.schedulingService.publishSchedule(locationId);
  }
}
