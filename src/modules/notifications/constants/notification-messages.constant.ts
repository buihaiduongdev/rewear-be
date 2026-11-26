import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';

export const NOTIFICATION_MESSAGES = {
  [EVENT_TYPES.ORDER_CREATED]: {
    title: 'New order',
    body: 'Your order has been created. Open the order to view details and confirmation deadline.',
  },
  [EVENT_TYPES.ORDER_UPDATED]: {
    title: 'Order update',
    body: 'Your order status has been updated. Open the order to view its current status and next steps.',
  },
  [EVENT_TYPES.SHOP_APPLICATION_DECIDED]: {
    applicant: {
      title: 'Shop application update',
      body: 'Your shop application has an update. Sign in to review the status and next steps.',
    },
    admin: {
      title: 'Shop review update',
      body: 'A shop application has an update in the review queue.',
    },
  },
  [EVENT_TYPES.SHOP_IDENTITY_RENEWAL]: (stage: 'grace' | 'paused') => ({
    title:
      stage === 'paused'
        ? 'Shop new orders paused'
        : 'Identity document grace period ending soon',
    body: 'Sign in and open your shop profile to update your identity documents. Existing orders continue as normal.',
  }),
  [EVENT_TYPES.PRODUCT_REVIEW_DECIDED]: {
    title: 'Listing review result',
    body: 'Your shop listing has been reviewed. Open product management to view the result.',
  },
  [EVENT_TYPES.SHOP_INVITATION_CREATED]: {
    title: 'Shop invitation',
    body: 'You have been invited to join a shop. Open Rewear to view your role and invitation expiry.',
  },
  [EVENT_TYPES.DISPUTE_UPDATED]: {
    buyer: {
      title: 'Dispute update',
      body: 'Your dispute case has an update. Open the order to view details and response deadlines.',
    },
    seller: {
      title: 'Dispute update',
      body: 'An order dispute has an update. Open the order to view and respond.',
    },
    admin: {
      title: 'Dispute needs adjudication',
      body: 'A dispute case has an update requiring admin review.',
    },
  },
  [EVENT_TYPES.CHAT_MESSAGE_CREATED]: {
    title: 'New message',
    body: 'You have a new message in your Buyer–Shop conversation. Open the chat to read it.',
  },
  [EVENT_TYPES.VIOLATION_REPORT_UPDATED]: {
    title: 'Violation report update',
    body: 'A violation report has an update. Open the report to view its status and outcome.',
  },
  [EVENT_TYPES.SHOP_DEACTIVATED_FOR_REPORT]: {
    title: 'Shop moderation update',
    body: 'Your shop has been paused from new orders after a verified violation report. Contact support for details.',
  },
} as const;
