import {
    Controller,
    Get,
    Post,
    Body,
    UseGuards,
    Req,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CreateOrgOwnerInviteDto } from '../invitations/dto/invitation.dto';

@ApiTags('Platform (Master Admin)')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), SuperAdminGuard)
@Controller('platform')
export class PlatformController {
    constructor(private readonly platformService: PlatformService) { }
    x
    @Post('invitations')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Issue an onboarding invitation for a new Organization Owner' })
    @ApiResponse({ status: 201, description: 'Organization Owner invitation created successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden: Master Admin access required' })
    @ApiResponse({ status: 409, description: 'User with this email already exists' })
    async inviteOrgOwner(@Body() dto: any, @Req() req: any) {
        const inviterId = req.user?.id || req.user?.userId;
        return this.platformService.inviteOrgOwner(dto, inviterId);
    }

    @Get('organizations')
    @ApiOperation({ summary: 'List all platform-wide organizations with counts' })
    @ApiResponse({ status: 200, description: 'List of all platform organizations' })
    @ApiResponse({ status: 403, description: 'Forbidden: Master Admin access required' })
    listOrganizations() {
        return this.platformService.listAllOrganizations();
    }
}