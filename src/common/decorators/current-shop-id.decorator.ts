import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Request } from 'express';

export const CurrentShopId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-shop-id'];
    return typeof header === 'string' ? header : undefined;
  },
);
