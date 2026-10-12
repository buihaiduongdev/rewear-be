import { Column, Entity, Index, OneToMany } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { AuthToken } from '@/modules/auth/entities/auth-token.entity';
import type { RefreshToken } from '@/modules/auth/entities/refresh-token.entity';
import { AuthProvider } from '@/modules/auth/enums';

import { UserRole, UserStatus } from '../enums';

@Entity('users')
@Index(['provider', 'providerAccountId'], { unique: true })
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  password: string | null;

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: AuthProvider })
  provider: AuthProvider;

  @Column({ type: 'varchar', nullable: true })
  providerAccountId: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.INACTIVE })
  status: UserStatus;

  @OneToMany('RefreshToken', 'user')
  refreshTokens: RefreshToken[];

  @OneToMany('AuthToken', 'user')
  authTokens: AuthToken[];
}
