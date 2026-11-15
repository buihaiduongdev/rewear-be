import type { GHN_SHIPMENT_STATUS } from './ghn-shipment.constants';

export type KnownGhnShipmentStatus =
  (typeof GHN_SHIPMENT_STATUS)[keyof typeof GHN_SHIPMENT_STATUS];

export type GhnShipmentSnapshot = {
  orderCode: string;
  clientCode: string;
  shopId: number;
  status: string;
  updatedAt: string;
  codAmount: number;
  paymentType: 1;
  codCollected: boolean;
  codTransferred: boolean;
  collectedAt: string | null;
  transferredAt: string | null;
};
