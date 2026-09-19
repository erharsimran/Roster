import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
    @ApiProperty({ example: 'admin@example.com', description: 'Registered user or admin email' })
    @IsEmail({}, { message: 'Must be a valid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email!: string;

    @ApiProperty({ example: 'Admin123!', description: 'Account password' })
    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;
}