import type { User } from '@/modules/user/entities';

import type { LoginInput } from '../schemas/auth-input.schema';

export interface AuthStrategy {
  validate(input: LoginInput): Promise<User>;
}
