import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class DayScheduleDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    isOpen!: boolean;

    @ApiProperty({ example: '08:00' })
    @IsString()
    open!: string;

    @ApiProperty({ example: '22:00' })
    @IsString()
    close!: string;
}

export class CreateLocationDto {
    @ApiProperty({ example: 'Downtown Hub', description: 'Store branch label' })
    @IsString()
    @IsNotEmpty({ message: 'Location name is required' })
    @MaxLength(100)
    name!: string;

    @ApiProperty({ example: 'America/Toronto', description: 'IANA Timezone string' })
    @IsString()
    @IsNotEmpty({ message: 'Timezone is required' })
    timezone!: string;

    @ApiPropertyOptional({ example: '123 King St W, Toronto, ON' })
    @IsString()
    @IsOptional()
    address?: string;

    @ApiPropertyOptional({ example: 43.6532 })
    @IsNumber()
    @IsOptional()
    latitude?: number;

    @ApiPropertyOptional({ example: -79.3832 })
    @IsNumber()
    @IsOptional()
    longitude?: number;

    @ApiPropertyOptional({ example: 150, default: 150, description: 'Geofence radius in meters' })
    @IsNumber()
    @Min(20)
    @Max(2000)
    @IsOptional()
    geofenceRadiusMeters?: number = 150;

    @ApiPropertyOptional({
        description: 'Weekly operating hours schedule',
        example: {
            monday: { isOpen: true, open: '08:00', close: '22:00' },
            tuesday: { isOpen: true, open: '08:00', close: '22:00' },
            wednesday: { isOpen: true, open: '08:00', close: '22:00' },
            thursday: { isOpen: true, open: '08:00', close: '22:00' },
            friday: { isOpen: true, open: '08:00', close: '23:00' },
            saturday: { isOpen: true, open: '09:00', close: '23:00' },
            sunday: { isOpen: true, open: '10:00', close: '20:00' },
        },
    })
    @IsObject()
    @IsOptional()
    operatingHours?: Record<string, any>;

    @ApiPropertyOptional({ example: false, default: false })
    @IsBoolean()
    @IsOptional()
    requireLeadershipOnDuty?: boolean = false;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) { }