# Thanh toán ví và rút tiền Shop

Triển khai các quyết định WALLET-SESSION01–04, CHECKOUT-PAYMENT-METHOD01,
PAYOUT-SESSION01 và nhóm PAYOUT/SHOP-BANK trong `docs/submission_docs/DECISIONS.md`.

## Thanh toán toàn bộ checkout bằng ví

Buyer chọn ví khi đủ **toàn bộ giá món + phí giao hàng** của checkout. Không
ghép ví với MoMo/COD, không nạp ví và không có API rút ví của buyer.

1. `POST /api/checkouts/:id/payments/wallet`: gửi `requestId` UUID,
   `expectedTotal` VND và `mode` (`EVIDENCE` mặc định, hoặc `SIMULATION`).
   Backend lấy báo phí, kiểm tra lại snapshot trong giao dịch rồi chuyển đúng
   số tiền từ số dư khả dụng sang số dư đang giữ. Số tiền không khớp hoặc ví
   thiếu tiền sẽ bị từ chối; thời hạn giữ hàng ban đầu không được gia hạn.
2. `POST /api/wallet/checkouts/:id/confirm`: `id` là ID khoản giữ ví trả về
   bước 1. Tiêu khoản giữ và tạo toàn bộ suborder trong cùng giao dịch, ghi
   debit bất biến, bán đúng hàng đang giữ và bắt đầu hạn seller xác nhận 24h.
3. `POST /api/wallet/checkouts/:id/release`: trả khoản giữ về đúng pool tiền.
   Buyer có thể đổi phương thức khi checkout còn hạn. Hủy/hết hạn checkout
   cũng giải phóng khoản giữ đúng một lần.
4. `GET /api/wallet/checkouts/:id`: trạng thái khoản giữ của chính buyer;
   không trả fingerprint hoặc snapshot nội bộ.

MoMo chưa xác định kết quả chặn chuyển sang ví. Callback thành công của một
attempt cũ sau khi đã chọn ví phải đi vào luồng hoàn MoMo, không tạo đơn hoặc
trừ ví lần thứ hai. Xác nhận/retry đồng thời chỉ ghi một debit và một bộ đơn.

Order `paymentMethod=WALLET` tiếp tục dùng luồng seller, giao hàng, hủy đơn,
tranh chấp và settlement 72h hiện có. Nguồn tiền phải khớp debit, khoản giữ đã
capture, checkout, snapshot từng suborder và mode. Hủy đơn trả tiền về đúng
pool đã thanh toán; dispute refund vẫn cần đầy đủ căn cứ và điều kiện riêng.

### Số dư và nguồn tiền

`GET /api/wallet/mine` bổ sung `heldBalance`, `spendableBalance`,
`quarantinedBalance` và ba trường tương ứng có prefix `simulation`.
`balance`/`simulationBalance` là số dư vật lý chưa bị giữ, không mặc nhiên là
toàn bộ số được phép chi. Số được chi phải có credit có nguồn xác định, trừ
debit đã capture và khoản đang giữ.

MoMo hiện tại là Sandbox: cancellation refund mới vào `SIMULATION`. Các
`WalletCredit` cũ có `mode=null` giữ nguyên lịch sử nhưng không được tự chuyển
thành nguồn tiền thật có chứng cứ. UI phải dùng `spendableBalance` và hiển thị
phần cần đối soát; không cộng hai pool hoặc coi số dư mô phỏng là tiền thật.

## Tài khoản ngân hàng và rút tiền Shop

Các route Owner yêu cầu JWT và `X-Shop-Id` khớp `:shopId`.

| Route | Nội dung |
| --- | --- |
| `GET /api/shops/:shopId/finance/payouts` | Tài khoản, lệnh rút và lịch sử an toàn của Shop |
| `POST /api/shops/:shopId/finance/bank-accounts` | Thêm tài khoản nhận, `ownerConfirmed=true` |
| `PATCH /api/shops/:shopId/finance/bank-accounts/:id` | Sửa/chọn mặc định; xác nhận lại thông tin |
| `DELETE /api/shops/:shopId/finance/bank-accounts/:id` | Ngừng sử dụng tài khoản |
| `POST /api/shops/:shopId/finance/payouts` | Tạo lệnh với `requestId`, `amount`, `mode`, `bankAccountId` |
| `POST /api/shops/:shopId/finance/payouts/:id/cancel` | Owner hủy khi còn `PENDING` |
| `POST /api/shops/:shopId/finance/payouts/:id/nonreceipt` | Báo chưa nhận tiền sau thành công; không tạo chuyển khoản mới |

Hỗ trợ nhiều tài khoản, một mặc định. Kiểm tra format không phải xác minh
ngân hàng: profile ban đầu `UNVERIFIED`; Admin kiểm tra người nhận thủ công.
Cho phép tên khác Owner khi Owner xác nhận. Mỗi lệnh giữ nguyên snapshot ngân
hàng/số tài khoản/tên người nhận, không chạy theo profile sửa/xóa sau đó.
Profile phải được thiết lập trước khi rút; bước này không thay thế onboarding
Shop của module khác.

