import {
    Controller,
    Get,
    Param,
    Query,
    Res,
    UseGuards,
    Req,
    ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { GeneratePayrollDto } from './dto/payroll.dto';

@ApiTags('Payroll')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('payroll')
export class PayrollController {
    constructor(private readonly payrollService: PayrollService) { }

    @Get('locations/:locationId/summary')
    @ApiOperation({
        summary: 'Calculate pay period summary',
        description: 'Aggregates hours, regular pay, overtime (1.5x over 40h), and gross wages for all employees.',
    })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    @ApiResponse({ status: 200, description: 'Aggregated payroll numbers per employee.' })
    getSummary(
        @Req() req: any,
        @Param('locationId', new ParseUUIDPipe()) locationId: string,
        @Query() query: GeneratePayrollDto,
    ) {
        return this.payrollService.calculatePayrollSummary(req.user.id, locationId, query);
    }

    @Get('locations/:locationId/export')
    @ApiOperation({
        summary: 'Download Payroll CSV',
        description: 'Generates a CSV file formatted for direct import into payroll software (Standard, Gusto, or ADP).',
    })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    async exportCsv(
        @Req() req: any,
        @Param('locationId', new ParseUUIDPipe()) locationId: string,
        @Query() query: GeneratePayrollDto,
        @Res() res: Response,
    ) {
        const csvContent = await this.payrollService.generatePayrollCsv(req.user.id, locationId, query);
        const filename = `payroll-${locationId}-${query.startDate.slice(0, 10)}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csvContent);
    }
}