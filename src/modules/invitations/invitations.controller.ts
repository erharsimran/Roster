import {
    Controller,
    Get,
    Post,
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
} from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import {
    ClaimOrgOwnerInviteDto,
    CreateMemberInviteDto,
    ClaimMemberInviteDto,
} from './dto/invitation.dto';

@ApiTags('Invitations & Onboarding')
@Controller()
export class InvitationsController {
    constructor(private readonly invitationsService: InvitationsService) { }

    @Get('invitations/validate')
    @ApiOperation({ summary: 'Validate invite token status before rendering the claim view' })
    @ApiQuery({ name: 'token', type: 'string', required: true })
    @ApiResponse({ status: 200, description: 'Token details and validation status' })
    @ApiResponse({ status: 400, description: 'Token has already been consumed or expired' })
    @ApiResponse({ status: 404, description: 'Token not found' })
    validateToken(@Query('token') token: string) {
        return this.invitationsService.validateToken(token);
    }

    @Post('auth/claim-owner-invite')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Redeem an invite token to provision a new organization, owner, and default location' })
    @ApiResponse({ status: 201, description: 'Organization workspace provisioned; returns session token' })
    @ApiResponse({ status: 400, description: 'Invalid, expired, or non-owner token' })
    claimOwnerInvite(@Body() dto: ClaimOrgOwnerInviteDto) {
        return this.invitationsService.claimOrgOwnerInvite(dto);
    }

    @Post('organizations/:orgId/invitations')
    @HttpCode(HttpStatus.CREATED)
    @ApiBearerAuth('JWT-auth')
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ summary: 'Invite a new team member to an organization' })
    @ApiResponse({ status: 201, description: 'Member invitation created successfully' })
    @ApiResponse({ status: 403, description: 'Caller lacks employees:manage permission in organization' })
    @ApiResponse({ status: 409, description: 'Target user is already mapped to this scope' })
    createMemberInvite(
        @Req() req: any,
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Body() dto: CreateMemberInviteDto,
    ) {
        return this.invitationsService.createMemberInvite(req.user.id, orgId, dto);
    }

    @Post('auth/claim-member-invite')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Redeem an invite token to create or link an employee account' })
    @ApiResponse({ status: 201, description: 'Employee onboarded; returns session token' })
    @ApiResponse({ status: 400, description: 'Invalid, expired, or non-member token' })
    claimMemberInvite(@Body() dto: ClaimMemberInviteDto) {
        return this.invitationsService.claimMemberInvite(dto);
    }
}