import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { MeasurementKey } from '@/common/schemas/measurements.schema';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ length: 120, unique: true })
  slug: string;

  @Column({ type: 'jsonb', default: [] })
  requiredMeasurements: MeasurementKey[];

  @Column({ default: true })
  isActive: boolean;
}
