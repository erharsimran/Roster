import { ApiProperty } from '@nestjs/swagger';
import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Min,
} from 'class-validator';

export enum GridGroupBy {
    EMPLOYEE = 'employee',
    POSITION = 'position',
}

export class DayOperatingHoursDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    isOpen!: boolean;

    @ApiProperty({ example: '08:00', description: 'HH:mm 24-hour format' })
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'open must be in HH:mm format' })
    open!: string;

    @ApiProperty({ example: '22:00', description: 'HH:mm 24-hour format' })
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'close must be in HH:mm format' })
    close!: string;
}

export class UpdateLocationOperatingHoursDto {
    @ApiProperty({
        example: {
            monday: { isOpen: true, open: '08:00', close: '22:00' },
            tuesday: { isOpen: true, open: '08:00', close: '22:00' },
            wednesday: { isOpen: true, open: '08:00', close: '22:00' },
            thursday: { isOpen: true, open: '08:00', close: '22:00' },
            friday: { isOpen: true, open: '08:00', close: '23:00' },
            saturday: { isOpen: true, open: '09:00', close: '23:00' },
            sunday: { isOpen: true, open: '10:00', close: '18:00' },
        },
    })
    @IsObject()
    @IsNotEmpty()
    operatingHours!: Record<string, DayOperatingHoursDto>;

    @ApiProperty({
        example: true,
        description: 'Enforces that at least 1 Manager/TL/ATL must be on shift at all operating times',
    })
    @IsBoolean()
    @IsOptional()
    requireLeadershipOnDuty?: boolean;
}

export class CopyWeekDto {
    @ApiProperty({ example: '2026-09-07T00:00:00Z', description: 'Source week start date (Monday)' })
    @IsDateString()
    @IsNotEmpty()
    sourceStartDate!: string;

    @ApiProperty({ example: '2026-09-14T00:00:00Z', description: 'Target week start date (Monday)' })
    @IsDateString()
    @IsNotEmpty()
    targetStartDate!: string;

    @ApiProperty({
        example: true,
        default: true,
        description: 'If true, skips shifts that would cause an employee double-booking instead of failing',
    })
    @IsBoolean()
    @IsOptional()
    skipConflicts?: boolean = true;
}

export class QuickDropShiftDto {
    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
    @IsUUID('4')
    @IsNotEmpty()
    userId!: string;

    @ApiProperty({ example: '2026-09-15', description: 'YYYY-MM-DD date in store local timezone' })
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
    date!: string;

    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', required: false })
    @IsUUID('4')
    @IsOptional()
    positionId?: string;

    @ApiProperty({ example: 8, default: 8, required: false, description: 'Shift duration in hours' })
    @IsNumber()
    @Min(1)
    @IsOptional()
    durationHours?: number = 8;
}

export class GetScheduleGridDto {
    @ApiProperty({ example: '2026-09-14T00:00:00Z' })
    @IsDateString()
    @IsNotEmpty()
    startDate!: string;

    @ApiProperty({ example: '2026-09-20T23:59:59Z' })
    @IsDateString()
    @IsNotEmpty()
    endDate!: string;

    @ApiProperty({ enum: GridGroupBy, default: GridGroupBy.EMPLOYEE, required: false })
    @IsEnum(GridGroupBy)
    @IsOptional()
    groupBy?: GridGroupBy = GridGroupBy.EMPLOYEE;
}

export class MoveShiftDto {
    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', required: false })
    @IsUUID('4')
    @IsOptional()
    targetUserId?: string | null;

    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', required: false })
    @IsUUID('4')
    @IsOptional()
    targetPositionId?: string | null;

    @ApiProperty({ example: '2026-09-16T09:00:00Z' })
    @IsDateString()
    @IsNotEmpty()
    newStartTime!: string;

    @ApiProperty({ example: '2026-09-16T17:00:00Z' })
    @IsDateString()
    @IsNotEmpty()
    newEndTime!: string;
}

export class DuplicateShiftDto {
    @ApiProperty({ example: '2026-09-17T09:00:00Z' })
    @IsDateString()
    @IsNotEmpty()
    newStartTime!: string;

    @ApiProperty({ example: '2026-09-17T17:00:00Z' })
    @IsDateString()
    @IsNotEmpty()
    newEndTime!: string;

    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', required: false })
    @IsUUID('4')
    @IsOptional()
    targetUserId?: string;
}