import type { CallHandler, ExecutionContext } from '@nestjs/common';

import { firstValueFrom, of } from 'rxjs';
import { z } from 'zod';

import { SerializeInterceptor } from '@/common/interceptors';
import { dateTimeSchema } from '@/common/schemas';

describe('SerializeInterceptor', () => {
  it('parses an array schema directly and removes fields outside the schema', async () => {
    const schema = z.array(
      z.object({
        id: z.string(),
      }),
    );
    const interceptor = new SerializeInterceptor(schema);
    const next: CallHandler = {
      handle: () => of([{ id: 'item-1', secret: 'hidden' }]),
    };

    const result = await firstValueFrom(
      interceptor.intercept({} as ExecutionContext, next),
    );

    expect(result).toEqual([{ id: 'item-1' }]);
  });

  it('serializes dates to the ISO strings returned by the API', async () => {
    const interceptor = new SerializeInterceptor(
      z.object({ createdAt: dateTimeSchema }),
    );
    const next: CallHandler = {
      handle: () => of({ createdAt: new Date('2026-10-19T12:00:00.000Z') }),
    };

    const result = await firstValueFrom(
      interceptor.intercept({} as ExecutionContext, next),
    );

    expect(result).toEqual({ createdAt: '2026-10-19T12:00:00.000Z' });
  });
});
