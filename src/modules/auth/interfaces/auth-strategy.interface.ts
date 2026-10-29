import type { User } from '@/modules/user/entities';

export interface AuthStrategy<TInput> {
  validate(input: TInput): Promise<User>;
}
