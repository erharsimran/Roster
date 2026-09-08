import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

// Custom validator to enforce valid IANA timezones (e.g., 'America/Toronto', 'UTC')
export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!value) return true; // Handled by @IsOptional
          try {
            Intl.DateTimeFormat(undefined, { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage() {
          return '($value) is not a valid IANA timezone identifier (e.g., America/Toronto, UTC)';
        },
      },
    });
  };
}

export class SetupOrgDto {
  @ApiProperty({ example: 'Apex Logistics Inc.', description: 'Legal or operating business name' })
  @IsString()
  @IsNotEmpty({ message: 'Organization name is required' })
  @MaxLength(100, { message: 'Organization name cannot exceed 100 characters' })
  organizationName!: string;

  @ApiProperty({ example: 'America/Toronto', default: 'UTC', required: false })
  @IsString()
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiProperty({ example: 'Main Distribution Hub', description: 'Primary branch location name' })
  @IsString()
  @IsNotEmpty({ message: 'Primary location name is required' })
  @MaxLength(100, { message: 'Location name cannot exceed 100 characters' })
  primaryLocationName!: string;

  @ApiProperty({
    example: '450 Conestoga Blvd, Cambridge, ON',
    description: 'Physical address used for shift geofencing',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Address cannot exceed 255 characters' })
  address?: string;
}