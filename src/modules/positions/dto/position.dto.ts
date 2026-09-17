import { ApiProperty, PartialType, OmitType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePositionDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Organization UUID',
  })
  @IsUUID('4', { message: 'orgId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'orgId is required' })
  orgId!: string;

  @ApiProperty({
    example: 'Shift Supervisor',
    description: 'Name of the job role or position',
  })
  @IsString()
  @IsNotEmpty({ message: 'Position name is required' })
  @MaxLength(80, { message: 'Position name cannot exceed 80 characters' })
  name!: string;

  @ApiProperty({
    example: 22.50,
    description: 'Default base hourly rate for this position',
    required: false,
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'hourlyRate must have at most 2 decimal places' })
  @Min(0, { message: 'hourlyRate cannot be negative' })
  @IsOptional()
  @Type(() => Number)
  hourlyRate?: number;

  @ApiProperty({
    example: true,
    description: 'Whether this position satisfies supervisory leadership requirements',
    required: false,
    default: false,
  })
  @IsBoolean({ message: 'isLeadership must be a boolean' })
  @IsOptional()
  @Type(() => Boolean)
  isLeadership?: boolean;

  @ApiProperty({
    example: '#10b981',
    description: 'Badge hex color for the position',
    required: false,
  })
  @IsString()
  @IsOptional()
  color?: string;
}

// Automatically makes name, hourlyRate, isLeadership, and color optional while omitting orgId
export class UpdatePositionDto extends PartialType(
  OmitType(CreatePositionDto, ['orgId'] as const),
) {}