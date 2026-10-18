import { ApiProperty } from '@nestjs/swagger';

import { IsIn } from 'class-validator';

import { ProductStatus } from '../enums';

const MUTABLE_PRODUCT_STATUSES = [
  ProductStatus.ACTIVE,
  ProductStatus.HIDDEN,
  ProductStatus.SOLD,
] as const;

export class UpdateProductStatusDto {
  @ApiProperty({ enum: MUTABLE_PRODUCT_STATUSES })
  @IsIn(MUTABLE_PRODUCT_STATUSES)
  status: (typeof MUTABLE_PRODUCT_STATUSES)[number];
}
