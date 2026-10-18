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

  @ApiProperty({ example: '79', maxLength: 20 })
  @Trim()
  @IsString()
  @Length(1, 20)
  provinceCode: string;

  @ApiProperty({ example: 'Thành phố Hồ Chí Minh', maxLength: 100 })
  @Trim()
  @IsString()
  @Length(1, 100)
  provinceName: string;

  @ApiProperty({ example: '26734', maxLength: 20 })
  @Trim()
  @IsString()
  @Length(1, 20)
  wardCode: string;

  @ApiProperty({ example: 'Phường Bến Nghé', maxLength: 100 })
  @Trim()
  @IsString()
  @Length(1, 100)
  wardName: string;

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
