import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class SuperAdminGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId = request.user?.id;

        if (!userId) {
            throw new UnauthorizedException('Authentication required');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { isSuperAdmin: true },
        });

        if (!user?.isSuperAdmin) {
            throw new ForbiddenException('Platform Master Admin access required');
        }

        return true;
    }
}