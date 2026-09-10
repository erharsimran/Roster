import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsUUID } from 'class-validator';

export class GetLaborVarianceDto {
    @ApiProperty({ example: '2026-09-01T00:00:00Z', description: 'Window start date (UTC)' })
    @IsDateString()
    @IsNotEmpty()
    startDate!: string;

    @ApiProperty({ example: '2026-09-07T23:59:59Z', description: 'Window end date (UTC)' })
    @IsDateString()
    @IsNotEmpty()
    endDate!: string;
}