import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class CreateRoleDto {
    @ApiProperty({
        example: 'Shift Supervisor',
        description: 'Unique role name within the organization',
    })
    @IsString()
    @IsNotEmpty({ message: 'Role name is required' })
    @MaxLength(50, { message: 'Role name cannot exceed 50 characters' })
    name!: string;

    @ApiPropertyOptional({
        example: [1, 2, 5],
        description: 'List of permission IDs to grant to this role',
        type: [Number],
    })
    @IsArray()
    @IsInt({ each: true, message: 'Each permission ID must be an integer' })
    @IsOptional()
    permissionIds?: number[];
}

export class UpdateRoleDto {
    @ApiPropertyOptional({
        example: 'Lead Floor Supervisor',
        description: 'Updated role name',
    })
    @IsString()
    @IsOptional()
    @MaxLength(50, { message: 'Role name cannot exceed 50 characters' })
    name?: string;

    @ApiPropertyOptional({
        example: [1, 2, 3, 4],
        description: 'Updated list of permission IDs to synchronize with this role',
        type: [Number],
    })
    @IsArray()
    @IsInt({ each: true, message: 'Each permission ID must be an integer' })
    @IsOptional()
    permissionIds?: number[];
}