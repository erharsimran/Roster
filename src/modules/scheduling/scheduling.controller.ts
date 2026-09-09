import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { SchedulingService } from './scheduling.service';
import { SchedulingGridService } from './scheduling-grid.service';
import { CreateShiftDto, PublishRosterDto } from './dto/shift.dto';
import {
  GetScheduleGridDto,
  MoveShiftDto,
  DuplicateShiftDto,
  UpdateLocationOperatingHoursDto,
  QuickDropShiftDto,
  CopyWeekDto,
} from './dto/schedule-grid.dto';

@ApiTags('Scheduling')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('scheduling')
export class SchedulingController {
  constructor(
    private readonly schedulingService: SchedulingService,
    private readonly gridService: SchedulingGridService,
  ) { }

  @Post('shifts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new shift',
    description:
      'Creates a draft shift in scheduled status with cross-location conflict validation and max duration verification.',
  })
  @ApiResponse({ status: 201, description: 'Shift successfully created in scheduled state.' })
  @ApiResponse({ status: 400, description: 'Validation failure or duration exceeds 24 hours.' })
  @ApiResponse({ status: 403, description: 'User lacks authorization for this location.' })
  @ApiResponse({ status: 404, description: 'Location, position, or assigned user does not exist.' })
  @ApiResponse({ status: 409, description: 'Employee already has an overlapping shift.' })
  create(@Req() req: any, @Body() dto: CreateShiftDto) {
    return this.schedulingService.create(req.user.id, dto);
  }

  @Get('locations/:locationId/shifts')
  @ApiOperation({
    summary: 'List raw shifts by location and date range',
    description: 'Retrieves flat shift records filtered by date range for a specific location.',
  })
  @ApiParam({ name: 'locationId', type: 'string', description: 'Target Location UUID' })
  @ApiQuery({ name: 'startDate', type: 'string', required: false, example: '2026-09-14T00:00:00Z' })
  @ApiQuery({ name: 'endDate', type: 'string', required: false, example: '2026-09-20T23:59:59Z' })
  @ApiResponse({ status: 200, description: 'Flat list of shifts for the window.' })
  findByLocation(
    @Req() req: any,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.schedulingService.findByLocation(req.user.id, locationId, startDate, endDate);
  }

  @Post('locations/:locationId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish location roster',
    description: 'Transitions all scheduled shifts within a date window to published status.',
  })
  @ApiParam({ name: 'locationId', type: 'string', description: 'Target Location UUID' })
  @ApiResponse({ status: 200, description: 'Roster published successfully.' })
  publishRoster(
    @Req() req: any,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Body() dto: PublishRosterDto,
  ) {
    return this.schedulingService.publishRoster(req.user.id, locationId, dto);
  }

  @Get('locations/:locationId/grid')
  @ApiOperation({
    summary: 'Fetch schedule grid matrix (Sling-style)',
    description:
      'Returns pre-computed schedule rows grouped by employee or position, with real-time labor totals, open shifts, overtime, and leadership compliance flags.',
  })
  @ApiParam({ name: 'locationId', type: 'string', description: 'Target Location UUID' })
  @ApiResponse({ status: 200, description: 'Pre-computed grid payload.' })
  getGrid(
    @Req() req: any,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Query() query: GetScheduleGridDto,
  ) {
    return this.gridService.getScheduleGrid(req.user.id, locationId, query);
  }

  @Patch('shifts/:id/move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Drag & drop shift move',
    description: 'Reassigns a shift to a new user, position, date, or time slot with overlap validation.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Target Shift UUID' })
  @ApiResponse({ status: 200, description: 'Shift moved successfully.' })
  @ApiResponse({ status: 409, description: 'Target user already scheduled at another location.' })
  moveShift(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MoveShiftDto,
  ) {
    return this.gridService.moveShift(req.user.id, id, dto);
  }

  @Post('shifts/:id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Duplicate shift',
    description: 'Copies a shift template to a target date, time, or employee as a draft shift.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Source Shift UUID' })
  @ApiResponse({ status: 201, description: 'Shift duplicated successfully.' })
  duplicateShift(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DuplicateShiftDto,
  ) {
    return this.gridService.duplicateShift(req.user.id, id, dto);
  }

  @Put('locations/:locationId/operating-hours')
  @ApiOperation({
    summary: 'Configure store operating hours & leadership staffing rule',
    description: 'Sets daily open/close hours and configures whether a Lead/Manager must be on duty continuously.',
  })
  updateOperatingHours(
    @Req() req: any,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Body() dto: UpdateLocationOperatingHoursDto,
  ) {
    return this.gridService.updateOperatingHours(req.user.id, locationId, dto);
  }

  @Post('locations/:locationId/quick-drop')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Quick-drop employee onto calendar day',
    description: 'Instantly creates a shift starting at store open time for a date by dragging an employee chip onto a day.',
  })
  quickDrop(
    @Req() req: any,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Body() dto: QuickDropShiftDto,
  ) {
    return this.gridService.quickDrop(req.user.id, locationId, dto);
  }

  @Post('locations/:locationId/copy-week')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '1-Click Copy Week Schedule',
    description: 'Clones entire previous week roster into the future week in draft status, checking for conflicts.',
  })
  copyWeek(
    @Req() req: any,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Body() dto: CopyWeekDto,
  ) {
    return this.schedulingService.copyWeek(req.user.id, locationId, dto);
  }
}