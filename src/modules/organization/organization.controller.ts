import { Controller, Post, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { SetupOrgDto } from './dto/setup-org.dto';

@ApiTags('Organizations')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Bootstrap Organization & Assign Caller as Owner',
    description: 'Atomically provisions an organization, default location, canonical RBAC permissions/roles, and logs an audit record.',
  })
  @ApiResponse({ status: 201, description: 'Organization workspace initialized successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed (e.g., invalid IANA timezone).' })
  @ApiResponse({ status: 409, description: 'User already owns/administers an organization.' })
  @ApiResponse({ status: 401, description: 'Missing or expired JWT Bearer token.' })
  async setup(@Req() req: any, @Body() dto: SetupOrgDto) {
    return this.orgService.setupAdminWorkspace(req.user.id, dto);
  }
}