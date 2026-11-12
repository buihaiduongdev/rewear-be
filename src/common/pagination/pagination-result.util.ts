import type { Paginated } from 'nestjs-paginate';

import type { IPaginatedResult } from './pagination.interface';

export function toPaginatedResult<T>(
  result: Paginated<T>,
  page = result.meta.currentPage ?? 1,
): IPaginatedResult<T> {
  const pageSize = result.meta.itemsPerPage;
  const total = result.meta.totalItems ?? result.data.length;
  const totalPage = result.meta.totalPages ?? Math.ceil(total / pageSize);

  return {
    items: result.data,
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
