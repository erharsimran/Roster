import { ApiProperty } from '@nestjs/swagger';
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export enum TimeOffReviewAction {
    APPROVE = 'approve',
    DENY = 'deny',
}

export class CreateTimeOffRequestDto {
    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Location this request applies to' })
    @IsUUID('4', { message: 'locationId must be a valid UUID v4' })
    @IsNotEmpty()
    locationId!: string;

    @ApiProperty({ example: '2026-10-01', description: 'First day off (inclusive), YYYY-MM-DD' })
    @IsDateString()
    @IsNotEmpty()
    startDate!: string;

    @ApiProperty({ example: '2026-10-03', description: 'Last day off (inclusive), YYYY-MM-DD' })
    @IsDateString()
    @IsNotEmpty()
    endDate!: string;

    @ApiProperty({ example: 'Family wedding out of town', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    reason?: string;
}

export class ReviewTimeOffDto {
    @ApiProperty({ enum: TimeOffReviewAction, example: TimeOffReviewAction.APPROVE })
    @IsEnum(TimeOffReviewAction)
    @IsNotEmpty()
    action!: TimeOffReviewAction;

    @ApiProperty({ example: 'Approved - coverage confirmed', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    reason?: string;
}