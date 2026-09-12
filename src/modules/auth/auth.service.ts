import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma.service';
import { ScopeType } from '@prisma/client';

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

    async getUserSessionProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                userRoles: {
                    include: {
                        role: true,
                    },
                },
                employeePositions: {
                    include: {
                        position: true,
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User profile not found');
        }

        // 1. Locate organization scope from user roles
        const orgRole = user.userRoles.find(
            (ur) => ur.scopeType === 'organization'
        );

        let organization: { id: string; name: string; createdAt: Date } | null = null;

        if (orgRole?.scopeId) {
            organization = await this.prisma.organization.findUnique({
                where: { id: orgRole.scopeId },
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                },
            });
        }

        // Fallback check: If the role is scoped to a LOCATION, resolve the parent organization
        if (!organization) {
            const locationRole = user.userRoles.find(
                (ur) => ur.scopeType === 'location'
            );

            if (locationRole?.scopeId) {
                const location = await this.prisma.location.findUnique({
                    where: { id: locationRole.scopeId },
                    select: {
                        organization: {
                            select: {
                                id: true,
                                name: true,
                                createdAt: true,
                            },
                        },
                    },
                });
                if (location?.organization) {
                    organization = location.organization;
                }
            }
        }

        // 2. Determine highest role name (prioritizing Org-level leadership)
        const primaryRole = orgRole?.role?.name || user.userRoles[0]?.role?.name || 'Employee';

        // 3. Extract flattened positions
        const positions = user.employeePositions.map((ep) => ep.position);

        return {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            phone: user.phone,
            role: primaryRole,
            orgId: organization?.id ?? null,
            organization,
            positions,
        };
    }

    async validateGoogleUser(details: GoogleUserPayload) {
        try {
            let user = await this.prisma.user.findFirst({
                where: {
                    OR: [{ googleId: details.googleId }, { email: details.email }],
                },
            });

            if (user && !user.googleId) {
                user = await this.prisma.user.update({
                    where: { id: user.id },
                    data: { googleId: details.googleId },
                });
            }

            if (!user) {
                user = await this.prisma.user.create({
                    data: {
                        email: details.email,
                        fullName: details.fullName,
                        googleId: details.googleId,
                    },
                });
            }

            const fullProfile = await this.getUserSessionProfile(user.id);

            const tokenPayload = {
                sub: fullProfile.id,
                email: fullProfile.email,
                orgId: fullProfile.orgId,
                role: fullProfile.role,
            };

            return {
                accessToken: this.jwtService.sign(tokenPayload),
                user: fullProfile,
            };
        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            throw new InternalServerErrorException('Error authenticating with Google');
        }
    }
    async getMe(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                userRoles: {
                    include: {
                        role: true,
                    },
                },
                employeePositions: {
                    include: {
                        position: true,
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User profile not found');
        }

        // 1. Check for organization-level scope
        const orgRole = user.userRoles.find(
            (ur) => ur.scopeType === ScopeType.organization,
        );

        let orgId: string | null = orgRole?.scopeId ?? null;

        // 2. Fallback: If user only has a location-scoped role, resolve parent organization
        if (!orgId) {
            const locRole = user.userRoles.find(
                (ur) => ur.scopeType === ScopeType.location,
            );
            if (locRole?.scopeId) {
                const location = await this.prisma.location.findUnique({
                    where: { id: locRole.scopeId },
                    select: { orgId: true },
                });
                if (location) orgId = location.orgId;
            }
        }

        // 3. Resolve Organization entity
        let organization: {
            id: string;
            name: string;
            timezone: string;
            createdAt: Date;
        } | null = null;

        if (orgId) {
            organization = await this.prisma.organization.findUnique({
                where: { id: orgId },
                select: {
                    id: true,
                    name: true,
                    timezone: true,
                    createdAt: true,
                },
            });
        }

        return {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            phone: user.phone,
            orgId,
            role: orgRole?.role?.name ?? user.userRoles[0]?.role?.name ?? 'Employee',
            organization,
            positions: user.employeePositions.map((ep) => ep.position),
        };
    }

}

