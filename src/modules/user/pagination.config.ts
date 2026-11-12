import { FilterOperator, type PaginateConfig } from 'nestjs-paginate';

import { User } from './entities';

export const USER_PAGINATION_CONFIG: PaginateConfig<User> = {
  sortableColumns: ['createdAt', 'email', 'fullName', 'id'],
  defaultSortBy: [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ],
  searchableColumns: ['fullName', 'email'],
  filterableColumns: { role: [FilterOperator.EQ], status: [FilterOperator.EQ] },
  defaultLimit: 10,
  maxLimit: 100,
};
