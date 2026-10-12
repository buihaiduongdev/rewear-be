import type { User } from '@/modules/user/entities';

import type { LoginDto } from '../dto';

export interface AuthStrategy {
  validate(loginDto: LoginDto): Promise<User>;
}
