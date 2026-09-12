import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import {
    CreateEmployeeDto,
    UpdateEmployeeProfileDto,
    AssignPositionsDto,
} from './dto/employee.dto';

@ApiTags('Employees')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
    @Controller('organizations/:orgId/employees')
export class EmployeesController {
    constructor(private readonly employeesService: EmployeesService) { }

    @Get()
    @ApiOperation({ summary: 'List all employees with roles and assigned positions' })
    findAll(@Req() req: any, @Param('orgId', new ParseUUIDPipe()) orgId: string) {
        return this.employeesService.findAllByOrg(req.user.sub || req.user.id, orgId);
    }

    @Post()
    @ApiOperation({ summary: 'Onboard a new employee' })
    create(
        @Req() req: any,
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Body() dto: CreateEmployeeDto,
    ) {
        return this.employeesService.create(req.user.sub || req.user.id, { ...dto, orgId });
    }

    @Patch(':userId')
    @ApiOperation({ summary: 'Update employee profile and role/scope assignment' })
    updateProfile(
        @Req() req: any,
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Param('userId', new ParseUUIDPipe()) userId: string,
        @Body() dto: UpdateEmployeeProfileDto,
    ) {
        return this.employeesService.updateProfile(
            req.user.sub || req.user.id,
            orgId,
            userId,
            dto,
        );
    }

    @Patch(':userId/positions')
    @ApiOperation({ summary: 'Reassign positions to an employee' })
    assignPositions(
        @Req() req: any,
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Param('userId', new ParseUUIDPipe()) userId: string,
        @Body() dto: AssignPositionsDto,
    ) {
        return this.employeesService.assignPositions(
            req.user.sub || req.user.id,
            orgId,
            userId,
            dto,
        );
    }

    @Delete(':userId')
    @ApiOperation({ summary: 'Offboard an employee from the organization' })
    offboard(
        @Req() req: any,
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Param('userId', new ParseUUIDPipe()) userId: string,
    ) {
        return this.employeesService.offboard(
            req.user.sub || req.user.id,
            orgId,
            userId,
        );
    }
}