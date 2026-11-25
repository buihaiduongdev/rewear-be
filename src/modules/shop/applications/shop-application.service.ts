import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { DataSource, type EntityManager, In, IsNull, Not } from 'typeorm';

import { handleDatabaseConstraint } from '@/common/utils/database-constraint.util';
import { StorageService } from '@/infrastructure/storage';
import { Media } from '@/modules/media/entities';
import { notifyShopApplication } from '@/modules/notifications/sources/shop-application.notification';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopBankAccount } from '@/modules/shop-finance/payouts/entities/shop-bank-account.entity';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { Shop, ShopMember } from '../entities';
import { ShopMemberRole, ShopStatus } from '../enums';
import {
  IDENTITY_DOCUMENT_SLOT,
  IDENTITY_DOCUMENT_TYPE,
  IDENTITY_RENEWAL_POLICY,
  SHOP_APPLICATION_ACTION,
  SHOP_APPLICATION_KIND,
  SHOP_APPLICATION_POLICY,
  SHOP_APPLICATION_STATE,
} from './constants/shop-application.constant';
import {
  OwnerIdentity,
  ShopApplication,
  ShopApplicationDocument,
} from './entities';
import {
  type ApplicantIdentity,
  type ApplicationDecisionInput,
  applicationDecisionSchema,
  type ApplicationQueryInput,
  applicationQuerySchema,
  type ApplicationSubmitInput,
  applicationSubmitSchema,
  type ShopApplicationKind,
  type ShopApplicationState,
  type SubmitIdentityRenewalInput,
  submitIdentityRenewalSchema,
} from './schemas/shop-application.schema';

export const normalizeIdentityName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toUpperCase()
    .replaceAll('Đ', 'D')
    .replace(/\s+/g, ' ');

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
  now = new Date(),
) {
  const today = new Date(
    now.getTime() + IDENTITY_RENEWAL_POLICY.VIETNAM_OFFSET_MS,
  )
    .toISOString()
    .slice(0, 10);
  const adultOn =
    String(
      Number(identity.birthDate.slice(0, 4)) + SHOP_APPLICATION_POLICY.MIN_AGE,
    ) + identity.birthDate.slice(4);
  if (identity.birthDate > today || adultOn > today)
    throw new BadRequestException(
      'Shop Owner must be at least 18 at submission and approval',
    );
  if (identity.expiresOn < today)
    throw new BadRequestException('Identity document has expired');
}

@Injectable()
export class ShopApplicationService {
  constructor(
    private readonly db: DataSource,
    private readonly storage: StorageService,
  ) {}

