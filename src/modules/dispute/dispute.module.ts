import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { StorageModule } from '@/infrastructure/storage';
import { MediaModule } from '@/modules/media/media.module';
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
import { DisputeAppealEvidence } from './entities/dispute-appeal-evidence.entity';
import { DisputeAppealReview } from './entities/dispute-appeal-review.entity';
import { DisputeAppeal } from './entities/dispute-appeal.entity';
import { DisputeAttachment } from './entities/dispute-attachment.entity';
import { DisputeAudit } from './entities/dispute-audit.entity';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeFinalDecision } from './entities/dispute-final-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import { DisputeNotice } from './entities/dispute-notice.entity';
import { DisputeRefundConsent } from './entities/dispute-refund-consent.entity';
import { DisputeRefundCredit } from './entities/dispute-refund-credit.entity';
import { DisputeRefundIncidentUpdate } from './entities/dispute-refund-incident-update.entity';
import { DisputeRefund } from './entities/dispute-refund.entity';
import { CarrierCompensationAcknowledgement } from './returns/entities/carrier-compensation-acknowledgement.entity';
import { CarrierCompensationReceipt } from './returns/entities/carrier-compensation-receipt.entity';
import { DisputeRemedyEvent } from './returns/entities/dispute-remedy-event.entity';
import { DisputeRemedyEvidenceLink } from './returns/entities/dispute-remedy-evidence-link.entity';
import { DisputeReturnException } from './returns/entities/dispute-return-exception.entity';
import { DisputeReturn } from './returns/entities/dispute-return.entity';
import { DisputeSafetyWaiver } from './returns/entities/dispute-safety-waiver.entity';
import { ReturnBooking } from './returns/entities/return-booking.entity';
import { ReturnEvent } from './returns/entities/return-event.entity';
import { ReturnEvidenceLink } from './returns/entities/return-evidence-link.entity';
import { ReturnShippingCharge } from './returns/entities/return-shipping-charge.entity';
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
    StorageModule,
    MediaModule,
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
  ],
})
export class DisputeModule {}
