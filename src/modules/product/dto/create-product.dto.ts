import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Trim } from '@/common/decorators';

import { ProductCondition } from '../enums';

export class CreateProductDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @ApiProperty({ maxLength: 150 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: ProductCondition })
  @IsEnum(ProductCondition)
  condition: ProductCondition;

  @ApiPropertyOptional({ maxLength: 50 })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  size?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  price: number;
}
