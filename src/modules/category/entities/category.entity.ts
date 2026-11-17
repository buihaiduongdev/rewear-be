import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { MeasurementKey } from '@/common/schemas/measurements.schema';

@Entity('categories')
@Index('UQ_categories_slug', ['slug'], { unique: true })
export class Category extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ length: 120 })
  slug: string;

  @Column({ type: 'jsonb', default: [] })
  requiredMeasurements: MeasurementKey[];

  @Column({ default: true })
  isActive: boolean;
}
