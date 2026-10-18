import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { IsEnum, IsOptional } from 'class-validator';

import { ShopStatus } from '../enums';
import { CreateShopDto } from './create-shop.dto';

export class UpdateShopDto extends PartialType(CreateShopDto) {
  @ApiPropertyOptional({ enum: ShopStatus })
  @IsOptional()
  @IsEnum(ShopStatus)
  status?: ShopStatus;
}
