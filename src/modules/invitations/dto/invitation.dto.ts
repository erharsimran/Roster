import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MinLength,
} from 'class-validator';
import { ScopeType } from '@prisma/client';

export class CreateOrgOwnerInviteDto {
    @ApiProperty({ example: 'owner@newbusiness.com', description: 'Prospective business owner email' })
    @IsEmail({}, { message: 'Must be a valid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email!: string;
}

export class ClaimOrgOwnerInviteDto {
    @ApiProperty({ example: 'a9b8c7...', description: 'Cryptographic invite token' })
    @IsString()
    @IsNotEmpty({ message: 'Invitation token is required' })
    token!: string;

    @ApiProperty({ example: 'Jordan Belfort' })
    @IsString()
    @IsNotEmpty({ message: 'Full name is required' })
    fullName!: string;

    @ApiProperty({ example: 'SecurePassword123!', minLength: 8 })
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    password!: string;

    @ApiProperty({ example: 'Apex Logistics Inc.' })
    @IsString()
    @IsNotEmpty({ message: 'Organization name is required' })
    organizationName!: string;

    @ApiProperty({ example: 'Central Warehouse Hub' })
    @IsString()
    @IsNotEmpty({ message: 'Primary location name is required' })
    primaryLocationName!: string;

    @ApiProperty({ example: 'America/Toronto', default: 'UTC', required: false })
    @IsString()
    @IsOptional()
    timezone?: string;
}

export class CreateMemberInviteDto {
    @ApiProperty({ example: 'worker@business.com' })
    @IsEmail({}, { message: 'Must be a valid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email!: string;

    @ApiProperty({ example: 'Employee', description: 'Existing organization role name' })
    @IsString()
    @IsNotEmpty({ message: 'Role name is required' })
    roleName!: string;

    @ApiProperty({ enum: ScopeType, example: ScopeType.location })
    @IsEnum(ScopeType, { message: 'Scope must be either organization or location' })
    scopeType!: ScopeType;

    @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
    @IsUUID('4', { message: 'scopeId must be a valid UUID v4' })
    @IsNotEmpty({ message: 'scopeId is required' })
    scopeId!: string;

    @ApiProperty({
        example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
        required: false,
        type: [String],
    })
    @IsArray()
    @IsUUID('4', { each: true, message: 'Each positionId must be a valid UUID v4' })
    @IsOptional()
    positionIds?: string[];
}

export class ClaimMemberInviteDto {
    @ApiProperty({ example: 'a9b8c7...' })
    @IsString()
    @IsNotEmpty({ message: 'Invitation token is required' })
    token!: string;

    @ApiProperty({ example: 'Alex Mercer' })
    @IsString()
    @IsNotEmpty({ message: 'Full name is required' })
    fullName!: string;

    @ApiProperty({ example: 'SecureWorkerPass123!', minLength: 8 })
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    password!: string;

    @ApiProperty({ example: '+15195550199', required: false })
    @IsString()
    @IsOptional()
    phone?: string;
}

export class LoginDto {
    @ApiProperty({ example: 'admin@example.com' })
    @IsEmail({}, { message: 'Must be a valid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email!: string;

    @ApiProperty({ example: 'Password123!' })
    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;
}