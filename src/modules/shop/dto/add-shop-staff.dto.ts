import { ApiProperty } from '@nestjs/swagger';

import { IsUUID } from 'class-validator';

export class AddShopStaffDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;
}
