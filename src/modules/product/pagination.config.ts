import { FilterOperator, type PaginateConfig } from 'nestjs-paginate';

import { Product } from './entities';

export const PRODUCT_PAGINATION_CONFIG: PaginateConfig<Product> = {
  sortableColumns: ['createdAt', 'price', 'publishedAt', 'id'],
  defaultSortBy: [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ],
  searchableColumns: ['title', 'description', 'brand'],
  filterableColumns: {
    categoryId: [FilterOperator.EQ],
    shopId: [FilterOperator.EQ],
    sellerUserId: [FilterOperator.EQ],
    condition: [FilterOperator.EQ],
    status: [FilterOperator.EQ],
    size: [FilterOperator.ILIKE],
    color: [FilterOperator.ILIKE],
    brand: [FilterOperator.ILIKE],
    price: [FilterOperator.GTE, FilterOperator.LTE],
  },
  defaultLimit: 10,
  maxLimit: 100,
};
