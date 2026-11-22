import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { NotificationService } from './notification.service';
import {
  notificationPageSchema,
  notificationQuerySchema,
  notificationViewSchema,
  unreadCountSchema,
} from './schemas/notification.schema';
import type { NotificationQuery } from './schemas/notification.schema';

@ApiTags('Notifications')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}
  @Get()
  @Serialize(notificationPageSchema)
  list(
    @CurrentUser() user: User,
    @Query({ schema: notificationQuerySchema }) query: NotificationQuery,
  ) {
    return this.service.list(user.id, query);
  }
  @Get('unread-count')
  @Serialize(unreadCountSchema)
  unread(@CurrentUser() user: User) {
    return this.service.unread(user.id);
  }
  @Patch('read-all')
  @Serialize(unreadCountSchema)
  readAll(@CurrentUser() user: User) {
    return this.service.readAll(user.id);
  }
  @Patch(':id/read')
  @Serialize(notificationViewSchema)
  read(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.service.read(user.id, id);
  }
}
