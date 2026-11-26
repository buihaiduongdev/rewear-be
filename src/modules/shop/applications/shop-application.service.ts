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
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { Media } from '@/modules/media/entities';
import { MediaService } from '@/modules/media/media.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopBankAccount } from '@/modules/shop-finance/payouts/entities/shop-bank-account.entity';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { Shop, ShopMember } from '../entities';
import { ShopMemberRole, ShopStatus } from '../enums';
import {
  IDENTITY_DOCUMENT_SLOT,
  IDENTITY_DOCUMENT_TYPE,
  IDENTITY_IMAGE_MIME,
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
  type ApplicationUploadInput,
  applicationUploadSchema,
  type ShopApplicationKind,
  type ShopApplicationState,
  type SubmitIdentityRenewalInput,
  submitIdentityRenewalSchema,
} from './schemas/shop-application.schema';

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
    private readonly media: MediaService,
    private readonly outboxService: OutboxService,
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
    const row = await manager
      .createQueryBuilder(ShopApplication, 'a')
      .innerJoinAndSelect('a.shop', 'shop')
      .setLock('pessimistic_write')
      .where('a.id = :id AND a.applicantId = :userId', { id, userId })
      .getOne();
    if (!row) {
      await this.assertActiveUser(manager, userId);
      throw new NotFoundException('Shop application not found');
    }
    await this.assertOwner(manager, userId, row.shopId);
    return { row, shop: row.shop };
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
      { isSelected: true },
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
      documentType: identity.documentType,
      issuingCountry: identity.issuingCountry,
      documentNumber: identity.documentNumber,
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
        await this.outboxService.record(manager, {
          eventType: EVENT_TYPES.SHOP_APPLICATION_DECIDED,
          resourceId: row.id,
          payload: {
            applicationId: row.id,
            shopId: row.shopId,
            applicantId: row.applicantId,
            action: SHOP_APPLICATION_ACTION.CREATED,
            sendEmail: false,
          },
        });
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
        await this.outboxService.record(manager, {
          eventType: EVENT_TYPES.SHOP_APPLICATION_DECIDED,
          resourceId: row.id,
          payload: {
            applicationId: row.id,
            shopId: row.shopId,
            applicantId: row.applicantId,
            action: SHOP_APPLICATION_ACTION.CREATED,
            sendEmail: false,
          },
        });
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
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.SHOP_APPLICATION_DECIDED,
        resourceId: row.id,
        payload: {
          applicationId: row.id,
          shopId: row.shopId,
          applicantId: row.applicantId,
          action: SHOP_APPLICATION_ACTION.SUBMITTED,
          sendEmail: false,
        },
      });
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
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.SHOP_APPLICATION_DECIDED,
        resourceId: row.id,
        payload: {
          applicationId: row.id,
          shopId: row.shopId,
          applicantId: row.applicantId,
          action: SHOP_APPLICATION_ACTION.SUBMITTED,
          sendEmail: false,
        },
      });
      return this.view(manager, row);
    });
  }

  decide(actorId: string, id: string, input: ApplicationDecisionInput) {
    const data = applicationDecisionSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = new Date();
      await this.assertActiveUser(manager, actorId, true);
      const row = await manager
        .createQueryBuilder(ShopApplication, 'a')
        .innerJoinAndSelect('a.shop', 'shop')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id })
        .getOne();
      if (!row) throw new NotFoundException('Shop application not found');
      if (actorId === row.applicantId)
        throw new ForbiddenException(
          'An Admin cannot review their own application',
        );
      await this.assertOwner(manager, row.applicantId, row.shopId);
      const shop = row.shop;
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
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.SHOP_APPLICATION_DECIDED,
        resourceId: row.id,
        payload: {
          applicationId: row.id,
          shopId: row.shopId,
          applicantId: row.applicantId,
          action: data.outcome,
          sendEmail: (
            [
              SHOP_APPLICATION_ACTION.APPROVED,
              SHOP_APPLICATION_ACTION.REJECTED,
              SHOP_APPLICATION_ACTION.NEEDS_INFO,
            ] as readonly string[]
          ).includes(data.outcome),
        },
      });
      return this.view(manager, row, true);
    });
  }

  attach(userId: string, applicationId: string, input: ApplicationUploadInput) {
    const data = applicationUploadSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const { row, shop } = await this.loadOwnForWrite(
        manager,
        userId,
        applicationId,
      );
      if (!editableApplication(row.state))
        throw new ConflictException(
          'Application is not open for document uploads',
        );
      this.assertShopKindEligibility(shop, row.kind);
      const file = await this.media.verifyMedia(
        manager,
        userId,
        data.mediaId,
        SHOP_APPLICATION_POLICY.MAX_IMAGE_BYTES,
        'private',
      );
      if (!IDENTITY_IMAGE_MIME.some((mime) => mime === file.mimeType))
        throw new BadRequestException('Unsupported identity document type');
      const doc = await manager.save(
        ShopApplicationDocument,
        manager.create(ShopApplicationDocument, {
          applicationId,
          uploadedById: userId,
          slot: data.slot,
          mediaId: file.id,
          isSelected: false,
        }),
      );
      return {
        id: doc.id,
        slot: doc.slot,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        isSelected: doc.isSelected,
      };
    });
  }

  async download(userId: string, id: string) {
    const manager = this.db.manager;
    const row = await manager.findOne(ShopApplicationDocument, {
      where: { id },
      relations: { application: true },
    });
    if (!row || row.media.visibility !== 'private' || row.media.retiredAt) {
      await this.assertActiveUser(manager, userId);
      throw new NotFoundException('Identity document not found');
    }
    if (row.uploadedById === userId && row.application.applicantId === userId) {
      await this.assertOwner(manager, userId, row.application.shopId);
    } else {
      const actor = await this.assertActiveUser(manager, userId);
      if (
        actor.role !== UserRole.ADMIN ||
        !row.isSelected ||
        row.application.state === SHOP_APPLICATION_STATE.DRAFT
      )
        throw new NotFoundException('Identity document not found');
    }
    return this.storage.createDownloadUrl(row.media.storageKey);
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
    const visibleDocs = documents.filter(
      (d) =>
        !d.media.retiredAt &&
        (!admin ||
          (d.isSelected && row.state !== SHOP_APPLICATION_STATE.DRAFT)),
    );
    const result = {
      ...this.summary(row),
      identity: this.extractIdentity(row),
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
      documents: visibleDocs.map((d) => ({
        id: d.id,
        slot: d.slot,
        mimeType: d.media.mimeType,
        sizeBytes: d.media.sizeBytes,
        isSelected: d.isSelected,
      })),
    };
    if (!admin) return result;
    return {
      ...result,
      applicantId: row.applicantId,
      reviewedById: row.reviewedById,
      adminNote: row.adminNote,
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
    const row = await manager.findOneBy(ShopApplication, {
      id,
      applicantId: userId,
    });
    if (!row) {
      await this.assertActiveUser(manager, userId);
      throw new NotFoundException('Shop application not found');
    }
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
