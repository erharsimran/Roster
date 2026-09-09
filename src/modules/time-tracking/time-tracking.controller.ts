import {
    Controller,
    Get,
    Post,
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
import { TimeTrackingService } from './time-tracking.service';
import {
    ClockInDto,
    ClockOutDto,
    SetLocationCoordinatesDto,
} from './dto/time-tracking.dto';

@ApiTags('Time Tracking & Geofencing')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('time-tracking')
export class TimeTrackingController {
    constructor(private readonly timeTrackingService: TimeTrackingService) { }

    @Put('locations/:locationId/coordinates')
    @ApiOperation({
        summary: 'Configure store GPS coordinates & geofence radius',
        description: 'Sets the latitude, longitude, and allowed proximity radius in meters for a location.',
    })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    setLocationCoordinates(
        @Req() req: any,
        @Param('locationId', new ParseUUIDPipe()) locationId: string,
        @Body() dto: SetLocationCoordinatesDto,
    ) {
        return this.timeTrackingService.setLocationCoordinates(req.user.id, locationId, dto);
    }

    @Post('clock-in')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Mobile GPS Clock-In',
        description: 'Verifies employee coordinates against the location geofence and matches against scheduled shifts.',
    })
    @ApiResponse({ status: 200, description: 'Clock-in recorded. Returns entry status (active or flagged).' })
    @ApiResponse({ status: 409, description: 'Employee is already clocked in.' })
    clockIn(@Req() req: any, @Body() dto: ClockInDto) {
        return this.timeTrackingService.clockIn(req.user.id, dto);
    }

    @Post('clock-out')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Mobile GPS Clock-Out',
        description: 'Concludes active time entry, verifies departure location, and calculates final shift duration.',
    })
    @ApiResponse({ status: 200, description: 'Clock-out recorded.' })
    @ApiResponse({ status: 404, description: 'No active clock-in found.' })
    clockOut(@Req() req: any, @Body() dto: ClockOutDto) {
        return this.timeTrackingService.clockOut(req.user.id, dto);
    }

    @Get('locations/:locationId/timesheets')
    @ApiOperation({
        summary: 'Get store timesheets for manager audit',
        description: 'Returns time entries with duration, labor costs, and geofence/punctuality flags.',
    })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    @ApiQuery({ name: 'startDate', type: 'string', example: '2026-09-01T00:00:00Z' })
    @ApiQuery({ name: 'endDate', type: 'string', example: '2026-09-30T23:59:59Z' })
    getTimesheets(
        @Req() req: any,
        @Param('locationId', new ParseUUIDPipe()) locationId: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
    ) {
        return this.timeTrackingService.getTimesheetsByLocation(req.user.id, locationId, startDate, endDate);
    }

    @Put('entries/:id/approve')
    @ApiOperation({ summary: 'Manager approve flagged or completed timesheet entry' })
    @ApiParam({ name: 'id', type: 'string', description: 'TimeEntry UUID' })
    approveTimeEntry(
        @Req() req: any,
        @Param('id', new ParseUUIDPipe()) id: string,
    ) {
        return this.timeTrackingService.approveTimeEntry(req.user.id, id);
    }
}