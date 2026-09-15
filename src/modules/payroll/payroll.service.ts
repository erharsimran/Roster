import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PermissionService } from '../../common/services/permission.service';
import { GeneratePayrollDto, PayrollFormat } from './dto/payroll.dto';

export interface EmployeePayrollRecord {
    userId: string;
    fullName: string;
    email: string;
    hourlyRate: number;
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    regularPay: number;
    overtimePay: number;
    grossPay: number;
    shiftsCount: number;
}

@Injectable()
export class PayrollService {
    private readonly logger = new Logger(PayrollService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionService: PermissionService,
    ) { }

    private async assertPayrollAccess(userId: string, locationId: string) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
            select: { id: true, orgId: true, name: true, timezone: true },
        });

        if (!location) throw new NotFoundException('Location not found');

        const allowed = await this.permissionService.can(userId, 'payroll:read', {
            scopeType: 'location',
            scopeId: location.id,
        });

        if (!allowed) {
            throw new ForbiddenException('Insufficient permissions to view or export payroll');
        }

        return location;
    }

    /**
     * Computes regular vs overtime breakdown for each employee across a pay period.
     */
    async calculatePayrollSummary(
        callerUserId: string,
        locationId: string,
        dto: GeneratePayrollDto,
    ): Promise<{ locationName: string; records: EmployeePayrollRecord[]; totals: any }> {
        const location = await this.assertPayrollAccess(callerUserId, locationId);
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);

        // Retrieve verified time punches
        const punches = await this.prisma.timeEntry.findMany({
            where: {
                locationId,
                status: { in: ['completed', 'approved'] },
                clockIn: { gte: start, lte: end },
                clockOut: { not: null },
            },
            include: {
                user: { select: { id: true, fullName: true, email: true } },
                shift: {
                    include: {
                        position: { select: { hourlyRate: true } },
                    },
                },
            },
            orderBy: { clockIn: 'asc' },
        });

        // Group punches by user
        const userPunchesMap = new Map<string, { user: any; entries: any[] }>();

        for (const punch of punches) {
            if (!userPunchesMap.has(punch.userId)) {
                userPunchesMap.set(punch.userId, { user: punch.user, entries: [] });
            }
            userPunchesMap.get(punch.userId)!.entries.push(punch);
        }

        const records: EmployeePayrollRecord[] = [];
        let grossTotalRegularPay = 0;
        let grossTotalOvertimePay = 0;
        let totalWorkedHours = 0;

        for (const [userId, { user, entries }] of userPunchesMap.entries()) {
            let userTotalHours = 0;
            let effectiveRate = 0;

            for (const entry of entries) {
                const durationHours =
                    (entry.clockOut.getTime() - entry.clockIn.getTime()) / (1000 * 60 * 60);
                userTotalHours += durationHours;

                if (entry.shift?.position?.hourlyRate && effectiveRate === 0) {
                    effectiveRate = Number(entry.shift.position.hourlyRate);
                }
            }

            // Overtime Rule: Standard > 40 hours threshold for the pay period
            const regularHours = Math.min(userTotalHours, 40);
            const overtimeHours = Math.max(0, userTotalHours - 40);

            const regularPay = regularHours * effectiveRate;
            const overtimePay = overtimeHours * (effectiveRate * 1.5);
            const grossPay = regularPay + overtimePay;

            grossTotalRegularPay += regularPay;
            grossTotalOvertimePay += overtimePay;
            totalWorkedHours += userTotalHours;

            records.push({
                userId,
                fullName: user.fullName,
                email: user.email,
                hourlyRate: Number(effectiveRate.toFixed(2)),
                regularHours: Number(regularHours.toFixed(2)),
                overtimeHours: Number(overtimeHours.toFixed(2)),
                totalHours: Number(userTotalHours.toFixed(2)),
                regularPay: Number(regularPay.toFixed(2)),
                overtimePay: Number(overtimePay.toFixed(2)),
                grossPay: Number(grossPay.toFixed(2)),
                shiftsCount: entries.length,
            });
        }

        return {
            locationName: location.name,
            records,
            totals: {
                totalHours: Number(totalWorkedHours.toFixed(2)),
                regularPay: Number(grossTotalRegularPay.toFixed(2)),
                overtimePay: Number(grossTotalOvertimePay.toFixed(2)),
                grossPayrollCost: Number((grossTotalRegularPay + grossTotalOvertimePay).toFixed(2)),
                employeesCount: records.length,
            },
        };
    }

    /**
     * Generates formatted CSV string ready for download.
     */
    async generatePayrollCsv(
        callerUserId: string,
        locationId: string,
        dto: GeneratePayrollDto,
    ): Promise<string> {
        const { records } = await this.calculatePayrollSummary(callerUserId, locationId, dto);
        const format = dto.format || PayrollFormat.STANDARD;

        if (format === PayrollFormat.GUSTO) {
            // Gusto Format: Employee Name, Regular Hours, Overtime Hours
            const header = 'Employee Name,Email,Regular Hours,Overtime Hours\n';
            const rows = records
                .map((r) => `"${r.fullName}","${r.email}",${r.regularHours},${r.overtimeHours}`)
                .join('\n');
            return header + rows;
        }

        if (format === PayrollFormat.ADP) {
            // ADP Format: Company Code, Batch ID, Co / Emp ID, Reg Hours, O/T Hours, Hourly Rate
            const header = 'Co / Emp ID,Employee Name,Reg Hours,O/T Hours,Hourly Rate,Gross Pay\n';
            const rows = records
                .map((r) => `"${r.userId}","${r.fullName}",${r.regularHours},${r.overtimeHours},${r.hourlyRate},${r.grossPay}`)
                .join('\n');
            return header + rows;
        }

        // Default Standard Format
        const header =
            'User ID,Full Name,Email,Hourly Rate,Regular Hours,Overtime Hours,Total Hours,Regular Pay,Overtime Pay,Gross Pay,Shifts Count\n';
        const rows = records
            .map(
                (r) =>
                    `"${r.userId}","${r.fullName}","${r.email}",${r.hourlyRate},${r.regularHours},${r.overtimeHours},${r.totalHours},${r.regularPay},${r.overtimePay},${r.grossPay},${r.shiftsCount}`,
            )
            .join('\n');

        return header + rows;
    }
}