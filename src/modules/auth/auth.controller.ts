import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Get('google')
    @UseGuards(AuthGuard('google'))
    @ApiOperation({
        summary: 'Trigger Google OAuth login flow',
        description: 'Direct browser link to start Google single sign-on.',
    })
    async googleAuth() {
        // Initiates Google OAuth redirection flow
    }

    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    @ApiOperation({
        summary: 'Google OAuth callback handler',
        description: 'Receives Google callback code, creates/links user, and returns JWT.',
    })
    @ApiResponse({ status: 200, description: 'JWT authentication payload returned.' })
    async googleAuthRedirect(@Req() req: any) {
        return this.authService.validateGoogleUser(req.user);
    }

    @Get('me')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({
        summary: 'Current User Identity',
        description: 'Protected test route to verify your JWT token in Swagger.',
    })
    getProfile(@Req() req: any) {
        return req.user;
    }
}