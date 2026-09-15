import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
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
    ApiResponse,
    ApiTags,
    ApiParam,
} from '@nestjs/swagger';
import { TimeOffService } from './time-off.service';
import { CreateTimeOffRequestDto, ReviewTimeOffDto } from './dto/Time-off.dto';

@ApiTags('Time Off')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('time-off')
export class TimeOffController {
    constructor(private readonly timeOffService: TimeOffService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Request time off',
        description: 'Creates a pending time-off request for the authenticated employee at a given location.',
    })
    @ApiResponse({ status: 201, description: 'Request created.' })
    @ApiResponse({ status: 409, description: 'Overlaps an existing pending/approved request.' })
    createRequest(@Req() req: any, @Body() dto: CreateTimeOffRequestDto) {
        return this.timeOffService.createRequest(req.user.id, dto);
    }

    @Get('me')
    @ApiOperation({
        summary: 'List my time-off requests',
        description: "Returns the authenticated employee's own time-off history, newest first.",
    })
    listMine(@Req() req: any) {
        return this.timeOffService.listMine(req.user.id);
    }

    @Delete(':requestId')
    @ApiOperation({
        summary: 'Cancel a pending request',
        description: 'Withdraws a request the employee made themselves, only while it is still pending.',
    })
    @ApiParam({ name: 'requestId', type: 'string', description: 'TimeOffRequest UUID' })
    cancelRequest(
        @Req() req: any,
        @Param('requestId', new ParseUUIDPipe()) requestId: string,
    ) {
        return this.timeOffService.cancelRequest(req.user.id, requestId);
    }

    @Get('locations/:locationId/pending')
    @ApiOperation({
        summary: 'List pending time-off requests for a location',
        description: 'Manager-facing queue of requests awaiting review at this location.',
    })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    getPendingForLocation(
        @Req() req: any,
        @Param('locationId', new ParseUUIDPipe()) locationId: string,
    ) {
        return this.timeOffService.listPendingForLocation(req.user.id, locationId);
    }

    @Put(':requestId/review')
    @ApiOperation({
        summary: 'Approve or deny a time-off request',
        description: 'Manager review action; records an audit log entry and notifies the requesting employee.',
    })
    @ApiParam({ name: 'requestId', type: 'string', description: 'TimeOffRequest UUID' })
    reviewRequest(
        @Req() req: any,
        @Param('requestId', new ParseUUIDPipe()) requestId: string,
        @Body() dto: ReviewTimeOffDto,
    ) {
        return this.timeOffService.reviewRequest(req.user.id, requestId, dto);
    }
}