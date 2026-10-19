import { ApiProperty } from '@nestjs/swagger';

import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class ConfirmMediaUploadDto {
  @ApiProperty({
    example:
      'products/598745cf-8764-499a-ad43-e6223713ee90/f844ab9a-6f7a-4495-bc34-064bf3bf32d5.jpg',
  })
  @IsString()
  @MaxLength(512)
  storageKey!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @ApiProperty({ example: 524288 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