Một Shop chỉ có **một lệnh đang xử lý**, kể cả khác mode. Lệnh lấy tiền từ
settlement đã khả dụng hoặc bồi thường CASH thực nhận; không lấy tiền đang
escrow, COD chưa nhận hay bồi thường chỉ được hứa/netting. Allocation ghi
đúng nguồn và đơn, không tự lấy tiền đơn khác khi nguồn cũ bị điều chỉnh.

### Admin và kết quả chuyển khoản

Admin thao tác tại `/api/admin/shop-payouts` và `/api/admin/shop-bank-accounts`:

- `GET /shop-payouts`: xem hàng đợi/lịch sử; `POST /shop-bank-accounts/:id/review`
  ghi căn cứ kiểm tra hoặc cờ rủi ro.
- `POST /shop-payouts/:id/start`: ghi `recipientCheckEvidence`, kiểm tra lại
  nguồn được giữ và rủi ro rồi chuyển `PROCESSING`. Từ đây Owner không hủy.
- `POST /shop-payouts/:id/unknown`: kết quả ngân hàng chưa rõ; giữ nguyên khóa.
- `POST /shop-payouts/:id/reject`: từ chối có lý do khi còn `PENDING`.
- `POST /shop-payouts/:id/failure`: cần chứng cứ ngân hàng, `noDebit=true`,
  `noInflight=true` mới kết thúc thất bại và giải phóng nguồn. Timeout không
  phải chứng cứ thất bại. Nếu cần yêu cầu lại, tạo request mới.
- `POST /shop-payouts/:id/success`: số tiền và người nhận phải khớp snapshot,
  có `bankReference`, `transferredAt`, `evidence`. Phí chuyển do nền tảng chịu,
  Shop nhận đủ số đã yêu cầu. Reference không được dùng lại cùng mode.
- `POST /shop-payouts/:id/operational-update`: cập nhật xử lý có lý do/chứng cứ,
  không tạo lệnh chuyển tiền và không giải phóng khoản đang xử lý.
- `POST /shops/:shopId/payout-risk`: đặt/gỡ cờ rủi ro chung của Shop có căn
  cứ; thêm profile ngân hàng khác không vượt qua được cờ này.

**Backend không gọi API ngân hàng hoặc thực hiện chuyển khoản.** Admin ghi
nhận kết quả thực tế của thao tác thủ công ngoài hệ thống. `SIMULATION` chỉ
dùng kiểm thử. Nếu tiền đã thực sự chuyển nhưng sau đó nguồn/rủi ro thay đổi,
vẫn ghi nhận sự thật kèm incident, không giả vờ tiền chưa ra hoặc tự trả thêm.

`GET /api/shops/:shopId/finance` bổ sung `payoutLocked`, `paidOut`,
`paidOutDebt`, `heldShortfall`, `reviewHeld`. `available` trừ các allocation
đang giữ/đã trả theo từng nguồn. Tranh chấp mở lại giữ riêng nguồn liên quan;
refund sau payout ghi nghĩa vụ thiếu đúng nguồn, không âm thầm trừ nguồn khác.
Buyer refund không chờ Shop trả nợ; phần tiền settlement đã ràng buộc/đã trả
được loại khỏi ngân sách refund tiền gốc để ghi đúng khoản nền tảng ứng trước.

### SLA và lịch làm việc

SLA kết thúc yêu cầu là **2 ngày làm việc** theo lịch đã được Admin phê duyệt.
Quá hạn có thông báo bền vững cho Owner và vận hành; hạn cập nhật xử lý tiếp
theo là **1 ngày làm việc**, tính từ mốc hết SLA gốc. Worker không tự mở khóa
`PROCESSING/UNKNOWN`. Thiếu lịch hiển thị `calendarMissing`; khi có lịch,
tính lại từ thời điểm tạo gốc, không từ ngày worker khởi động lại.

Chứng từ nội bộ và bằng chứng vận hành không đưa vào response Owner; dữ liệu
ngân hàng Shop khác không được truy cập. Lịch sử có giới hạn
là dữ liệu theo dõi, không phải cam kết đã gửi email/push.

## Kiểm chứng và triển khai

Kiểm thử dùng PostgreSQL local `rewear_test`, JWT HTTP, snapshot báo phí và
provider giả lập. Không có chuyển khoản thật, tài khoản MoMo/GHN live hoặc
cam kết SLA vận hành production. Chưa chạy migration production; dự án hiện
dùng cơ chế schema development của TypeORM. Cần rà schema/backfill dữ liệu
cũ trước triển khai thật, đặc biệt nguồn ví chưa có mode và chứng từ ngân hàng.


## Verified fees and debt update

[Fees and debt](FEES_AND_DEBT.md) now provides prior-disclosure snapshots, verified invoice assessment, Buyer wallet/MoMo payments, same-Shop available-fund offsets, objections/corrections and source refunds. New payout requests settle collectible Shop fees before allocation; existing payout locks remain protected. Missing legacy disclosure/waybill snapshots are not repaired automatically. Unsupported small provider refunds remain pending review rather than being reported completed.
