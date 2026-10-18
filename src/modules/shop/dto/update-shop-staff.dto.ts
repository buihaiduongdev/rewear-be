import { ApiProperty } from '@nestjs/swagger';

import { IsEnum } from 'class-validator';

import { ShopMemberStatus } from '../enums';

export class UpdateShopStaffDto {
  @ApiProperty({ enum: ShopMemberStatus })
  @IsEnum(ShopMemberStatus)
  status: ShopMemberStatus;
}
