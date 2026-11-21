import type { EntityManager, EntityTarget } from 'typeorm';

import type { BaseEntity } from '@/common/entities';

import type { NotificationInput } from '../types/notification.type';

export type NotificationSource<T extends BaseEntity = BaseEntity> = {
  entity: EntityTarget<T>;
  prefix: string;
  build(
    manager: EntityManager,
    row: T,
  ): Promise<Omit<NotificationInput, 'key' | 'email'>>;
  importantEmail?: boolean;
};
