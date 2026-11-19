import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { OrderModule } from '@/modules/order/order.module';

import { DisputeAdjudicationController } from './dispute-adjudication.controller';
import { DisputeAdjudicationService } from './dispute-adjudication.service';
import { DisputeAppealController } from './dispute-appeal.controller';
import { DisputeAppealService } from './dispute-appeal.service';
import { DisputeEvidenceService } from './dispute-evidence.service';
import { DisputeReadService } from './dispute-read.service';
import { DisputeRefundReadService } from './dispute-refund-read.service';
import { DisputeRefundController } from './dispute-refund.controller';
import { DisputeRefundService } from './dispute-refund.service';
import { DisputeRefundWorker } from './dispute-refund.worker';
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
  DisputeRefund,
  DisputeRefundConsent,
  DisputeRefundCredit,
  DisputeRefundIncidentUpdate,
} from './entities/dispute-refund.entity';
import {
  DisputeAttachment,
  DisputeAudit,
  DisputeCase,
  DisputeEvidence,
  DisputeIssue,
  DisputeMessage,
  DisputeNotice,
} from './entities/dispute.entity';
import {
  DisputeReturn,
  ReturnEvent,
  ReturnEvidenceLink,
} from './returns/entities/dispute-return.entity';
import { ReturnBooking } from './returns/entities/return-booking.entity';
import {
  CarrierCompensationAcknowledgement,
  CarrierCompensationReceipt,
  DisputeRemedyEvent,
  DisputeRemedyEvidenceLink,
  DisputeReturnException,
  DisputeSafetyWaiver,
  ReturnShippingCharge,
} from './returns/entities/return-exception.entity';
import { ReturnBookingController } from './returns/return-booking.controller';
import { ReturnBookingService } from './returns/return-booking.service';
import { ReturnBookingWorker } from './returns/return-booking.worker';
import { ReturnCarrierService } from './returns/return-carrier.service';
import { ReturnExceptionReadService } from './returns/return-exception-read.service';
import { ReturnExceptionController } from './returns/return-exception.controller';
import { ReturnSafetyService } from './returns/return-safety.service';
import { DisputeReturnController } from './returns/return.controller';
import { DisputeReturnService } from './returns/return.service';

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
      DisputeRefund,
      DisputeRefundCredit,
      DisputeRefundConsent,
      DisputeRefundIncidentUpdate,
      DisputeReturn,
      ReturnEvent,
      ReturnEvidenceLink,
      ReturnBooking,
      DisputeSafetyWaiver,
      DisputeReturnException,
      CarrierCompensationAcknowledgement,
      CarrierCompensationReceipt,
      ReturnShippingCharge,
      DisputeRemedyEvidenceLink,
      DisputeRemedyEvent,
    ]),
  ],
  controllers: [
    DisputeController,
    DisputeAdjudicationController,
    DisputeAppealController,
    DisputeRefundController,
    DisputeReturnController,
    ReturnBookingController,
    ReturnExceptionController,
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
    DisputeRefundService,
    DisputeRefundReadService,
    DisputeRefundWorker,
    DisputeReturnService,
    ReturnBookingService,
    ReturnBookingWorker,
    ReturnSafetyService,
    ReturnCarrierService,
    ReturnExceptionReadService,
    GhnShipmentClient,
    GhnSandboxAdapter,
    PrivateEvidenceStorage,
  ],
})
export class DisputeModule {}
