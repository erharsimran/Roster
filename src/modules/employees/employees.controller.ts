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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, AssignPositionsDto } from './dto/employee.dto';

@ApiTags('Employees')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('employees')
export class EmployeesController {
    constructor(private readonly employeesService: EmployeesService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Onboard an Employee',
        description: 'Creates or links a user to the organization, assigns their RBAC role and positions, and records an audit log.',
    })
    @ApiResponse({ status: 201, description: 'Employee onboarded successfully' })
    @ApiResponse({ status: 400, description: 'Validation failed or invalid position IDs' })
    @ApiResponse({ status: 403, description: 'Caller is not an Admin/Owner in this org' })
    @ApiResponse({ status: 409, description: 'User already assigned this role at this scope' })
    create(@Req() req: any, @Body() dto: CreateEmployeeDto) {
        return this.employeesService.create(req.user.id, dto);
    }

    @Get()
    @ApiOperation({
        summary: 'List Organization Employees',
        description: 'Returns all employees, their assigned roles, scopes, and linked positions for an organization.',
    })
    @ApiQuery({ name: 'orgId', type: 'string', required: true })
    @ApiResponse({ status: 200, description: 'List of employees' })
    findAllByOrg(
        @Req() req: any,
        @Query('orgId', new ParseUUIDPipe()) orgId: string,
    ) {
        return this.employeesService.findAllByOrg(req.user.id, orgId);
    }

    @Put(':id/positions')
    @ApiOperation({
        summary: 'Assign Positions to an Employee',
        description: 'Replaces the position assignments for a given employee in an organization.',
    })
    @ApiQuery({ name: 'orgId', type: 'string', required: true })
    @ApiResponse({ status: 200, description: 'Positions successfully assigned' })
    assignPositions(
        @Req() req: any,
        @Param('id', new ParseUUIDPipe()) id: string,
        @Query('orgId', new ParseUUIDPipe()) orgId: string,
        @Body() dto: AssignPositionsDto,
    ) {
        return this.employeesService.assignPositions(req.user.id, orgId, id, dto);
    }
}