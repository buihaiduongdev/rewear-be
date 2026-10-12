import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  tokenHash: string;

  @Column()
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
