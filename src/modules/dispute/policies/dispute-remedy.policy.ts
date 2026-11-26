import { ConflictException } from '@nestjs/common';

import {
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_KIND,
  DISPUTE_RESPONSIBILITY,
} from '../constants/dispute.constant';
import type {
  DisputeDecisionOutcome,
  DisputeResponsibility,
} from '../schemas/dispute-decision.schema';
import type { DisputeKind } from '../schemas/dispute.schema';

export function assertDisputeRemedy(
  kind: DisputeKind,
  outcome: DisputeDecisionOutcome,
  responsibility: DisputeResponsibility,
) {
  const returnWithoutSellerFault =
    outcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN &&
    responsibility !== DISPUTE_RESPONSIBILITY.SELLER;
  if (returnWithoutSellerFault)
    throw new ConflictException(
      'Seller fault is required for this return remedy',
    );
  const returningMissingItem =
    outcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN &&
    kind === DISPUTE_KIND.MISSING_ITEM;
  if (returningMissingItem)
    throw new ConflictException(
      'Missing item cannot require return; record the finding without inventing a return remedy',
    );
}
