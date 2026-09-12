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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationRolesService } from './organization-roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@ApiTags('Organization Roles & Permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('organizations/:orgId/roles')
export class OrganizationRolesController {
    constructor(private readonly rolesService: OrganizationRolesService) { }

    @Get('permissions')
    @ApiOperation({ summary: 'List all system permissions' })
    @ApiResponse({ status: 200, description: 'List of platform capability keys' })
    listPermissions(@Param('orgId', new ParseUUIDPipe()) _orgId: string) {
        return this.rolesService.listPermissions();
    }

    @Get()
    @ApiOperation({ summary: 'List all roles, assigned permissions, and audit metadata' })
    @ApiResponse({ status: 200, description: 'Array of roles scoped to the organization' })
    listOrgRoles(@Param('orgId', new ParseUUIDPipe()) orgId: string) {
        return this.rolesService.listOrgRoles(orgId);
    }

    @Post()
    @ApiOperation({ summary: 'Create a custom role scoped to this organization' })
    @ApiResponse({ status: 201, description: 'Role successfully created' })
    @ApiResponse({ status: 409, description: 'Role name already exists within this organization' })
    createRole(
        @Req() req: any,
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Body() dto: CreateRoleDto,
    ) {
        const currentUserId = req.user.sub || req.user.id;
        return this.rolesService.createRole(orgId, currentUserId, dto);
    }

    @Patch(':roleId')
    @ApiOperation({ summary: 'Update role name or permissions with audit trail' })
    @ApiResponse({ status: 200, description: 'Role updated successfully' })
    @ApiResponse({ status: 403, description: 'Cannot mutate system roles or owner permissions' })
    @ApiResponse({ status: 404, description: 'Role not found' })
    updateRole(
        @Req() req: any,
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Param('roleId', new ParseUUIDPipe()) roleId: string,
        @Body() dto: UpdateRoleDto,
    ) {
        const currentUserId = req.user.sub || req.user.id;
        return this.rolesService.updateRole(orgId, roleId, currentUserId, dto);
    }

    @Delete(':roleId')
    @ApiOperation({ summary: 'Delete a role if unused by active employees' })
    @ApiResponse({ status: 200, description: 'Role deleted' })
    @ApiResponse({ status: 400, description: 'Active employees are still assigned to this role' })
    @ApiResponse({ status: 403, description: 'System preset roles cannot be deleted' })
    deleteRole(
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Param('roleId', new ParseUUIDPipe()) roleId: string,
    ) {
        return this.rolesService.deleteRole(orgId, roleId);
    }
}