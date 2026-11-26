import { randomUUID } from 'node:crypto';

import z from 'zod';

import * as schemas from '@/modules/reports/schemas/report.schema';

describe('Violation report contracts', () => {
  it('rejects client ownership and duplicate media attachments', () => {
    const id = randomUUID();
    const input = {
      targetType: 'SHOP',
      targetId: randomUUID(),
      reason: 'FRAUD',
      description: 'Mô tả cần được Admin kiểm tra',
      mediaIds: [id, id],
    };
    expect(schemas.createReportSchema.safeParse(input).success).toBe(false);
    expect(
      schemas.createReportSchema.safeParse({
        ...input,
        mediaIds: [],
        reporterId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      schemas.createReportSchema.safeParse({
        ...input,
        mediaIds: [id],
      }).success,
    ).toBe(true);
  });

  it('requires an explicit safe outcome/measure and current Product review version', () => {
    const input = {
      outcome: 'DISMISSED',
      action: 'DEACTIVATE_SHOP',
      reason: 'Không có căn cứ kết luận',
    };
    expect(schemas.resolveReportSchema.safeParse(input).success).toBe(false);
    expect(
      schemas.resolveReportSchema.safeParse({
        ...input,
        outcome: 'CONFIRMED',
        action: 'SUSPEND_PRODUCT',
      }).success,
    ).toBe(false);
    expect(
      schemas.resolveReportSchema.safeParse({
        ...input,
        outcome: 'CONFIRMED',
        action: 'SUSPEND_PRODUCT',
        expectedTargetVersion: 2,
      }).success,
    ).toBe(true);
  });

  it('bounds queue pagination and uses JSON-compatible response dates', () => {
    expect(schemas.reportQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(schemas.reportQuerySchema.parse({})).toEqual({
      limit: 50,
      offset: 0,
    });
    for (const schema of Object.values(schemas))
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
  });
});
