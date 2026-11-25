import { FEE_PARTY, FEE_POLICY, FEE_STATUS } from '../constants/fee.constant';
import type { FeeParty } from '../schemas/fee.schema';

export function withinActualFeeInvoice(
  amount: number,
  actualInvoiceAmount: number | undefined,
): boolean {
  return (
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    actualInvoiceAmount !== undefined &&
    Number.isSafeInteger(actualInvoiceAmount) &&
    actualInvoiceAmount > 0 &&
    amount <= actualInvoiceAmount
  );
}

export function feePaymentWindow(party: FeeParty, now: Date): Date {
  return new Date(
    now.getTime() +
      (party === FEE_PARTY.BUYER
        ? FEE_POLICY.BUYER_WINDOW_MS
        : FEE_POLICY.SHOP_WINDOW_MS),
  );
}
export function buyerFeeDisposition(
  amount: number,
  spendable: number,
  minimum: number,
) {
  return amount < minimum && spendable < amount
    ? FEE_STATUS.ABSORBED
    : FEE_STATUS.ACTIVE;
}
/** Collections must be supplied oldest first. Reservations include every refund state. */
export function refundAllocations(
  collections: { id: string; amount: number }[],
  reserved: Map<string, number>,
  excess: number,
) {
  const allocations: { collectionId: string; amount: number }[] = [];
  for (const collection of [...collections].reverse()) {
    const amount = Math.min(
      excess,
      Math.max(0, collection.amount - (reserved.get(collection.id) ?? 0)),
    );
    if (amount > 0) allocations.push({ collectionId: collection.id, amount });
    excess -= amount;
    if (excess === 0) break;
  }
  return allocations;
}
