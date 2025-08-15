// src/auth/dtos/register.dto.ts

import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  username: string; // New field

  @IsString()
  @IsNotEmpty()
  fullName: string; // New field

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
