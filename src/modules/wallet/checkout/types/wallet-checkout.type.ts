import type { WALLET_HOLD_STATE } from '../constants/wallet-checkout.constant';

export type WalletHoldState =
  (typeof WALLET_HOLD_STATE)[keyof typeof WALLET_HOLD_STATE];