  async assertActiveUser(
    manager: EntityManager,
    userId: string,
    admin = false,
  ) {
    const transactional = manager.queryRunner?.isTransactionActive;
    const actor = await manager.findOne(User, {
      where: { id: userId, status: UserStatus.ACTIVE },
      ...(transactional ? { lock: { mode: 'pessimistic_read' as const } } : {}),
    });
    if (!actor) throw new UnauthorizedException('Active account required');
    if (admin && actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('Active Admin required');
    return actor;
  }

  async assertOwner(manager: EntityManager, userId: string, shopId: string) {
    await this.assertActiveUser(manager, userId);
    const isOwner = await manager.existsBy(ShopMember, {
      userId,
      shopId,
      memberRole: ShopMemberRole.OWNER,
    });
    if (!isOwner) throw new NotFoundException('Shop application not found');
  }

  private assertShopKindEligibility(shop: Shop, kind: ShopApplicationKind) {
    if (kind === SHOP_APPLICATION_KIND.RENEWAL) {
      if (!shop.onboardingRequired || !shop.approvedAt)
        throw new ConflictException(
          'Approved Shop identity is required for renewal',
        );
      return;
    }
    const awaitingOnboarding =
      shop.onboardingRequired &&
      shop.status === ShopStatus.PENDING &&
      !shop.approvedAt;
    if (!awaitingOnboarding)
      throw new ConflictException('Shop is not awaiting onboarding approval');
  }

  private async loadOwnForWrite(
    manager: EntityManager,
    userId: string,
    id: string,
  ) {
    await this.assertActiveUser(manager, userId);
    const target = await manager.findOneBy(ShopApplication, {
      id,
      applicantId: userId,
    });
    if (!target) throw new NotFoundException('Shop application not found');
    await this.assertOwner(manager, userId, target.shopId);
    const shop = await manager.findOneOrFail(Shop, {
      where: { id: target.shopId },
      lock: { mode: 'pessimistic_write' },
    });
    const row = await manager.findOneOrFail(ShopApplication, {
      where: { id, applicantId: userId },
      lock: { mode: 'pessimistic_write' },
    });
    return { row, shop };
  }

  private extractIdentity(row: ShopApplication): ApplicantIdentity | null {
    if (
      !row.documentType ||
      !row.documentNumber ||
      !row.issuingCountry ||
      !row.fullName ||
      !row.birthDate ||
      !row.expiresOn
    ) {
      return null;
    }
    return {
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      issuingCountry: row.issuingCountry,
      fullName: row.fullName,
      birthDate: row.birthDate,
      expiresOn: row.expiresOn,
    };
  }

  private async validateInitialContext(
    manager: EntityManager,
    shop: Shop,
    row: ShopApplication,
    bankAccountId: string,
  ) {
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
  }

  private assertRequiredSlots(
    identity: ApplicantIdentity,
    docs: ShopApplicationDocument[],
    expectedCount?: number,
  ) {
    const required =
      identity.documentType === IDENTITY_DOCUMENT_TYPE.NATIONAL_ID
        ? [IDENTITY_DOCUMENT_SLOT.FRONT, IDENTITY_DOCUMENT_SLOT.BACK]
        : [IDENTITY_DOCUMENT_SLOT.PASSPORT];
    const valid =
      (expectedCount === undefined || docs.length === expectedCount) &&
      docs.length === required.length &&
      required.every(
        (slot) =>
          docs.filter((d) => d.slot === slot && !d.media.retiredAt).length ===
          1,
      );
    if (!valid)
      throw new BadRequestException(
        'Required owned identity documents are missing',
      );
  }

  private async selectDocuments(
    manager: EntityManager,
    row: ShopApplication,
    identity: ApplicantIdentity,
    documentIds: string[],
  ) {
    const docs = await manager.find(ShopApplicationDocument, {
      where: {
        id: In(documentIds),
        applicationId: row.id,
        uploadedById: row.applicantId,
      },
      order: { slot: 'ASC', id: 'ASC' },
    });
    this.assertRequiredSlots(identity, docs, documentIds.length);
    await manager.update(
      ShopApplicationDocument,
      { applicationId: row.id, isSelected: true },
      { isSelected: false },
    );
    await manager.update(
      ShopApplicationDocument,
      { id: In(documentIds), applicationId: row.id },
      { isSelected: true, isSubmitted: true },
    );
  }

  private async claimVerifiedOwnerDocument(
    manager: EntityManager,
    row: ShopApplication,
    identity: ApplicantIdentity,
  ) {
    const claimed = await manager.findOneBy(OwnerIdentity, {
      documentType: identity.documentType,
      issuingCountry: identity.issuingCountry,
      documentNumber: identity.documentNumber,
    });
    if (claimed && claimed.ownerId !== row.applicantId)
      throw new ConflictException(
        'Identity document already belongs to an approved account',
      );
    const record =
      (await manager.findOneBy(OwnerIdentity, {
        ownerId: row.applicantId,
      })) ??
      manager.create(OwnerIdentity, {
        ownerId: row.applicantId,
      });
    Object.assign(record, {
      applicationId: row.id,
      documentType: identity.documentType,
      issuingCountry: identity.issuingCountry,
      documentNumber: identity.documentNumber,
      fullName: identity.fullName,
      normalizedName: normalizeIdentityName(identity.fullName),
      birthDate: identity.birthDate,
      expiresOn: identity.expiresOn,
    });
    try {
      await manager.save(OwnerIdentity, record);
    } catch (error) {
      handleDatabaseConstraint(error, {
        UQ_owner_identity_document:
          'Identity document already belongs to an approved account',
      });
    }
  }

  create(userId: string, shopId: string) {
    return this.db.transaction(async (manager) => {
      await this.assertOwner(manager, userId, shopId);
      const shop = await manager.findOneOrFail(Shop, {
        where: { id: shopId },
        lock: { mode: 'pessimistic_write' },
      });
      let row = await manager.findOneBy(ShopApplication, {
        kind: SHOP_APPLICATION_KIND.INITIAL,
        shopId,
        applicantId: userId,
      });
      if (!row) {
        this.assertShopKindEligibility(shop, SHOP_APPLICATION_KIND.INITIAL);
        row = await manager.save(
          ShopApplication,
          manager.create(ShopApplication, {
            shopId,
            applicantId: userId,
            kind: SHOP_APPLICATION_KIND.INITIAL,
            state: SHOP_APPLICATION_STATE.DRAFT,
            bankAccountId: null,
            documentType: null,
            documentNumber: null,
            issuingCountry: null,
            fullName: null,
            birthDate: null,
            expiresOn: null,
            submittedAt: null,
            reviewedById: null,
            reviewedAt: null,
            reason: null,
            adminNote: null,
          }),
        );
        await notifyShopApplication(
          manager,
          row,
          SHOP_APPLICATION_ACTION.CREATED,
        );
      }
      return this.view(manager, row);
    });
  }

  createRenewal(userId: string, shopId: string) {
    return this.db.transaction(async (manager) => {
      await this.assertOwner(manager, userId, shopId);
      const shop = await manager.findOneOrFail(Shop, {
        where: { id: shopId },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertShopKindEligibility(shop, SHOP_APPLICATION_KIND.RENEWAL);
      const hasApprovedInitial = await manager.existsBy(ShopApplication, {
        shopId,
        applicantId: userId,
        kind: SHOP_APPLICATION_KIND.INITIAL,
        state: SHOP_APPLICATION_STATE.APPROVED,
      });
      if (!hasApprovedInitial)
        throw new ConflictException(
          'Approved Owner identity is required for renewal',
        );
      let row = await manager.findOneBy(ShopApplication, {
        shopId,
        applicantId: userId,
        kind: SHOP_APPLICATION_KIND.RENEWAL,
        state: Not(SHOP_APPLICATION_STATE.APPROVED),
      });
      if (!row) {
        row = await manager.save(
          ShopApplication,
          manager.create(ShopApplication, {
            shopId,
            applicantId: userId,
            kind: SHOP_APPLICATION_KIND.RENEWAL,
            state: SHOP_APPLICATION_STATE.DRAFT,
            bankAccountId: null,
            documentType: null,
            documentNumber: null,
            issuingCountry: null,
            fullName: null,
            birthDate: null,
            expiresOn: null,
            submittedAt: null,
            reviewedById: null,
            reviewedAt: null,
            reason: null,
            adminNote: null,
          }),
        );
        await notifyShopApplication(
          manager,
          row,
          SHOP_APPLICATION_ACTION.CREATED,
        );
      }
      return this.view(manager, row);
    });
  }

  submit(userId: string, id: string, input: ApplicationSubmitInput) {
    const data = applicationSubmitSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = new Date();
      const { row, shop } = await this.loadOwnForWrite(manager, userId, id);
      if (row.kind !== SHOP_APPLICATION_KIND.INITIAL)
        throw new ConflictException(
          'Use the identity renewal submission endpoint',
        );
      if (!editableApplication(row.state))
        throw new ConflictException('Application is not open for submission');
      this.assertShopKindEligibility(shop, SHOP_APPLICATION_KIND.INITIAL);
      validateApplicantIdentity(data.identity, now);
      await this.validateInitialContext(manager, shop, row, data.bankAccountId);
      await this.selectDocuments(manager, row, data.identity, data.documentIds);
      Object.assign(row, {
        bankAccountId: data.bankAccountId,
        documentType: data.identity.documentType,
        documentNumber: data.identity.documentNumber,
        issuingCountry: data.identity.issuingCountry,
        fullName: data.identity.fullName,
        birthDate: data.identity.birthDate,
        expiresOn: data.identity.expiresOn,
        state: SHOP_APPLICATION_STATE.SUBMITTED,
        submittedAt: now,
        reason: null,
        adminNote: null,
      });
      await manager.save(ShopApplication, row);
      await notifyShopApplication(
        manager,
        row,
        SHOP_APPLICATION_ACTION.SUBMITTED,
      );
      return this.view(manager, row);
    });
  }

  submitRenewal(userId: string, id: string, input: SubmitIdentityRenewalInput) {
    const data = submitIdentityRenewalSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = new Date();
      const { row, shop } = await this.loadOwnForWrite(manager, userId, id);
      if (
        row.kind !== SHOP_APPLICATION_KIND.RENEWAL ||
        !editableApplication(row.state)
      )
        throw new ConflictException('Renewal is not open for submission');
      this.assertShopKindEligibility(shop, SHOP_APPLICATION_KIND.RENEWAL);
      validateApplicantIdentity(data.identity, now);
      await this.selectDocuments(manager, row, data.identity, data.documentIds);
      Object.assign(row, {
        documentType: data.identity.documentType,
        documentNumber: data.identity.documentNumber,
        issuingCountry: data.identity.issuingCountry,
        fullName: data.identity.fullName,
        birthDate: data.identity.birthDate,
        expiresOn: data.identity.expiresOn,
        state: SHOP_APPLICATION_STATE.SUBMITTED,
        submittedAt: now,
        reason: null,
        adminNote: null,
      });
      await manager.save(ShopApplication, row);
      await notifyShopApplication(
        manager,
        row,
        SHOP_APPLICATION_ACTION.SUBMITTED,
      );
      return this.view(manager, row);
    });
  }

  decide(actorId: string, id: string, input: ApplicationDecisionInput) {
    const data = applicationDecisionSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = new Date();
      await this.assertActiveUser(manager, actorId, true);
      const target = await manager.findOneBy(ShopApplication, { id });
      if (!target) throw new NotFoundException('Shop application not found');
      if (actorId === target.applicantId)
        throw new ForbiddenException(
          'An Admin cannot review their own application',
        );
      await this.assertOwner(manager, target.applicantId, target.shopId);
      const shop = await manager.findOneOrFail(Shop, {
        where: { id: target.shopId },
        lock: { mode: 'pessimistic_write' },
      });
      const row = await manager.findOneOrFail(ShopApplication, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const identity = this.extractIdentity(row);
      if (row.state !== SHOP_APPLICATION_STATE.SUBMITTED || !identity)
        throw new ConflictException('Application is not awaiting review');
      this.assertShopKindEligibility(shop, row.kind);

      if (data.outcome === SHOP_APPLICATION_STATE.APPROVED) {
        validateApplicantIdentity(identity, now);
        const selectedDocs = await manager.find(ShopApplicationDocument, {
          where: {
            applicationId: row.id,
            uploadedById: row.applicantId,
            isSelected: true,
          },
        });
        this.assertRequiredSlots(identity, selectedDocs);
        if (row.kind === SHOP_APPLICATION_KIND.INITIAL) {
          if (!row.bankAccountId)
            throw new BadRequestException(
              'Current Owner-confirmed bank account is required',
            );
          await this.validateInitialContext(
            manager,
            shop,
            row,
            row.bankAccountId,
          );
          await this.claimVerifiedOwnerDocument(manager, row, identity);
          shop.status = ShopStatus.ACTIVE;
          shop.approvedAt = now;
          shop.identityExpiresOn = identity.expiresOn;
        } else {
          await this.claimVerifiedOwnerDocument(manager, row, identity);
          shop.identityExpiresOn = identity.expiresOn;
          shop.identityManualRestriction = false;
        }
        await manager.save(Shop, shop);
      }

      Object.assign(row, {
        state: data.outcome,
        reviewedById: actorId,
        reviewedAt: now,
        reason: data.reason,
        adminNote: data.adminNote || null,
      });
      await manager.save(ShopApplication, row);
      await notifyShopApplication(manager, row, data.outcome);
      return this.view(manager, row, true);
    });
  }

  private summary(row: ShopApplication) {
    return {
      id: row.id,
      shopId: row.shopId,
      kind: row.kind,
      state: row.state,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      reason: row.reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async view(manager: EntityManager, row: ShopApplication, admin = false) {
    const [shop, documents, pickup, bank] = await Promise.all([
      manager.findOneOrFail(Shop, {
        where: { id: row.shopId },
        relations: { logoMedia: true },
      }),
      manager.find(ShopApplicationDocument, {
        where: { applicationId: row.id },
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
      row.kind === SHOP_APPLICATION_KIND.INITIAL
        ? manager.findOneBy(PickupLocation, { shopId: row.shopId })
        : Promise.resolve(null),
      row.kind === SHOP_APPLICATION_KIND.INITIAL && row.bankAccountId
        ? manager.findOneBy(ShopBankAccount, {
            id: row.bankAccountId,
            shopId: row.shopId,
            deletedAt: IsNull(),
          })
        : Promise.resolve(null),
    ]);
    const identity = this.extractIdentity(row);
    const result = {
      ...this.summary(row),
      identity,
      shop: {
        id: shop.id,
        name: shop.name,
        description: shop.description,
        logoUrl:
          shop.logoMedia && !shop.logoMedia.retiredAt
            ? this.storage.getPublicUrl(shop.logoMedia.storageKey)
            : null,
      },
      pickup: pickup
        ? {
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
          }
        : null,
      bank: bank
        ? {
            id: bank.id,
            bankCode: bank.bankCode,
            accountNumber: bank.accountNumber,
            accountName: bank.accountName,
            confirmedBy: bank.confirmedBy,
          }
        : null,
      documents: documents.map((d) => ({
        id: d.id,
        slot: d.slot,
        mimeType: d.media.mimeType,
        sizeBytes: d.media.sizeBytes,
        isSelected: d.isSelected,
      })),
    };
    if (!admin) return result;
    const identityMatches = identity
      ? (
          await manager.findBy(OwnerIdentity, [
            {
              documentType: identity.documentType,
              issuingCountry: identity.issuingCountry,
              documentNumber: identity.documentNumber,
            },
            {
              normalizedName: normalizeIdentityName(identity.fullName),
              birthDate: identity.birthDate,
            },
          ])
        ).map((m) => ({ identityId: m.id, ownerId: m.ownerId }))
      : [];
    return {
      ...result,
      applicantId: row.applicantId,
      reviewedById: row.reviewedById,
      adminNote: row.adminNote,
      identityMatches,
    };
  }

  async detail(userId: string, id: string, admin = false) {
    const manager = this.db.manager;
    if (admin) {
      await this.assertActiveUser(manager, userId, true);
      const row = await manager.findOneBy(ShopApplication, { id });
      if (!row) throw new NotFoundException('Shop application not found');
      return this.view(manager, row, true);
    }
    await this.assertActiveUser(manager, userId);
    const row = await manager.findOneBy(ShopApplication, {
      id,
      applicantId: userId,
    });
    if (!row) throw new NotFoundException('Shop application not found');
    await this.assertOwner(manager, userId, row.shopId);
    return this.view(manager, row);
  }

  async list(userId: string, input: ApplicationQueryInput, admin = false) {
    const data = applicationQuerySchema.parse(input);
    const manager = this.db.manager;
    await this.assertActiveUser(manager, userId, admin);
    const query = manager.createQueryBuilder(ShopApplication, 'a');
    if (!admin)
      query
        .innerJoin(
          ShopMember,
          'm',
          'm.shopId=a.shopId AND m.userId=:userId AND m.memberRole=:owner',
          { userId, owner: ShopMemberRole.OWNER },
        )
        .where('a.applicantId=:userId', { userId });
    if (data.state) query.andWhere('a.state=:state', { state: data.state });
    if (data.kind) query.andWhere('a.kind=:kind', { kind: data.kind });
    const [rows, totalCount] = await query
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .take(data.limit)
      .skip(data.offset)
      .getManyAndCount();
    return {
      items: rows.map((row) => this.summary(row)),
      totalCount,
      limit: data.limit,
      offset: data.offset,
    };
  }
}
