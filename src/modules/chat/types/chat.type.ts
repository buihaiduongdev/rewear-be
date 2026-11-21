import type { CHAT_CARD, CHAT_SIDE } from '../constants/chat.constant';

export type ChatSide = (typeof CHAT_SIDE)[keyof typeof CHAT_SIDE];
export type ChatCardType = (typeof CHAT_CARD)[keyof typeof CHAT_CARD];
export type ChatCardSnapshot = {
  type: ChatCardType;
  id: string;
  title?: string;
  price?: number | null;
  status: string;
};
export type SendChatInput = {
  clientMessageId: string;
  text?: string;
  mediaIds: string[];
  card?: { type: ChatCardType; id: string };
};
export type ChatPageInput = { limit: number; after?: number; before?: number };
