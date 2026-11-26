import { FilterOperator, type PaginateConfig } from 'nestjs-paginate';

import type { Notification } from '../entities/notification.entity';

export const NOTIFICATION_PAGINATION_CONFIG: PaginateConfig<Notification> = {
  sortableColumns: ['createdAt', 'isRead'],
  defaultSortBy: [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ],
  filterableColumns: {
    isRead: [FilterOperator.EQ],
  },
  defaultLimit: 20,
  maxLimit: 100,
};
