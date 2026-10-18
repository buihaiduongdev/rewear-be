import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateShopDto {
  @ApiProperty({ example: 'Re.wear Closet', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  @Matches(/\S/, { message: 'name must contain non-whitespace characters' })
  name: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
}
