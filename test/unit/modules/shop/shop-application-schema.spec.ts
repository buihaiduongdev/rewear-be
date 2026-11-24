import { randomUUID } from 'node:crypto';

import z from 'zod';

import {
  applicationFingerprint,
  validateApplicantIdentity,
} from '@/modules/shop/applications/policies/shop-application.policy';
import * as schemas from '@/modules/shop/applications/schemas/shop-application.schema';

describe('Shop application validation', () => {
  const identity = {
    documentType: 'NATIONAL_ID' as const,
    documentNumber: '012345678901',
    issuingCountry: 'VN',
    fullName: 'Applicant Owner',
    birthDate: '2000-01-01',
    expiresOn: '2099-01-01',
  };
  it('requires actual document formats and explicit identity checks for approval', () => {
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
        requestId: randomUUID(),
        expectedVersion: 1,
        outcome: 'APPROVED',
        reason: 'Looks good',
      }).success,
    ).toBe(false);
    expect(
      schemas.applicationSubmitSchema.safeParse({
        requestId: randomUUID(),
        expectedVersion: 1,
        identity,
        bankAccountId: randomUUID(),
        documentIds: [randomUUID()],
        applicantId: randomUUID(),
      }).success,
    ).toBe(false);
  });
  it('uses Vietnam dates for age and expiry and survives JSONB key ordering', () => {
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
    expect(applicationFingerprint({ identity, a: 1 })).toBe(
      applicationFingerprint({
        a: 1,
        identity: Object.fromEntries(Object.entries(identity).reverse()),
      }),
    );
  });
  it('bounds queue/media and converts every exported schema to OpenAPI JSON schema', () => {
    expect(
      schemas.applicationQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
    expect(
      schemas.applicationUploadSchema.safeParse({
        slot: 'SELFIE',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }).success,
    ).toBe(false);
    for (const schema of Object.values(schemas))
      expect(() => z.toJSONSchema(schema)).not.toThrow();
  });
});
