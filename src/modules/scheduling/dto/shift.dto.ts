import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsBeforeEndTime', async: false })
export class IsBeforeEndTimeConstraint implements ValidatorConstraintInterface {
  validate(startTime: string, args: ValidationArguments) {
    const obj = args.object as any;
    if (!startTime || !obj.endTime) return true;
    return new Date(startTime).getTime() < new Date(obj.endTime).getTime();
  }

  defaultMessage() {
    return 'startTime must be chronologically earlier than endTime';
  }
}

export class CreateShiftDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Location UUID' })
  @IsUUID('4', { message: 'locationId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'locationId is required' })
  locationId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Position UUID', required: false })
  @IsUUID('4', { message: 'positionId must be a valid UUID v4' })
  @IsOptional()
  positionId?: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Assigned User UUID (omit for open claimable shifts)',
    required: false,
  })
  @IsUUID('4', { message: 'assignedUserId must be a valid UUID v4' })
  @IsOptional()
  assignedUserId?: string;

  @ApiProperty({ example: '2026-09-15T09:00:00Z', description: 'Shift start timestamp in ISO-8601 UTC' })
  @IsDateString({}, { message: 'startTime must be a valid ISO-8601 date string' })
  @IsNotEmpty({ message: 'startTime is required' })
  @Validate(IsBeforeEndTimeConstraint)
  startTime!: string;

  @ApiProperty({ example: '2026-09-15T17:00:00Z', description: 'Shift end timestamp in ISO-8601 UTC' })
  @IsDateString({}, { message: 'endTime must be a valid ISO-8601 date string' })
  @IsNotEmpty({ message: 'endTime is required' })
  endTime!: string;
}

export class UpdateShiftDto extends PartialType(CreateShiftDto) { }

export class PublishRosterDto {
  @ApiProperty({ example: '2026-09-14T00:00:00Z', description: 'Start of schedule window' })
  @IsDateString()
  @IsNotEmpty({ message: 'startDate is required' })
  startDate!: string;

  @ApiProperty({ example: '2026-09-20T23:59:59Z', description: 'End of schedule window' })
  @IsDateString()
  @IsNotEmpty({ message: 'endDate is required' })
  endDate!: string;
}