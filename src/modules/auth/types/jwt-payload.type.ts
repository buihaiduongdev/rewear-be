import type { UserRole } from '@/modules/user/enums';

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

export type RefreshJwtPayload = JwtPayload & { tokenId: string };
