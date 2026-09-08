import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma.service';

interface GoogleUserPayload {
    googleId: string;
    email: string;
    fullName: string;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    async validateGoogleUser(details: GoogleUserPayload) {
        try {
            // 1. Check if user exists by googleId or email
            let user = await this.prisma.user.findFirst({
                where: {
                    OR: [{ googleId: details.googleId }, { email: details.email }],
                },
            });

            // 2. If user exists but lacks googleId, link it
            if (user && !user.googleId) {
                user = await this.prisma.user.update({
                    where: { id: user.id },
                    data: { googleId: details.googleId },
                });
            }

            // 3. If user doesn't exist, create user record
            if (!user) {
                user = await this.prisma.user.create({
                    data: {
                        email: details.email,
                        fullName: details.fullName,
                        googleId: details.googleId,
                    },
                });
            }

            // 4. Generate JWT
            const payload = { sub: user.id, email: user.email };
            return {
                accessToken: this.jwtService.sign(payload),
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                },
            };
        } catch (error) {
            throw new InternalServerErrorException('Error authenticating with Google');
        }
    }
}