import { ApiProperty } from '@nestjs/swagger';

import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreateMediaUploadTicketDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @ApiProperty({ example: 524288 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
