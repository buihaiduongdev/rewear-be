import { randomUUID } from 'node:crypto';

import z from 'zod';

import * as schemas from '@/modules/reports/schemas/report.schema';

describe('Violation report contracts', () => {
  it('rejects client ownership, unsupported images and duplicate attachments', () => {
    const id = randomUUID();
    const input = {
      requestId: randomUUID(),
      targetType: 'SHOP',
      targetId: randomUUID(),
      reason: 'FRAUD',
      description: 'Mô tả cần được Admin kiểm tra',
      evidenceIds: [id, id],
    };
    expect(schemas.createReportSchema.safeParse(input).success).toBe(false);
    expect(
      schemas.createReportSchema.safeParse({
        ...input,
        evidenceIds: [],
        reporterId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      schemas.reportUploadSchema.safeParse({
        targetType: 'SHOP',
        targetId: randomUUID(),
        mimeType: 'video/mp4',
        sizeBytes: 100,
      }).success,
    ).toBe(false);
  });
  it('requires an explicit safe outcome/measure and current Product review version', () => {
    const input = {
      requestId: randomUUID(),
      expectedVersion: 1,
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
