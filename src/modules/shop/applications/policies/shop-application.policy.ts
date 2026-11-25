import { createHash } from 'node:crypto';

import { BadRequestException, ConflictException } from '@nestjs/common';

import { EntityManager, In, IsNull } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { Media } from '@/modules/media/entities';
import { VIETNAM_UTC_OFFSET_MS } from '@/modules/shipment/constants/calendar.constant';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopBankAccount } from '@/modules/shop-finance/payouts/entities/shop-bank-account.entity';

import { Shop } from '../../entities';
import { ShopStatus } from '../../enums';
import {
  IDENTITY_DOCUMENT_SLOT,
  IDENTITY_DOCUMENT_TYPE,
  SHOP_APPLICATION_KIND,
  SHOP_APPLICATION_POLICY,
  SHOP_APPLICATION_STATE,
} from '../constants/shop-application.constant';
import {
  ShopApplication,
  ShopApplicationDocument,
} from '../entities/shop-application.entity';
import type {
  ApplicantIdentity,
  ShopApplicationSnapshot,
  ShopApplicationState,
} from '../types/shop-application.type';

function canonicalApplicationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalApplicationValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonicalApplicationValue(v)]),
    );
  return value;
}
export const applicationFingerprint = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalApplicationValue(value)))
    .digest('hex');
export const normalizeIdentityName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toUpperCase()
    .replaceAll('Đ', 'D')
    .replace(/\s+/g, ' ');
export const identityFingerprint = (identity: ApplicantIdentity) =>
  applicationFingerprint({
    type: identity.documentType,
    country: identity.issuingCountry,
    number: identity.documentNumber,
  });
export const editableApplication = (state: ShopApplicationState) =>
  (
    [
      SHOP_APPLICATION_STATE.DRAFT,
      SHOP_APPLICATION_STATE.NEEDS_INFO,
      SHOP_APPLICATION_STATE.REJECTED,
    ] as readonly string[]
  ).includes(state);
export function validateApplicantIdentity(
  identity: ApplicantIdentity,
  now: Date,
) {
  const today = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  const adultOn =
    String(
      Number(identity.birthDate.slice(0, 4)) + SHOP_APPLICATION_POLICY.MIN_AGE,
    ) + identity.birthDate.slice(4);
  const underage = identity.birthDate > today || adultOn > today;
  if (underage)
    throw new BadRequestException(
      'Shop Owner must be at least 18 at submission and approval',
    );
  if (identity.expiresOn < today)
    throw new BadRequestException('Identity document has expired');
}
export async function pendingApplicationShop(
  manager: EntityManager,
  row: Pick<ShopApplication, 'shopId'> & Partial<Pick<ShopApplication, 'kind'>>,
) {
  const shop = await manager.findOneOrFail(Shop, {
    where: { id: row.shopId },
    lock: { mode: 'pessimistic_read' },
  });
  if (row.kind === SHOP_APPLICATION_KIND.RENEWAL) {
    if (!shop.onboardingRequired || !shop.approvedAt)
      throw new ConflictException(
        'Approved Shop identity is required for renewal',
      );
    return shop;
  }
  const pending =
    shop.onboardingRequired &&
    shop.status === ShopStatus.PENDING &&
    !shop.approvedAt;
  if (!pending)
    throw new ConflictException('Shop is not awaiting onboarding approval');
  return shop;
}
export async function buildApplicationSnapshot(
  manager: EntityManager,
  row: ShopApplication,
  identity: ApplicantIdentity,
  bankAccountId: string,
  documentIds: string[],
  storage: StorageService,
): Promise<ShopApplicationSnapshot> {
  const shop = await pendingApplicationShop(manager, row);
  const logo = shop.logoMediaId
    ? await manager.findOneBy(Media, {
        id: shop.logoMediaId,
        visibility: 'public',
      })
    : null;
  if (!logo || logo.retiredAt || !shop.name.trim())
    throw new BadRequestException('Shop name and logo are required');
  const pickup = await manager.findOneBy(PickupLocation, {
    shopId: row.shopId,
  });
  if (!pickup)
    throw new BadRequestException('Shop pickup location is required');
  const bank = await manager.findOneBy(ShopBankAccount, {
    id: bankAccountId,
    shopId: row.shopId,
    confirmedBy: row.applicantId,
    deletedAt: IsNull(),
  });
  if (!bank)
    throw new BadRequestException(
      'Current Owner-confirmed bank account is required',
    );
  const docs = await manager.find(ShopApplicationDocument, {
    where: {
      id: In(documentIds),
      applicationId: row.id,
      uploadedById: row.applicantId,
    },
    order: { slot: 'ASC', id: 'ASC' },
  });
  const required =
    identity.documentType === IDENTITY_DOCUMENT_TYPE.NATIONAL_ID
      ? [IDENTITY_DOCUMENT_SLOT.FRONT, IDENTITY_DOCUMENT_SLOT.BACK]
      : [IDENTITY_DOCUMENT_SLOT.PASSPORT];
  const validDocuments =
    docs.length === documentIds.length &&
    docs.length === required.length &&
    required.every(
      (slot) =>
        docs.filter((d) => d.slot === slot && !d.media.retiredAt).length === 1,
    );
  if (!validDocuments)
    throw new BadRequestException(
      'Required owned identity documents are missing',
    );
  return {
    identity,
    shop: {
      id: shop.id,
      name: shop.name,
      description: shop.description,
      logoUrl: storage.getPublicUrl(logo.storageKey),
    },
    pickup: {
      id: pickup.id,
      contactName: pickup.contactName,
      phone: pickup.phone,
      addressLine1: pickup.addressLine1,
      countryCode: pickup.countryCode,
      provinceId: pickup.provinceId,
      districtId: pickup.districtId,
      districtName: pickup.districtName,
      provinceName: pickup.provinceName,
      wardCode: pickup.wardCode,
      wardName: pickup.wardName,
    },
    bank: {
      id: bank.id,
      bankCode: bank.bankCode,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      confirmedBy: bank.confirmedBy,
    },
    documents: docs.map((d) => ({ id: d.id, slot: d.slot })),
  };
}
