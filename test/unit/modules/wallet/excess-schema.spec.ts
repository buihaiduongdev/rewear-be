import { randomUUID } from 'node:crypto';

import z from 'zod';

import * as schemas from '@/modules/wallet/excess/schemas/excess.schema';

describe('Wallet recovery schemas', () => {
  it('rejects ownership injection, duplicate targets, implicit withdrawal and missing evidence', () => {
    const id = randomUUID();
    expect(
      schemas.excessVerifySchema.safeParse({
        requestId: id,
        sourceType: 'CANCELLATION',
        sourceId: id,
        authorizedAmount: 0,
        reason: 'Valid reason',
        evidence: 'Verified evidence',
        buyerId: id,
      }).success,
    ).toBe(false);
    expect(
      schemas.excessPaySchema.safeParse({
        requestId: id,
        excessIds: [id, id],
        amount: 1000,
      }).success,
    ).toBe(false);
    expect(
      schemas.excessWithdrawSchema.safeParse({ requestId: id }).success,
    ).toBe(false);
    expect(
      schemas.excessObjectSchema.safeParse({
        requestId: id,
        reason: 'Specific reason',
      }).success,
    ).toBe(false);
  });
  it('bounds pagination and exports OpenAPI compatible schemas', () => {
    expect(schemas.excessQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    for (const schema of Object.values(schemas))
      expect(() => z.toJSONSchema(schema)).not.toThrow();
  });
});
