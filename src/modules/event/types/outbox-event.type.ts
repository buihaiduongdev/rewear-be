import type { EVENT_TYPES } from '../constants/event-type.constant';

export type TOutboxEventPayloadMap = {
  [EVENT_TYPES.ORDER_CREATED]: {
    orderId: string;
    buyerId: string;
    shopId: string;
  };
  [EVENT_TYPES.ORDER_UPDATED]: {
    orderId: string;
    orderEventId: string;
    buyerId: string;
    shopId: string;
    action: string;
  };
  [EVENT_TYPES.SHOP_APPLICATION_DECIDED]: {
    applicationId: string;
    shopId: string;
    applicantId: string;
    action: string;
    sendEmail: boolean;
  };
  [EVENT_TYPES.SHOP_IDENTITY_RENEWAL]: {
    applicationId: string;
    shopId: string;
    applicantId: string;
    identityExpiresOn: string;
    stage: 'grace' | 'paused';
    dedupKey: string;
  };
  [EVENT_TYPES.PRODUCT_REVIEW_DECIDED]: {
    productId: string;
    shopId: string;
    moderationId: string;
    version: number;
    status: string;
  };
  [EVENT_TYPES.SHOP_INVITATION_CREATED]: {
    invitationId: string;
    shopId: string;
    userId: string;
  };
  [EVENT_TYPES.DISPUTE_UPDATED]: {
    disputeCaseId: string;
    orderId: string;
    buyerId: string;
    shopId: string;
    event: string;
    includeAdmins: boolean;
    sendEmail: boolean;
  };
  [EVENT_TYPES.CHAT_MESSAGE_CREATED]: {
    messageId: string;
    conversationId: string;
    buyerId: string;
    shopId: string;
    senderId: string;
  };
  [EVENT_TYPES.VIOLATION_REPORT_UPDATED]: {
    reportId: string;
    reporterId: string;
    version: number;
    action: string;
  };
  [EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT]: {
    reportId: string;
    shopId: string;
    version: number;
  };
};

export type TRecordOutboxEventInput = {
  [K in keyof TOutboxEventPayloadMap]: {
    eventType: K;
    resourceId: string;
    payload: TOutboxEventPayloadMap[K];
  };
}[keyof TOutboxEventPayloadMap];
