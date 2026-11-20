# COD reconciliation and Shop held subledger

This slice implements evidenced COD collection, actual carrier remittance
allocation and the Shop money foundation. It follows
`COD-COLLECTION-VERIFY-01`, `COD-SETTLEMENT-NET-RECEIPT-01`,
`COD-SETTLEMENT-PARTIAL-01` and per-item commission rounding.

Collection/remittance records create held liabilities. The separate
[72-hour settlement workflow](SETTLEMENT.md) now verifies Admin-evidenced delivery
times and releases eligible held funds internally. Refund/dispute adjudication
and [manual bank payouts](WALLET_CHECKOUT_AND_PAYOUTS.md) use their own verified workflows. Delivery status, `codCollectedAt` and `carrierTransferredAt`
alone do not prove money was received in Rewear's bank account.

## Verification modes

Every collection and receipt has an explicit immutable mode:

- `EVIDENCE`: Admin independently verifies external carrier/bank evidence and
  records the result. This is not an automated bank connection or a claim that
  GHN Sandbox performed a real transfer.
- `SIMULATION`: explicit sandbox/demo data. It is isolated from evidence-mode
  records, balances and allocations. It never makes evidence-mode funds appear.

An order has one immutable collection report and one mode. Do not use real
payment evidence on a simulated order or invent alternate reference IDs to
allocate the same transfer twice. There is no free-form balance adjustment API.

## Admin APIs

All paths use `/api`, JWT, active-user checks and the Admin role.

`POST /admin/orders/:id/cod/collection`:

```json
{
  "requestId": "UUID",
  "mode": "EVIDENCE",
  "waybillCode": "EXACT_GHN_WAYBILL",
  "collectedAmount": 230000,
  "approvedCarrierFee": 32000,
  "collectedAt": "2026-11-15T01:00:00Z",
  "reason": "Carrier collection statement matched",
  "evidence": "Private verified carrier evidence reference"
}
```

The report must match the order's unique waybill and expected COD. The approved
carrier fee is evidenced actual fee information, not an assumption that the
booking quote is final. Occurrence times cannot be future or precede the order.
Commission snapshots use the order's rate, floor each item to whole VND and sum
the results; shipping is excluded. Collection alone creates no held credit.

`POST /admin/cod/remittances`:

```json
{
  "requestId": "UUID",
  "mode": "EVIDENCE",
  "reference": "BANK-ACCOUNT-TRANSACTION-OR-CARRIER-SETTLEMENT-REFERENCE",
  "netAmount": 198000,
  "receivedAt": "2026-11-15T02:00:00Z",
  "reason": "Actual bank credit and fee netting reconciled",
  "evidence": "Private bank and carrier settlement proof",
  "allocations": [
    { "orderId": "UUID", "cashAmount": 198000, "feeDeducted": 32000 }
  ]
}
```

Use a stable, externally unique qualified reference, not the text of a
notification. A batch may cover up to 100 distinct orders. Actual allocated cash
must equal `netAmount`; proven fee netting is separate. A zero-net settlement
requires positive fee netting, not a zero-value allocation. VND values are
nonnegative whole integers up to the PostgreSQL order amount limit.

Cumulative cash plus fee netting cannot exceed verified collection; fee netting
cannot exceed the approved fee. Receipt time cannot precede collection. Both
requests and normalized settlement references are unique; altered replay or
reference reuse conflicts. An invalid allocation rolls back the entire batch.

Partial transfers remain partial. Only full verified gross receipt, matching
expected collection and eligible order/carrier state create exactly one
`COD_FUNDED_HELD` entry for the Shop's goods less commission. For 200,000 goods,
30,000 buyer shipping, 3% commission and 32,000 evidenced netted carrier fee,
198,000 bank cash + 32,000 netting reconciles 230,000 COD; the Shop held credit
is 194,000, with **available still zero**. No second fee payment is generated.
Buyer totals and seller commission are not changed by carrier fee differences.

Short/excess collection, changed order snapshots, pending cancellation,
unresolved late handover or contradictory carrier data stay `REVIEW`. Actual
receipts may still be recorded for reconciliation; they do not automatically
refund the buyer, create buyer debt, assign fault or fund the Shop.
A finally rejected cancellation no longer blocks after its review window.

Additional routes:

| Route | Purpose |
| --- | --- |
| `GET /admin/cod/reconciliations?mode=EVIDENCE&offset=0` | Collection reports, up to 100 per page |
| `GET /admin/orders/:id/cod/reconciliation?offset=0` | Report and paged receipt history with private proofs |
| `POST /admin/orders/:id/cod/reconciliation/refresh` with `{}` | Recheck current safety flags after another workflow resolves them; never invent a receipt |

Collection/receipt proofs remain immutable. Financial corrections/reversals and
resolution of short/excess collection need the subsequent adjudication slice;
the API intentionally refuses silently replacing previous evidence.

## Owner read API

`GET /shops/:shopId/finance?mode=EVIDENCE&offset=0` is restricted to the active
Owner of that Shop. Default mode is `EVIDENCE`; simulation requires explicit
selection. The response includes:

- `receivable`: expected seller net on valid but not fully funded reports;
  partial receipt does not make any seller funds available.
- `held`: total immutable funded held credits, including funds still subject to
  later dispute/refund/settlement workflows.
- `available`: released amounts from the [72-hour settlement workflow](SETTLEMENT.md).
- Paged safe entry/report views; private bank references, Admin evidence and
  request fingerprints are excluded.

The summary and histories share a repeatable-read database snapshot. Amount
aggregates are checked against JavaScript's safe integer limit. Credits and
allocations use the existing commerce transaction lock and database uniqueness
constraints. No financial field is writable by the Owner.

Tests use dedicated PostgreSQL, real JWT role checks and hand-checked money
fixtures. There is no live bank or GHN reconciliation API test in this slice.


## Verified fees and debt update

[Fees and debt](FEES_AND_DEBT.md) now provides prior-disclosure snapshots, verified invoice assessment, Buyer wallet/MoMo payments, same-Shop available-fund offsets, objections/corrections and source refunds. New payout requests settle collectible Shop fees before allocation; existing payout locks remain protected. Missing legacy disclosure/waybill snapshots are not repaired automatically. Unsupported small provider refunds remain pending review rather than being reported completed.
