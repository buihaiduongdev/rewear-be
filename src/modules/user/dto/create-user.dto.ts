import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';

import { UserRole, UserStatus } from '../enums';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @Length(8, 72)
  password: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @Length(1, 255)
  fullName: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
