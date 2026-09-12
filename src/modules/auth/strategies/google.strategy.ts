import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(private readonly authService: AuthService) {
        super({
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackURL:
            process.env.GOOGLE_CALLBACK_URL ||
            'http://localhost:3000/auth/google/callback',
        scope: ['email', 'profile'],
    });
  }

    async validate(
      _accessToken: string,
      _refreshToken: string,
      profile: any,
      done: VerifyCallback,
  ): Promise<any> {
      try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
              return done(
                  new UnauthorizedException('No email returned from Google account'),
                  false,
              );
          }

          const fullName =
              profile.displayName?.trim() ||
              `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
              email.split('@')[0];

          const authSession = await this.authService.validateGoogleUser({
              googleId: profile.id,
              email,
              fullName,
          });

          return done(null, authSession);
      } catch (error) {
          console.error('Error inside GoogleStrategy.validate:', error);
          return done(error as Error, false);
      }
  }
}