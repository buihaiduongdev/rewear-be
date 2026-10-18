import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { Trim } from '@/common/decorators';

export class CreateUserAddressDto {
  @ApiProperty({ example: 'Nguyễn Văn A', maxLength: 100 })
  @Trim()
  @IsString()
  @Length(1, 100)
  recipientName: string;

  @ApiPropertyOptional({ example: 'Nhà', maxLength: 50, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  label?: string | null;

  @ApiProperty({ example: '0912345678' })
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/)
  phone: string;

  @ApiProperty({ example: '12 Nguyễn Huệ', maxLength: 255 })
  @Trim()
  @IsString()
  @Length(1, 255)
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Tầng 2', maxLength: 255, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  addressLine2?: string | null;

  @ApiPropertyOptional({ example: 'VN', default: 'VN', enum: ['VN'] })
  @Trim()
  @IsOptional()
  @IsString()
  @IsIn(['VN'])
  countryCode?: string;

  @ApiProperty({ example: '79', description: 'Two-digit province code' })
  @Trim()
  @IsString()
  @Matches(/^\d{2}$/)
  provinceCode: string;

  @ApiProperty({ example: '25747', description: 'Five-digit ward code' })
  @Trim()
  @IsString()
  @Matches(/^\d{5}$/)
  wardCode: string;

  @ApiPropertyOptional({ example: '700000', maxLength: 20, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string | null;

  @ApiPropertyOptional({
    example: 'Gọi trước khi giao',
    maxLength: 255,
    nullable: true,
  })
  @Trim()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  deliveryInstructions?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
