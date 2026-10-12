import { ApiProperty } from '@nestjs/swagger';

import { IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @Length(1, 255)
  fullName: string;
}
