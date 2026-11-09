# Checkout shipping estimate

User decision: one personal seller/shop source produces one parcel per checkout;
never split a source or add per-product shipping fees. Existing authorization is
solo BE/FE implementation, test, PR and self-review without per-step approval.

Builder calls: use a conservative stack of declared outer item boxes (sort each
box's edges descending; maximum length/width, sum heights; sum weight). Other
options were per-item fees (violates the decision) and seller packing each order
before checkout (would block immediate quotes). This estimate can overstate an
actual combined parcel; do not present it as verified physical packaging.

Use GHN sandbox preview, not create-order, with explicit source pickup and checkout
address snapshots, platform payer, COD zero and one item describing the combined
parcel. Resolve canonical carrier province/ward names by a unique exact normalized
name/alias match; no fuzzy fallback or local-code substitution. Reject missing
package/pickup, ambiguous mapping, >50kg/>200cm parcel or >5m declared value.

Quotes expire after at most 120 seconds or the remaining reservation, whichever
is shorter. Read/refresh belongs to checkout buyer. No provider network call may
hold database locks. Compare a request generation, reservation and current pickup
data before publishing a result. Cancelled/expired holds or changed pickup make
old fees unusable. Cache a still-fresh identical result. Privacy: keep pickup
snapshots internal; return parcel, fee, service, sandbox label and sanitized reason.
A partial group failure never fabricates a zero fee or a payable grand total.

Provider transport has strict timeout and fixed staging origin; credentials are
optional server-only config. Disabled setup returns unavailable, never mock fees.
Payment remains disabled. No shipment, carrier pickup registration or production
rollout is in scope. Preview uses the platform pricing account with explicit FROM
address; fulfillment still needs carrier pickup registration/mapping.

Primary references:

- https://developer.ghn.vn/en/docs/order/preview
- https://developer.ghn.vn/en/docs/order/create
- https://developer.ghn.vn/en/docs/master-data/get-province-new
- https://developer.ghn.vn/en/docs/master-data/get-ward-new
