import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Request } from 'express';

import type { User } from '@/modules/user/entities';

export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, context: ExecutionContext): unknown => {
    const user = context
      .switchToHttp()
      .getRequest<Request & { user?: User }>().user;
    return data && user ? user[data] : user;
  },
);
