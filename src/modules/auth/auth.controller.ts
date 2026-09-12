import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
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
      description: 'Receives Google callback code, creates/links user, and redirects to web app.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to frontend auth callback.' })
  async googleAuthRedirect(@Req() req: any, @Res() res: Response) {
        try {
            const { accessToken } = req.user;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
          return res.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);
      } catch (error) {
          console.error('OAuth redirect processing failed:', error);
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
          return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
      }
  }

    @Get('me')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({
        summary: 'Current User Identity',
        description: 'Protected test route to verify your JWT token in Swagger.',
    })
    getProfile(@Req() req: any) {
        const userId = req.user.sub || req.user.id || req.user.userId;
        return this.authService.getMe(userId);
    }


}