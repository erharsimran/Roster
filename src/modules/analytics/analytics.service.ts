import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { GetLaborVarianceDto } from './dto/labor-analytics.dto';

@Injectable()
export class AnalyticsService {
    constructor(private readonly prisma: PrismaService) { }

    async getLaborVariance(userId: string, locationId: string, query: GetLaborVarianceDto) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
            select: { id: true, orgId: true, name: true, timezone: true },
        });

        if (!location) throw new NotFoundException('Location not found');

        const role = await this.prisma.userRole.findFirst({
            where: {
                userId,
                OR: [
                    { scopeType: 'organization', scopeId: location.orgId },
                    { scopeType: 'location', scopeId: location.id },
                ],
            },
            include: { role: true },
        });

        if (!role || !['Owner', 'Admin', 'Manager'].includes(role.role.name)) {
            throw new ForbiddenException('Insufficient permissions to view labor analytics');
        }

        const start = new Date(query.startDate);
        const end = new Date(query.endDate);

        // 1. Fetch scheduled shifts
        const scheduledShifts = await this.prisma.shift.findMany({
            where: {
                locationId,
                status: 'published',
                startTime: { gte: start },
                endTime: { lte: end },
                assignedUserId: { not: null },
            },
            include: {
                position: { select: { id: true, name: true, hourlyRate: true } },
                assignedUser: { select: { id: true, fullName: true, email: true } },
            },
        });

        // 2. Fetch actual clocked time entries
        const actualEntries = await this.prisma.timeEntry.findMany({
            where: {
                locationId,
                clockIn: { gte: start, lte: end },
                clockOut: { not: null },
            },
            include: {
                shift: {
                    include: {
                        position: { select: { hourlyRate: true } },
                    },
                },
                user: { select: { id: true, fullName: true, email: true } },
            },
        });

        // 3. Compute Planned Totals
        let plannedTotalHours = 0;
        let plannedTotalCost = 0;
        const employeeBreakdown = new Map<string, any>();

        for (const shift of scheduledShifts) {
            const hours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
            const rate = shift.position?.hourlyRate ? Number(shift.position.hourlyRate) : 0;
            const cost = hours * rate;

            plannedTotalHours += hours;
            plannedTotalCost += cost;

            const empId = shift.assignedUserId!;
            if (!employeeBreakdown.has(empId)) {
                employeeBreakdown.set(empId, {
                    userId: empId,
                    fullName: shift.assignedUser?.fullName,
                    email: shift.assignedUser?.email,
                    plannedHours: 0,
                    actualHours: 0,
                    plannedCost: 0,
                    actualCost: 0,
                    flaggedEntriesCount: 0,
                });
            }

            const emp = employeeBreakdown.get(empId);
            emp.plannedHours += hours;
            emp.plannedCost += cost;
        }

        // 4. Compute Actual Totals
        let actualTotalHours = 0;
        let actualTotalCost = 0;
        let flaggedPunchesCount = 0;

        for (const entry of actualEntries) {
            const hours = (entry.clockOut!.getTime() - entry.clockIn.getTime()) / (1000 * 60 * 60);
            const rate = entry.shift?.position?.hourlyRate ? Number(entry.shift.position.hourlyRate) : 0;
            const cost = hours * rate;

            actualTotalHours += hours;
            actualTotalCost += cost;

            if (entry.status === 'flagged') {
                flaggedPunchesCount++;
            }

            const empId = entry.userId;
            if (!employeeBreakdown.has(empId)) {
                employeeBreakdown.set(empId, {
                    userId: empId,
                    fullName: entry.user.fullName,
                    email: entry.user.email,
                    plannedHours: 0,
                    actualHours: 0,
                    plannedCost: 0,
                    actualCost: 0,
                    flaggedEntriesCount: 0,
                });
            }

            const emp = employeeBreakdown.get(empId);
            emp.actualHours += hours;
            emp.actualCost += cost;
            if (entry.status === 'flagged') {
                emp.flaggedEntriesCount++;
            }
        }

        // 5. Format variances
        const employees = Array.from(employeeBreakdown.values()).map((emp) => ({
            ...emp,
            plannedHours: Number(emp.plannedHours.toFixed(2)),
            actualHours: Number(emp.actualHours.toFixed(2)),
            hoursVariance: Number((emp.actualHours - emp.plannedHours).toFixed(2)),
            plannedCost: Number(emp.plannedCost.toFixed(2)),
            actualCost: Number(emp.actualCost.toFixed(2)),
            costVariance: Number((emp.actualCost - emp.plannedCost).toFixed(2)),
        }));

        return {
            location: {
                id: location.id,
                name: location.name,
                timezone: location.timezone,
            },
            period: { start: query.startDate, end: query.endDate },
            summary: {
                plannedHours: Number(plannedTotalHours.toFixed(2)),
                actualHours: Number(actualTotalHours.toFixed(2)),
                hoursVariance: Number((actualTotalHours - plannedTotalHours).toFixed(2)),
                plannedCost: Number(plannedTotalCost.toFixed(2)),
                actualCost: Number(actualTotalCost.toFixed(2)),
                costVariance: Number((actualTotalCost - plannedTotalCost).toFixed(2)),
                flaggedPunchesCount,
            },
            employees,
        };
    }
}