import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

@Entity('owner_identities')
@Index(['ownerId'], { unique: true })
export class OwnerIdentity extends BaseEntity {
  @Column('uuid')
  ownerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;
  @Column('uuid')
  applicationId: string;
  @Column('varchar', { length: 200 })
  normalizedName: string;
  @Column('date')
  birthDate: string;
}
