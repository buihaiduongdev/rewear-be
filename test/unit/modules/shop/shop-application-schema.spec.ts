import { randomUUID } from 'node:crypto';

import z from 'zod';

import * as schemas from '@/modules/shop/applications/schemas/shop-application.schema';
import { validateApplicantIdentity } from '@/modules/shop/applications/shop-application.service';

describe('Shop application validation', () => {
  const identity = {
    documentType: 'NATIONAL_ID' as const,
    documentNumber: '012345678901',
    issuingCountry: 'VN',
    fullName: 'Applicant Owner',
    birthDate: '2000-01-01',
    expiresOn: '2099-01-01',
  };

  it('validates document formats, strict payloads, and decision fields', () => {
    expect(
      schemas.applicantIdentitySchema.safeParse({
        ...identity,
        documentNumber: 'abcdef',
      }).success,
    ).toBe(false);
    expect(
      schemas.applicantIdentitySchema.safeParse({
        ...identity,
        birthDate: '2025-02-29',
      }).success,
    ).toBe(false);
    expect(
      schemas.applicationDecisionSchema.safeParse({
        outcome: 'APPROVED',
        reason: 'ok',
      }).success,
    ).toBe(false);
    expect(
      schemas.applicationDecisionSchema.safeParse({
        outcome: 'APPROVED',
        reason: 'Verified owner identity and shop details',
      }).success,
    ).toBe(true);
    expect(
      schemas.applicationSubmitSchema.safeParse({
        identity,
        bankAccountId: randomUUID(),
        documentIds: [randomUUID()],
        applicantId: randomUUID(),
      }).success,
    ).toBe(false);
  });

  it('uses Vietnam dates for age and expiry checks', () => {
    const now = new Date('2026-11-22T17:00:00Z');
    expect(() =>
      validateApplicantIdentity({ ...identity, birthDate: '2008-11-23' }, now),
    ).not.toThrow();
    expect(() =>
      validateApplicantIdentity({ ...identity, birthDate: '2008-11-24' }, now),
    ).toThrow('18');
    expect(() =>
      validateApplicantIdentity({ ...identity, expiresOn: '2026-11-22' }, now),
    ).toThrow('expired');
  });

  it('bounds queue/media and converts every exported schema to OpenAPI JSON schema', () => {
    expect(
      schemas.applicationQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
    expect(
      schemas.applicationUploadSchema.safeParse({
        slot: 'SELFIE',
        mediaId: randomUUID(),
      }).success,
    ).toBe(false);
    for (const schema of Object.values(schemas))
      expect(() => z.toJSONSchema(schema)).not.toThrow();
  });
});
