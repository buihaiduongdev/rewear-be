import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { User } from '@/modules/user/entities';

import { AuthTokenType } from '../enums';

@Entity('auth_tokens')
export class AuthToken extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  tokenHash: string;

  @Column({ type: 'enum', enum: AuthTokenType })
  type: AuthTokenType;

  @Column()
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, (user) => user.authTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
