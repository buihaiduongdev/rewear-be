import { Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';
import z from 'zod';

import { ShopMember } from '../entities';
import { ShopMemberRole } from '../enums';
import {
  OwnerIdentity,
  OwnerIdentityDocument,
  ShopApplication,
  ShopApplicationAudit,
  ShopApplicationDocument,
  ShopApplicationRevision,
} from './entities';
import {
  identityFingerprint,
  normalizeIdentityName,
} from './policies/shop-application.policy';
import { applicationQuerySchema } from './schemas/shop-application.schema';
import { ShopApplicationAccess } from './shop-application.access';

@Injectable()
export class ShopApplicationReadService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ShopApplicationAccess,
  ) {}
  summary(row: ShopApplication) {
    return {
      kind: row.kind,
      correctionDueAt: row.correctionDueAt,
      reasonCategory: row.reasonCategory ?? null,
      timelySubmission: row.timelySubmission,
      id: row.id,
      shopId: row.shopId,
      state: row.state,
      version: row.version,
      revision: row.revision,
      submittedAt: row.submittedAt,
      reason: row.reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  async view(manager: EntityManager, row: ShopApplication, admin = false) {
    const audits = await manager.find(ShopApplicationAudit, {
      where: { applicationId: row.id },
      order: { version: 'ASC' },
    });
    const documents = await manager.find(ShopApplicationDocument, {
      where: { applicationId: row.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const history = audits.map((a) => ({
      action: a.action,
      version: a.version,
      revision: a.revision,
      reason: a.reason,
      createdAt: a.createdAt,
    }));
    const result = {
      ...this.summary(row),
      snapshot: row.snapshot,
      documents: documents.map((d) => ({
        id: d.id,
        slot: d.slot,
        mimeType: d.media.mimeType,
        sizeBytes: d.media.sizeBytes,
      })),
      history,
    };
    if (!admin) return result;
    const revisions = await manager.find(ShopApplicationRevision, {
      where: { applicationId: row.id },
      order: { revision: 'ASC' },
    });
    const identityMatches = await this.matches(manager, row);
    return {
      ...result,
      applicantId: row.applicantId,
      adminNote: row.adminNote,
      audits: audits.map((a, i) => ({
        ...history[i],
        actorId: a.actorId,
        adminNote: a.adminNote,
        identityCheckEvidence: a.identityCheckEvidence,
        reasonCategory: a.reasonCategory,
        samePersonConfirmed: a.samePersonConfirmed,
      })),
      revisions: revisions.map((r) => ({
        revision: r.revision,
        snapshot: r.snapshot,
      })),
      identityMatches,
    };
  }
  private async matches(manager: EntityManager, row: ShopApplication) {
    if (!row.snapshot) return [];
    const identity = row.snapshot.identity;
    const claim = await manager.findOneBy(OwnerIdentityDocument, {
      fingerprint: identityFingerprint(identity),
    });
    const matches = await manager.findBy(
      OwnerIdentity,
      claim
        ? [
            {
              normalizedName: normalizeIdentityName(identity.fullName),
              birthDate: identity.birthDate,
            },
            { id: claim.identityId },
          ]
        : {
            normalizedName: normalizeIdentityName(identity.fullName),
            birthDate: identity.birthDate,
          },
    );
    return matches.map((m) => ({ identityId: m.id, ownerId: m.ownerId }));
  }
  async detail(userId: string, id: string, admin = false) {
    const manager = this.db.manager;
    return this.view(
      manager,
      admin
        ? await this.access.admin(manager, userId, id)
        : await this.access.own(manager, userId, id),
      admin,
    );
  }
  async list(
    userId: string,
    input: z.input<typeof applicationQuerySchema>,
    admin = false,
  ) {
    const data = applicationQuerySchema.parse(input);
    const manager = this.db.manager;
    await this.access.active(manager, userId, admin);
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
