export const EVENT_TYPES = {
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  SHOP_APPLICATION_DECIDED: 'shop_application.decided',
  SHOP_IDENTITY_RENEWAL: 'shop_identity.renewal',
  PRODUCT_REVIEW_DECIDED: 'product_review.decided',
  SHOP_INVITATION_CREATED: 'shop_invitation.created',
  DISPUTE_UPDATED: 'dispute.updated',
  CHAT_MESSAGE_CREATED: 'chat_message.created',
  VIOLATION_REPORT_UPDATED: 'violation_report.updated',
  SHOP_DEACTIVATED_FOR_REPORT: 'shop.deactivated_for_report',
} as const;

export type TEventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
