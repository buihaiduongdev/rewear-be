import { ApiProperty } from '@nestjs/swagger';

import { IsEmail, IsString, Length } from 'class-validator';

export class RegisterDto {
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
}
