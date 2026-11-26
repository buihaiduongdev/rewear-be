import {
  Controller,
  Get,
  type MessageEvent,
  Param,
  Patch,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  ApiPaginationQuery,
  Paginate,
  type PaginateQuery,
} from 'nestjs-paginate';
import type { Observable } from 'rxjs';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { NOTIFICATION_PAGINATION_CONFIG } from './constants/notification-pagination.config';
import { NotificationService } from './notification.service';
import {
  markAllReadResponseSchema,
  notificationResponseSchema,
  paginatedNotificationResponseSchema,
  unreadCountResponseSchema,
} from './schemas/notification.schema';

@ApiTags('Notifications')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiPaginationQuery(NOTIFICATION_PAGINATION_CONFIG)
  @Serialize(paginatedNotificationResponseSchema)
  @Get()
  findAll(@CurrentUser() user: User, @Paginate() query: PaginateQuery) {
    return this.notificationService.findAll(user.id, query);
  }

  @Sse('stream')
  stream(@CurrentUser() user: User): Observable<MessageEvent> {
    return this.notificationService.subscribe(user.id);
  }

  @Serialize(unreadCountResponseSchema)
  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: User) {
    return this.notificationService.getUnreadCount(user.id);
  }

  @Serialize(markAllReadResponseSchema)
  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: User) {
    return this.notificationService.markAllAsRead(user.id);
  }

  @Serialize(notificationResponseSchema)
  @Patch(':id/read')
  markAsRead(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.notificationService.markAsRead(user.id, id);
  }
}
