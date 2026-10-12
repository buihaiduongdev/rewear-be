export enum EPaginationOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export const PAGINATION_DEFAULT = {
  PAGE: 1,
  PAGE_SIZE: 10,
  PAGE_SIZE_MAX: 100,
} as const;

export const PAGINATION_ORDER = EPaginationOrder;
export type TPaginationOrder = EPaginationOrder;
