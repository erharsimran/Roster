import { ApiProperty } from '@nestjs/swagger';
import {
    IsLatitude,
    IsLongitude,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class ClockInDto {
    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Location UUID' })
    @IsUUID('4')
    @IsNotEmpty()
    locationId!: string;

    @ApiProperty({ example: 43.3616, description: 'GPS Latitude' })
    @IsLatitude()
    @IsNotEmpty()
    latitude!: number;

    @ApiProperty({ example: -80.3144, description: 'GPS Longitude' })
    @IsLongitude()
    @IsNotEmpty()
    longitude!: number;

    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', required: false, description: 'Linked Shift UUID' })
    @IsUUID('4')
    @IsOptional()
    shiftId?: string;

    @ApiProperty({ example: 'Covering for John Doe', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    notes?: string;
}

export class ClockOutDto {
    @ApiProperty({ example: 43.3616, description: 'GPS Latitude' })
    @IsLatitude()
    @IsNotEmpty()
    latitude!: number;

    @ApiProperty({ example: -80.3144, description: 'GPS Longitude' })
    @IsLongitude()
    @IsNotEmpty()
    longitude!: number;

    @ApiProperty({ example: 'Store locked and alarms armed', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    notes?: string;
}

export class SetLocationCoordinatesDto {
    @ApiProperty({ example: 43.3616 })
    @IsLatitude()
    @IsNotEmpty()
    latitude!: number;

    @ApiProperty({ example: -80.3144 })
    @IsLongitude()
    @IsNotEmpty()
    longitude!: number;

    @ApiProperty({ example: 150, default: 150, description: 'Acceptable radius in meters' })
    @IsNumber()
    @Min(20)
    @Max(2000)
    @IsOptional()
    geofenceRadiusMeters?: number = 150;
}