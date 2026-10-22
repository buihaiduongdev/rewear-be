import { TPaginationOrder } from '@/common/constants';

export interface IPaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface IPaginatedResult<T> {
  items: T[];
  meta: IPaginationMeta;
}

export interface IPaginateOptions {
  allowedSorts?: Record<string, string>;

  defaultSort?: string;

  defaultOrder?: TPaginationOrder;
}
