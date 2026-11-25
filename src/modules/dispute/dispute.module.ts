import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { StorageModule } from '@/infrastructure/storage';
import { MediaModule } from '@/modules/media/media.module';
import { OrderModule } from '@/modules/order/order.module';

import { DisputeAdjudicationService } from './dispute-adjudication.service';
import { DisputeRefundService } from './dispute-refund.service';
import { DisputeAccess } from './dispute.access';
import { DisputeController } from './dispute.controller';
import { DisputeService } from './dispute.service';
import { DisputeWorker } from './dispute.worker';
import { DisputeAppeal } from './entities/dispute-appeal.entity';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import { DisputeRefundCredit } from './entities/dispute-refund-credit.entity';
import { DisputeReturn } from './returns/entities/dispute-return.entity';
import { DisputeReturnService } from './returns/return.service';

@Module({
  imports: [
    StorageModule,
    MediaModule,
    OrderModule,
    TypeOrmModule.forFeature([
      DisputeCase,
      DisputeIssue,
      DisputeEvidence,
      DisputeMessage,
      DisputeDecision,
      DisputeAppeal,
      DisputeRefundCredit,
      DisputeReturn,
    ]),
  ],
  controllers: [DisputeController],
  providers: [
    DisputeAccess,
    DisputeService,
    DisputeAdjudicationService,
    DisputeRefundService,
    DisputeReturnService,
    DisputeWorker,
    GhnShipmentClient,
    GhnSandboxAdapter,
  ],
  exports: [DisputeAccess, DisputeService],
})
export class DisputeModule {}
