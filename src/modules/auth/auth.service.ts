import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

export interface GoogleAuthPayload {
    email: string;
    googleId?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    picture?: string;
    avatarUrl?: string;
    [key: string]: any;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
  ) { }

    async validateGoogleUser(details: GoogleAuthPayload) {
        const email = details.email.toLowerCase().trim();
        const fullName =
            details.fullName ||
            [details.firstName, details.lastName].filter(Boolean).join(' ') ||
            email.split('@')[0];

        // 1. Locate existing user by googleId or email
        let user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    ...(details.googleId ? [{ googleId: details.googleId }] : []),
                    { email },
                ],
            },
            include: {
                userRoles: {
                    include: {
                        role: true,
                    },
                },
        },
    });

      // 2. Link googleId if missing or create user
      if (user) {
          if (details.googleId && !user.googleId) {
              user = await this.prisma.user.update({
                  where: { id: user.id },
                  data: { googleId: details.googleId },
                  include: {
                userRoles: {
                    include: {
                        role: true,
                    },
                },
            },
        });
      }
    } else {
        user = await this.prisma.user.create({
            data: {
                email,
                fullName,
                googleId: details.googleId || null,
            },
          include: {
              userRoles: {
                  include: {
                      role: true,
                  },
              },
          },
      });
    }

      // 3. Resolve primary role and scope
      const primaryAssignment = user.userRoles?.[0];
      const roleName =
          primaryAssignment?.role?.name ??
          ((user as any).isSuperAdmin ? 'MasterAdmin' : 'Member');
      const orgId =
          primaryAssignment?.scopeType === 'organization'
              ? primaryAssignment.scopeId
              : null;

      // 4. Issue JWT access token
      const payload = {
          sub: user.id,
          email: user.email,
          fullName: user.fullName,
          isSuperAdmin: (user as any).isSuperAdmin ?? false,
          orgId,
          role: roleName,
      };

      const accessToken = this.jwtService.sign(payload);

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
              isSuperAdmin: (user as any).isSuperAdmin ?? false,
              orgId,
              role: roleName,
          },
      };
  }

    async login(dto: LoginDto) {
        const email = dto.email.toLowerCase().trim();

        const user = await this.prisma.user.findUnique({
            where: { email },
            include: {
                userRoles: {
                    include: {
                        role: true,
                    },
                },
            },
        });

      if (!user || !user.passwordHash) {
          throw new UnauthorizedException('Invalid email or password');
      }

      const isValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isValid) {
          throw new UnauthorizedException('Invalid email or password');
      }

      const primaryAssignment = user.userRoles[0];
      const roleName =
          primaryAssignment?.role?.name ??
          ((user as any).isSuperAdmin ? 'MasterAdmin' : 'Member');
      const orgId =
          primaryAssignment?.scopeType === 'organization'
              ? primaryAssignment.scopeId
              : null;

      const payload = {
          sub: user.id,
          email: user.email,
          fullName: user.fullName,
          isSuperAdmin: (user as any).isSuperAdmin ?? false,
          orgId,
          role: roleName,
      };

      return {
        accessToken: this.jwtService.sign(payload),
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            isSuperAdmin: (user as any).isSuperAdmin ?? false,
            orgId,
            role: roleName,
        },
    };
  }

    async getMe(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            isSuperAdmin: true,
            createdAt: true,
            userRoles: {
            select: {
                scopeType: true,
                scopeId: true,
                role: {
                select: {
                    id: true,
                    name: true,
                    rolePermissions: {
                              select: {
                                  permission: {
                                      select: { key: true },
                                  },
                              },
                          },
                      },
                  },
              },
          },
          employeePositions: {
            select: {
                position: {
                    select: {
                        id: true,
                        name: true,
                      isLeadership: true,
                      color: true,
                  },
                    },
                },
            },
        },
    });

      if (!user) {
          throw new UnauthorizedException('User no longer exists');
      }

      return user;
  }
}