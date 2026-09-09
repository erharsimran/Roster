import {
    Controller,
    Get,
    Post,
    Put,
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
import { ShiftTradeService } from './shift-trade.service';
import { RequestShiftTradeDto, ReviewTradeDto } from './dto/shift-trade.dto';

@ApiTags('Shift Marketplace & Trades')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('scheduling/trades')
export class ShiftTradeController {
    constructor(private readonly tradeService: ShiftTradeService) { }

    @Post('claim/:shiftId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Claim an open shift',
        description: 'Assigns an open shift to the requesting employee if they hold the qualification and have no overlapping shifts.',
    })
    @ApiParam({ name: 'shiftId', type: 'string', description: 'Open Shift UUID' })
    @ApiResponse({ status: 200, description: 'Shift claimed successfully.' })
    @ApiResponse({ status: 403, description: 'Missing position qualification.' })
    @ApiResponse({ status: 409, description: 'Shift already claimed or conflicting shift exists.' })
    claimOpenShift(
        @Req() req: any,
        @Param('shiftId', new ParseUUIDPipe()) shiftId: string,
    ) {
        return this.tradeService.claimOpenShift(req.user.id, shiftId);
    }

    @Post('request')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Request shift swap or drop',
        description: 'Creates a request to swap a shift with a coworker or drop it to the open shift pool.',
    })
    @ApiResponse({ status: 201, description: 'Trade request created.' })
    requestTrade(@Req() req: any, @Body() dto: RequestShiftTradeDto) {
        return this.tradeService.requestTrade(req.user.id, dto);
    }

    @Put(':tradeId/peer-respond')
    @ApiOperation({
        summary: 'Accept or decline a peer swap request',
        description: 'The target employee can accept or decline a 1-to-1 swap request before it routes to management.',
    })
    @ApiParam({ name: 'tradeId', type: 'string', description: 'ShiftTrade UUID' })
    peerRespond(
        @Req() req: any,
        @Param('tradeId', new ParseUUIDPipe()) tradeId: string,
        @Body('accept') accept: boolean,
    ) {
        return this.tradeService.respondToSwap(req.user.id, tradeId, accept);
    }

    @Put(':tradeId/manager-review')
    @ApiOperation({
        summary: 'Manager approval or rejection of a shift trade/drop',
        description: 'Atomically executes shift reassignment upon approval and records an audit log.',
    })
    @ApiParam({ name: 'tradeId', type: 'string', description: 'ShiftTrade UUID' })
    managerReview(
        @Req() req: any,
        @Param('tradeId', new ParseUUIDPipe()) tradeId: string,
        @Body() dto: ReviewTradeDto,
    ) {
        return this.tradeService.reviewTrade(req.user.id, tradeId, dto);
    }

    @Get('locations/:locationId/pending')
    @ApiOperation({
        summary: 'List pending trade approvals for a store',
        description: 'Retrieves all trade requests awaiting manager sign-off for a specific location.',
    })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    getPendingTrades(
        @Req() req: any,
        @Param('locationId', new ParseUUIDPipe()) locationId: string,
    ) {
        return this.tradeService.getPendingTrades(req.user.id, locationId);
    }
}