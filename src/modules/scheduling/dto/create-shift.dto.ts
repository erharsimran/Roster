import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateShiftDto {
  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string; // omit to create an open/claimable shift
}
