import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { OrderModule } from '@/modules/order/order.module';

import { DisputeAdjudicationController } from './dispute-adjudication.controller';
import { DisputeAdjudicationService } from './dispute-adjudication.service';
import { DisputeAppealController } from './dispute-appeal.controller';
import { DisputeAppealService } from './dispute-appeal.service';
import { DisputeEvidenceService } from './dispute-evidence.service';
import { DisputeReadService } from './dispute-read.service';
import { DisputeReviewService } from './dispute-review.service';
import { DisputeAccess } from './dispute.access';
import { DisputeController } from './dispute.controller';
import { DisputeService } from './dispute.service';
import { DisputeWorker } from './dispute.worker';
import {
  DisputeAppeal,
  DisputeAppealEvidence,
  DisputeAppealReview,
  DisputeFinalDecision,
} from './entities/dispute-appeal.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import {
  DisputeAttachment,
  DisputeAudit,
  DisputeCase,
  DisputeEvidence,
  DisputeIssue,
  DisputeMessage,
  DisputeNotice,
} from './entities/dispute.entity';

@Module({
  imports: [
    OrderModule,
    TypeOrmModule.forFeature([
      DisputeCase,
      DisputeIssue,
      DisputeEvidence,
      DisputeAttachment,
      DisputeMessage,
      DisputeNotice,
      DisputeAudit,
      DisputeDecision,
      DisputeAppeal,
      DisputeAppealEvidence,
      DisputeAppealReview,
      DisputeFinalDecision,
    ]),
  ],
  controllers: [
    DisputeController,
    DisputeAdjudicationController,
    DisputeAppealController,
  ],
  providers: [
    DisputeAccess,
    DisputeService,
    DisputeReviewService,
    DisputeReadService,
    DisputeEvidenceService,
    DisputeWorker,
    DisputeAdjudicationService,
    DisputeAppealService,
    PrivateEvidenceStorage,
  ],
})
export class DisputeModule {}
