import { ApiProperty } from '@nestjs/swagger';

import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

import { AuthProvider } from '../enums';

export class LoginDto {
  @ApiProperty()
  @IsEnum(AuthProvider)
  provider: AuthProvider;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({ required: false, description: 'Google ID token' })
  @IsOptional()
  @IsString()
  token?: string;
}
