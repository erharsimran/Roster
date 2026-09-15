import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    ConflictException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PermissionService } from '../../common/services/permission.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTimeOffRequestDto, ReviewTimeOffDto, TimeOffReviewAction } from './dto/Time-off.dto';

@Injectable()
export class TimeOffService {
    private readonly logger = new Logger(TimeOffService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionService: PermissionService,
        private readonly notificationsService: NotificationsService,
    ) { }

    /**
     * Creating a time-off request is self-service — any recognized staff
     * member at the location can request their own time off. This is
     * deliberately a membership check, not a permission gate: unlike
     * approving requests (which needs 'timeoff:approve'), everyone employed
     * at the location is allowed to ask for time off.
     */
    private async assertMembership(userId: string, locationId: string) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
            select: { id: true, orgId: true, name: true },
        });
        if (!location) throw new NotFoundException('Location not found');

        const membership = await this.prisma.userRole.findFirst({
            where: {
                userId,
                OR: [
                    { scopeType: 'organization', scopeId: location.orgId },
                    { scopeType: 'location', scopeId: location.id },
                ],
            },
        });

        if (!membership) {
            throw new ForbiddenException('You are not a member of this location');
        }

        return location;
    }

    async createRequest(userId: string, dto: CreateTimeOffRequestDto) {
        const location = await this.assertMembership(userId, dto.locationId);

        const startDate = new Date(dto.startDate);
        const endDate = new Date(dto.endDate);

        if (startDate > endDate) {
            throw new BadRequestException('startDate must be on or before endDate');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (startDate < today) {
            throw new BadRequestException('Cannot request time off in the past');
        }

        // Prevent duplicate/overlapping requests for the same user that are
        // still pending or already approved — avoids double-booking the same
        // window and cluttering the manager review queue with duplicates.
        const overlapping = await this.prisma.timeOffRequest.findFirst({
            where: {
                userId,
                status: { in: ['pending', 'approved'] },
                startDate: { lte: endDate },
                endDate: { gte: startDate },
            },
        });
        if (overlapping) {
            throw new ConflictException('You already have a pending or approved request that overlaps these dates');
        }

        const request = await this.prisma.timeOffRequest.create({
            data: {
                userId,
                locationId: dto.locationId,
                startDate,
                endDate,
                reason: dto.reason,
                status: 'pending',
            },
        });

        await this.notificationsService.queueTimeOffRequested({
            requestId: request.id,
            userId,
            locationId: location.id,
            locationName: location.name,
            startDate: dto.startDate,
            endDate: dto.endDate,
        });

        return request;
    }

    /** The requesting employee's own history — no permission gate, always self-scoped. */
    async listMine(userId: string) {
        return this.prisma.timeOffRequest.findMany({
            where: { userId },
            orderBy: { startDate: 'desc' },
            include: { location: { select: { id: true, name: true } } },
        });
    }

    /** Employee can withdraw their own request while it's still pending. */
    async cancelRequest(userId: string, requestId: string) {
        const request = await this.prisma.timeOffRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new NotFoundException('Time-off request not found');

        if (request.userId !== userId) {
            throw new ForbiddenException('You can only cancel your own requests');
        }
        if (request.status !== 'pending') {
            throw new BadRequestException(`Cannot cancel a request that is already ${request.status}`);
        }

        return this.prisma.timeOffRequest.delete({ where: { id: requestId } });
    }

    /** Manager-facing queue — requires 'timeoff:approve' at the location. */
    async listPendingForLocation(callerUserId: string, locationId: string) {
        const location = await this.prisma.location.findUnique({ where: { id: locationId } });
        if (!location) throw new NotFoundException('Location not found');

        const allowed = await this.permissionService.can(callerUserId, 'timeoff:approve', {
            scopeType: 'location',
            scopeId: location.id,
        });
        if (!allowed) throw new ForbiddenException('Insufficient permissions to review time-off requests');

        return this.prisma.timeOffRequest.findMany({
            where: { locationId, status: 'pending' },
            orderBy: { startDate: 'asc' },
            include: { user: { select: { id: true, fullName: true, email: true } } },
        });
    }

    async reviewRequest(callerUserId: string, requestId: string, dto: ReviewTimeOffDto) {
        const request = await this.prisma.timeOffRequest.findUnique({
            where: { id: requestId },
            include: { location: true },
        });
        if (!request) throw new NotFoundException('Time-off request not found');

        const allowed = await this.permissionService.can(callerUserId, 'timeoff:approve', {
            scopeType: 'location',
            scopeId: request.locationId,
        });
        if (!allowed) throw new ForbiddenException('Insufficient permissions to review time-off requests');

        if (request.status !== 'pending') {
            throw new BadRequestException(`This request has already been ${request.status}`);
        }

        const newStatus = dto.action === TimeOffReviewAction.APPROVE ? 'approved' : 'denied';

        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.timeOffRequest.update({
                where: { id: requestId },
                data: { status: newStatus, reviewedBy: callerUserId },
            });

            await tx.auditLog.create({
                data: {
                    orgId: request.location.orgId,
                    userId: callerUserId,
                    action: `timeoff.${newStatus}`,
                    resourceType: 'time_off_request',
                    resourceId: requestId,
                    metadata: { reason: dto.reason ?? null },
                },
            });

            return result;
        });

        await this.notificationsService.queueTimeOffReviewed({
            requestId: updated.id,
            userId: updated.userId,
            status: newStatus as 'approved' | 'denied',
            reason: dto.reason,
        });

        return updated;
    }
}