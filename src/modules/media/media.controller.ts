import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Serialize } from '@/common/decorators';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { MediaService } from './media.service';
import { createMediaUploadTicketSchema } from './schemas/media-input.schema';
import type { CreateMediaUploadTicketInput } from './schemas/media-input.schema';

@ApiTags('Media')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('media')
export class MediaController {
  constructor(private readonly uploads: MediaService) {}

  @Post('upload-ticket')
  @Serialize(
    z.object({
      id: z.uuid(),
      uploadUrl: z.url(),
      method: z.literal('PUT'),
      headers: z.record(z.string(), z.string()),
    }),
    {
      status: HttpStatus.CREATED,
    },
  )
  async ticket(
    @CurrentUser() user: User,
    @Body({ schema: createMediaUploadTicketSchema })
    input: CreateMediaUploadTicketInput,
  ) {
    const ticket = await this.uploads.createUploadTicket(user.id, input);
    return {
      id: ticket.mediaId,
      uploadUrl: ticket.uploadUrl,
      method: ticket.method,
      headers: ticket.headers,
    };
  }
}
