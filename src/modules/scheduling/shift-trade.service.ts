import {
    Injectable,
    NotFoundException,
    ConflictException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
    RequestShiftTradeDto,
    ReviewTradeDto,
    TradeTypeEnum,
    TradeReviewAction,
} from './dto/shift-trade.dto';

@Injectable()
export class ShiftTradeService {
    private readonly logger = new Logger(ShiftTradeService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * 1. CLAIM OPEN SHIFT
     * Allows an employee to claim an unassigned, published shift directly.
     */
    async claimOpenShift(claimingUserId: string, shiftId: string) {
        const shift = await this.prisma.shift.findUnique({
            where: { id: shiftId },
            include: {
                location: true,
                position: true,
            },
        });

        if (!shift) {
            throw new NotFoundException('Shift not found');
        }

        if (shift.status !== 'published') {
            throw new BadRequestException('Cannot claim a draft or cancelled shift');
        }

        if (shift.assignedUserId !== null) {
            throw new ConflictException('This shift has already been claimed by another team member');
        }

        // 1. Verify employee belongs to the organization
        const employeeOrgLink = await this.prisma.userRole.findFirst({
            where: {
                userId: claimingUserId,
                OR: [
                    { scopeType: 'organization', scopeId: shift.location.orgId },
                    { scopeType: 'location', scopeId: shift.locationId },
                ],
            },
        });

        if (!employeeOrgLink) {
            throw new ForbiddenException('You do not belong to the organization operating this location');
        }

        // 2. Position qualification check
        if (shift.positionId) {
            const isQualified = await this.prisma.employeePosition.findUnique({
                where: {
                    userId_positionId: {
                        userId: claimingUserId,
                        positionId: shift.positionId,
                    },
                },
            });

            if (!isQualified) {
                throw new ForbiddenException(
                    `You are not qualified for this position (${shift.position?.name || 'Restricted Role'})`,
                );
            }
        }

        // 3. Organization-wide conflict check
        const conflict = await this.prisma.shift.findFirst({
            where: {
                assignedUserId: claimingUserId,
                status: { in: ['scheduled', 'published'] },
                location: { orgId: shift.location.orgId },
                AND: [
                    { startTime: { lt: shift.endTime } },
                    { endTime: { gt: shift.startTime } },
                ],
            },
            include: { location: { select: { name: true } } },
        });

        if (conflict) {
            throw new ConflictException(
                `You are already scheduled to work at "${conflict.location.name}" during this timeframe`,
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const updatedShift = await tx.shift.update({
                where: { id: shift.id },
                data: { assignedUserId: claimingUserId },
                include: {
                    position: { select: { id: true, name: true } },
                    assignedUser: { select: { id: true, fullName: true, email: true } },
                },
            });

            await tx.auditLog.create({
                data: {
                    orgId: shift.location.orgId,
                    userId: claimingUserId,
                    action: 'shift.claimed',
                    resourceType: 'shift',
                    resourceId: shift.id,
                    metadata: {
                        shiftStart: shift.startTime.toISOString(),
                        shiftEnd: shift.endTime.toISOString(),
                        locationId: shift.locationId,
                    },
                },
            });

            return updatedShift;
        });
    }

    /**
     * 2. INITIATE SHIFT TRADE OR DROP
     */
    async requestTrade(sourceUserId: string, dto: RequestShiftTradeDto) {
        const shift = await this.prisma.shift.findUnique({
            where: { id: dto.shiftId },
            include: { location: true },
        });

        if (!shift) throw new NotFoundException('Source shift not found');

        if (shift.assignedUserId !== sourceUserId) {
            throw new ForbiddenException('You can only trade or drop shifts assigned directly to you');
        }

        if (shift.status !== 'published') {
            throw new BadRequestException('Cannot trade shifts that are in draft status');
        }

        if (new Date(shift.startTime).getTime() <= Date.now()) {
            throw new BadRequestException('Cannot trade or drop shifts that have already started or passed');
        }

        // Check for an active pending trade request on this shift
        const existingTrade = await this.prisma.shiftTrade.findFirst({
            where: {
                shiftId: dto.shiftId,
                status: { in: ['pending_peer', 'pending_manager'] },
            },
        });

        if (existingTrade) {
            throw new ConflictException('An active swap or drop request is already pending for this shift');
        }

        // 1-to-1 Swap Validation
        if (dto.type === TradeTypeEnum.SWAP) {
            if (!dto.targetUserId || !dto.targetShiftId) {
                throw new BadRequestException('1-to-1 Swaps require both targetUserId and targetShiftId');
            }

            const targetShift = await this.prisma.shift.findUnique({
                where: { id: dto.targetShiftId },
                include: { location: true },
            });

            if (!targetShift) throw new NotFoundException('Target shift to swap with was not found');

            if (targetShift.assignedUserId !== dto.targetUserId) {
                throw new BadRequestException('Target shift does not belong to the selected coworker');
            }

            return this.prisma.shiftTrade.create({
                data: {
                    orgId: shift.location.orgId,
                    shiftId: shift.id,
                    sourceUserId,
                    targetUserId: dto.targetUserId,
                    targetShiftId: dto.targetShiftId,
                    type: 'swap',
                    status: 'pending_peer', // Peer must agree before manager reviews
                    reason: dto.reason?.trim() || null,
                },
            });
        }

        // Shift Drop (Open Pool)
        return this.prisma.shiftTrade.create({
            data: {
                orgId: shift.location.orgId,
                shiftId: shift.id,
                sourceUserId,
                type: 'drop',
                status: 'pending_manager', // Straight to manager approval
                reason: dto.reason?.trim() || null,
            },
        });
    }

    /**
     * 3. PEER RESPONSE TO SWAP REQUEST
     */
    async respondToSwap(targetUserId: string, tradeId: string, accept: boolean) {
        const trade = await this.prisma.shiftTrade.findUnique({
            where: { id: tradeId },
            include: { shift: true },
        });

        if (!trade) throw new NotFoundException('Trade request not found');

        if (trade.targetUserId !== targetUserId) {
            throw new ForbiddenException('You are not the designated recipient of this trade request');
        }

        if (trade.status !== 'pending_peer') {
            throw new BadRequestException(`Trade request is not pending peer acceptance (current: ${trade.status})`);
        }

        if (!accept) {
            return this.prisma.shiftTrade.update({
                where: { id: tradeId },
                data: { status: 'rejected' },
            });
        }

        // Peer accepted -> forward to manager for final sign-off
        return this.prisma.shiftTrade.update({
            where: { id: tradeId },
            data: { status: 'pending_manager' },
        });
    }

    /**
     * 4. MANAGER REVIEW & ATOMIC EXECUTION
     */
    async reviewTrade(managerUserId: string, tradeId: string, dto: ReviewTradeDto) {
        const trade = await this.prisma.shiftTrade.findUnique({
            where: { id: tradeId },
            include: {
                shift: { include: { location: true } },
            },
        });

        if (!trade) throw new NotFoundException('Trade request not found');

        if (trade.status !== 'pending_manager') {
            throw new BadRequestException('Trade is not awaiting manager review');
        }

        // Verify manager privileges
        const managerRole = await this.prisma.userRole.findFirst({
            where: {
                userId: managerUserId,
                OR: [
                    { scopeType: 'organization', scopeId: trade.shift.location.orgId },
                    { scopeType: 'location', scopeId: trade.shift.locationId },
                ],
            },
            include: { role: true },
        });

        if (!managerRole || !['Owner', 'Admin', 'Manager'].includes(managerRole.role.name)) {
            throw new ForbiddenException('Only Managers and Admins can approve or reject shift trades');
        }

        if (dto.action === TradeReviewAction.REJECT) {
            return this.prisma.shiftTrade.update({
                where: { id: tradeId },
                data: {
                    status: 'rejected',
                    managerApproved: false,
                    reviewedBy: managerUserId,
                    reviewedAt: new Date(),
                    reason: dto.reason || trade.reason,
                },
            });
        }

        // Atomic execution for manager approval
        return this.prisma.$transaction(async (tx) => {
            if (trade.type === 'drop') {
                // Drop: Strip the assigned user and make it an open shift
                await tx.shift.update({
                    where: { id: trade.shiftId },
                    data: { assignedUserId: null },
                });
            } else if (trade.type === 'swap' && trade.targetUserId && trade.targetShiftId) {
                // Swap: Exchange user assignments on both shifts
                await tx.shift.update({
                    where: { id: trade.shiftId },
                    data: { assignedUserId: trade.targetUserId },
                });

                await tx.shift.update({
                    where: { id: trade.targetShiftId },
                    data: { assignedUserId: trade.sourceUserId },
                });
            }

            // Mark trade complete
            const resolvedTrade = await tx.shiftTrade.update({
                where: { id: tradeId },
                data: {
                    status: 'approved',
                    managerApproved: true,
                    reviewedBy: managerUserId,
                    reviewedAt: new Date(),
                },
            });

            // Audit log entry
            await tx.auditLog.create({
                data: {
                    orgId: trade.shift.location.orgId,
                    userId: managerUserId,
                    action: `shift.${trade.type}_approved`,
                    resourceType: 'shift_trade',
                    resourceId: trade.id,
                    metadata: {
                        tradeType: trade.type,
                        sourceUserId: trade.sourceUserId,
                        targetUserId: trade.targetUserId,
                        sourceShiftId: trade.shiftId,
                        targetShiftId: trade.targetShiftId,
                    },
                },
            });

            return resolvedTrade;
        });
    }

    /**
     * 5. LIST PENDING TRADES FOR A LOCATION
     */
    async getPendingTrades(managerUserId: string, locationId: string) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
            select: { orgId: true },
        });

        if (!location) throw new NotFoundException('Location not found');

        return this.prisma.shiftTrade.findMany({
            where: {
                shift: { locationId },
                status: 'pending_manager',
            },
            include: {
                shift: {
                    include: {
                        position: { select: { name: true } },
                    },
                },
                sourceUser: { select: { id: true, fullName: true, email: true } },
                targetUser: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}