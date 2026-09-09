import { ApiProperty } from '@nestjs/swagger';
import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export enum TradeTypeEnum {
    SWAP = 'swap',
    DROP = 'drop',
}

export enum TradeReviewAction {
    APPROVE = 'approve',
    REJECT = 'reject',
}

export class RequestShiftTradeDto {
    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Shift you own and want to trade/drop' })
    @IsUUID('4', { message: 'shiftId must be a valid UUID v4' })
    @IsNotEmpty()
    shiftId!: string;

    @ApiProperty({ enum: TradeTypeEnum, example: TradeTypeEnum.DROP })
    @IsEnum(TradeTypeEnum)
    @IsNotEmpty()
    type!: TradeTypeEnum;

    @ApiProperty({
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        description: 'Target employee for 1-to-1 swap (omit if dropping to open pool)',
        required: false,
    })
    @IsUUID('4')
    @IsOptional()
    targetUserId?: string;

    @ApiProperty({
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        description: 'The shift owned by target employee being swapped for',
        required: false,
    })
    @IsUUID('4')
    @IsOptional()
    targetShiftId?: string;

    @ApiProperty({ example: 'Doctor appointment conflict', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    reason?: string;
}

export class ReviewTradeDto {
    @ApiProperty({ enum: TradeReviewAction, example: TradeReviewAction.APPROVE })
    @IsEnum(TradeReviewAction)
    @IsNotEmpty()
    action!: TradeReviewAction;

    @ApiProperty({ example: 'Approved - coverage confirmed', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    reason?: string;
}