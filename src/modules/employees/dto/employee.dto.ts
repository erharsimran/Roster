import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
    IsArray,
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsPhoneNumber,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export enum RoleScope {
    ORGANIZATION = 'organization',
    LOCATION = 'location',
}

export class CreateEmployeeDto {
    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Organization UUID' })
    @IsUUID('4', { message: 'orgId must be a valid UUID v4' })
    @IsNotEmpty({ message: 'orgId is required' })
    orgId!: string;

    @ApiProperty({ example: 'alex.worker@example.com', description: 'Work or personal email' })
    @IsEmail({}, { message: 'A valid email address is required' })
    @IsNotEmpty({ message: 'Email is required' })
    email!: string;

    @ApiProperty({ example: 'Alex Mercer', description: 'Full legal name' })
    @IsString()
    @IsNotEmpty({ message: 'Full name is required' })
    @MaxLength(100, { message: 'Full name cannot exceed 100 characters' })
    fullName!: string;

    @ApiProperty({ example: '+15195550199', description: 'Contact phone number (E.164 format)', required: false })
    @IsPhoneNumber(undefined, { message: 'Phone must be a valid international phone number' })
    @IsOptional()
    phone?: string;

    @ApiProperty({ example: 'Employee', description: 'Role name: Employee, Manager, or Admin', default: 'Employee' })
    @IsString()
    @IsNotEmpty()
    roleName!: string;

    @ApiProperty({ enum: RoleScope, example: RoleScope.LOCATION, description: 'Role assignment scope' })
    @IsEnum(RoleScope, { message: 'scopeType must be either "organization" or "location"' })
    scopeType!: RoleScope;

    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'UUID of the target Location or Organization' })
    @IsUUID('4', { message: 'scopeId must be a valid UUID v4' })
    @IsNotEmpty({ message: 'scopeId is required' })
    scopeId!: string;

    @ApiProperty({
        example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
        description: 'Array of Position UUIDs to assign to this employee',
        required: false,
    })
    @IsArray()
    @IsUUID('4', { each: true, message: 'Each positionId must be a valid UUID v4' })
    @IsOptional()
    positionIds?: string[];
}

export class UpdateEmployeeProfileDto extends PartialType(CreateEmployeeDto) { }

export class AssignPositionsDto {
    @ApiProperty({
        example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
        description: 'Complete list of Position UUIDs assigned to this employee',
    })
    @IsArray()
    @IsUUID('4', { each: true, message: 'Each positionId must be a valid UUID v4' })
    @IsNotEmpty({ message: 'positionIds array cannot be empty' })
    positionIds!: string[];
}