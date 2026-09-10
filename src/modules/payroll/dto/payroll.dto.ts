import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export enum PayrollFormat {
    STANDARD = 'standard',
    GUSTO = 'gusto',
    ADP = 'adp',
}

export class GeneratePayrollDto {
    @ApiProperty({ example: '2026-09-01T00:00:00Z', description: 'Pay period start timestamp (UTC)' })
    @IsDateString()
    @IsNotEmpty()
    startDate!: string;

    @ApiProperty({ example: '2026-09-14T23:59:59Z', description: 'Pay period end timestamp (UTC)' })
    @IsDateString()
    @IsNotEmpty()
    endDate!: string;

    @ApiProperty({ enum: PayrollFormat, default: PayrollFormat.STANDARD, required: false })
    @IsEnum(PayrollFormat)
    @IsOptional()
    format?: PayrollFormat = PayrollFormat.STANDARD;
}