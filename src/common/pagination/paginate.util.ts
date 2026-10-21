import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { PAGINATION_DEFAULT, PAGINATION_ORDER } from '@/common/constants';

import { IPaginatedResult, IPaginateOptions } from './pagination.interface';
import type { PaginationQuery } from './pagination.schema';

export async function paginate<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  { page, pageSize, order, sortBy: requestedSortBy }: Partial<PaginationQuery>,
  { defaultOrder, allowedSorts, defaultSort }: IPaginateOptions = {},
): Promise<IPaginatedResult<T>> {
  page = page && page > 0 ? page : PAGINATION_DEFAULT.PAGE;
  pageSize =
    pageSize && pageSize > 0
      ? Math.min(pageSize, PAGINATION_DEFAULT.PAGE_SIZE_MAX)
      : PAGINATION_DEFAULT.PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  order = order ?? defaultOrder ?? PAGINATION_ORDER.DESC;

  const sortBy =
    requestedSortBy &&
    allowedSorts &&
    Object.hasOwn(allowedSorts, requestedSortBy)
      ? allowedSorts[requestedSortBy]
      : defaultSort;

  if (sortBy) {
    queryBuilder.orderBy(sortBy, order);
  }

  const [items, total] = await queryBuilder
    .skip(skip)
    .take(pageSize)
    .getManyAndCount();

  const totalPage = Math.ceil(total / pageSize);
  return {
    items,
    meta: {
      page,
      pageSize,
      total,
      totalPage,
      hasNextPage: page < totalPage,
      hasPreviousPage: page > 1,
    },
  };
}
