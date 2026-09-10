import { Controller, Get, Param, Query, UseGuards, Req, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { GetLaborVarianceDto } from './dto/labor-analytics.dto';

@ApiTags('Labor Analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('analytics')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) { }

    @Get('locations/:locationId/labor-variance')
    @ApiOperation({
        summary: 'Scheduled vs Actual Labor Cost Variance',
        description: 'Calculates planned roster costs vs actual GPS-verified clock times, including overtime and variance.',
    })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    getLaborVariance(
        @Req() req: any,
        @Param('locationId', new ParseUUIDPipe()) locationId: string,
        @Query() query: GetLaborVarianceDto,
    ) {
        return this.analyticsService.getLaborVariance(req.user.id, locationId, query);
    }
}