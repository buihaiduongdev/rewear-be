import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { OrderModule } from '@/modules/order/order.module';

import { DisputeEvidenceService } from './dispute-evidence.service';
import { DisputeReadService } from './dispute-read.service';
import { DisputeReviewService } from './dispute-review.service';
import { DisputeAccess } from './dispute.access';
import { DisputeController } from './dispute.controller';
import { DisputeService } from './dispute.service';
import { DisputeWorker } from './dispute.worker';
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
    ]),
  ],
  controllers: [DisputeController],
  providers: [
    DisputeAccess,
    DisputeService,
    DisputeReviewService,
    DisputeReadService,
    DisputeEvidenceService,
    DisputeWorker,
    PrivateEvidenceStorage,
  ],
})
export class DisputeModule {}
