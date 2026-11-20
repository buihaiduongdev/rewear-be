# Thu phí và công nợ vận chuyển

Triển khai nhóm `COD-CANCEL-COST/FEE`, `COD-FAILURE-FEE`,
`COD-SELLER-DEDUCTION/FEE`, `COD-SHIPPING-SELLER-ERROR` và nghĩa vụ phí trả
hàng đã chốt trong `docs/submission_docs/DECISIONS.md`.

Sổ phí tách khỏi thanh toán tiền hàng, hoa hồng và ví bán hàng. Không có biểu
phạt tự đặt, không cộng nợ vào checkout tiếp theo và không tự trừ ví buyer.
Quyền hủy hàng không phụ thuộc việc trả phí.

## Điều kiện phí phải được công bố trước

- Admin đăng một phiên bản điều kiện tại `POST /api/admin/fee-policies` với
  `conditions: [{kind, text}]`. API kiểm tra Admin còn hoạt động; phiên bản
  công bố không có route sửa đè. `GET /api/fee-policies/current` là công khai.
- Owner chấp nhận phiên bản hiện tại qua
  `POST /api/shops/:id/fee-policy-acceptance`, body `{policyId, accepted:true}`.
- Buyer gửi đồng thời `feePolicyId` và `feeTermsAccepted:true` khi tạo checkout.
  Không gửi vẫn mua được nhưng không được coi là đã đồng ý phí buyer. FE phải
  trình bày nội dung điều kiện và lấy xác nhận trước khi gửi hai trường này.
- Checkout lưu snapshot policy/version/thời điểm và xác nhận từng Shop.
  Snapshot đi cùng order qua MoMo, COD và ví; replay không đổi policy/TTL.
  Điều kiện mới không áp ngược cho đơn cũ. Thiếu xác nhận hoặc xác nhận sau
  khi đặt hàng không được dùng để thu phí.

## Xác minh hóa đơn và bên chịu phí

`POST /api/fees` chỉ cho Admin đang hoạt động. Các trường chính:

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `sourceId`, `waybillId` | Đúng order, Shipment và mã vận đơn thực tế |
| `party` | `BUYER` hoặc `SHOP` chịu nghĩa vụ đã xác minh |
| `mode` | `EVIDENCE` hoặc `SIMULATION`; không gộp hai chế độ |
| `kind` | `CANCELLATION`, `FAILED_DELIVERY`, `SELLER_PACKAGE_ERROR` |
| `invoiceReference`, `invoiceLine` | Chứng từ và dòng phí; không thu lặp cùng dòng |
| `amount`, `actualInvoiceAmount` | Phí phải trả không vượt khoản hóa đơn thực tế đã xác minh |
| `reason`, `evidence` | Lý do quy trách nhiệm và căn cứ Admin đã đối chiếu |

Hủy cần trạng thái hủy an toàn và đúng vận đơn. Giao thất bại cần nguồn đã
xác định không tiếp tục giao/chuyển hoàn; mã hãng đơn thuần không tự quy lỗi.
Admin phải xác minh trách nhiệm và chi phí, không suy từ một cuộc gọi nhỡ,
lời seller đơn phương hoặc chỉ trạng thái `delivered`.

`SELLER_PACKAGE_ERROR` chỉ áp cho Shop. Bắt buộc có số đã báo ban đầu khớp
`Shipment.carrierFee`; khoản thu không vượt phần hóa đơn tăng thực tế. Phần
ship buyer đã đồng ý vẫn cố định; không thu thêm buyer hoặc trừ hai lần.

`RETURN_SHIPPING`/`REFUSAL_EXTRA` không được tự tạo qua route hóa đơn chung.
Worker nhập đúng `ReturnShippingCharge` đã xác minh, có snapshot vận đơn trả,
đúng return/order/Shop/mode và điều kiện phí hợp lệ. Dữ liệu cũ thiếu snapshot
vận đơn hoặc công bố trước được giữ để đối soát, không tự trở thành khoản thu.

## Hạn trả, phản đối và hạn chế COD

| Quy tắc | Buyer | Shop |
| --- | --- | --- |
| Hạn trả | 72 giờ liên tục từ thông báo có khoản phí | 7 ngày liên tục cho phần còn thiếu có thể thanh toán |
| Phản đối | Một lần có lý do/bằng chứng trong hạn | Một lần; khoản nhỏ chưa có deadline vẫn được phản đối |
| Khi đang xét | Dừng thu và hạn trả của khoản đó | Dừng bù trừ/thu thêm; phần đã thu giữ chờ kết quả |
| Admin xét | 2 ngày làm việc, bỏ ngày nhận, 17:00 giờ Việt Nam | Tương tự |
| Nếu vẫn phải trả | Cấp lại đủ 72 giờ | Cấp lại đủ 7 ngày khi có phương thức thanh toán khả dụng |
| Quá hạn | Chặn buyer đặt COD mới | Chặn COD mới của đúng Shop nợ phí |

Không chặn mua/bán trả trước, xử lý đơn cũ hoặc trả chính khoản phí. Không
xóa hạn chế chống lạm dụng/KYC khác khi một khoản nợ phí được giải quyết.
Kết quả Admin quá SLA vẫn đang mở, không tự coi buyer/Shop thắng hay thua.
Thiếu lịch làm việc giữ deadline xét là chưa xác định; khi bổ sung lịch,
tính từ thời điểm phản đối gốc.

Khoản buyer dưới mức MoMo tối thiểu và ví đúng pool không đủ do sàn chịu;
không tăng phí cho đủ ngưỡng và không tạo hạn chế. Quy tắc cũng áp khi sửa
giảm một khoản còn nợ thành số nhỏ không thể trả.

Khoản Shop nhỏ vẫn ghi phải trả, được bù trừ khi có doanh thu khả dụng.
Các khoản cùng Shop/mode có thể gộp trả MoMo. Khi tổng đủ ngưỡng, thông báo
khởi tạo 7 ngày cho các dòng trước đó chưa có deadline; không đặt lại hạn
của dòng đã có deadline. Không coi khoản nhỏ chưa trả được là quá hạn.

## Thanh toán và bù trừ

- `POST /api/fees/:id/payments/wallet`: buyer chủ động trả **toàn bộ** số còn
  thiếu, gửi `{requestId, expectedAmount}`. Số dư phải có nguồn xác định, đủ
  tiền và đúng mode; không chạm tiền đang giữ cho checkout. Một request chỉ
  trừ ví một lần. Không có API thu tiền mặt/thủ công của buyer.
- `POST /api/fee-payments/momo`: `{requestId, feeIds, amount, mode:"SIMULATION"}`.
  Buyer trả một khoản; Owner có thể gộp khoản cùng Shop. Tiền MoMo không phải
  nạp ví bán hàng. Attempt còn chưa rõ chặn tạo lần thu mới trên cùng khoản.
- `GET /api/fee-payments/:id`, `POST /api/fee-payments/:id/reconcile`: đọc/
  tra soát cho đúng bên. Callback dùng route MoMo đã cấu hình của hệ thống,
  kiểm chữ ký và reference rồi phân loại sang thanh toán phí hoặc tiền hàng.
- Shop được bù trừ tự động từ **khả dụng của đúng Shop/mode**. Không lấy
  escrow, tiền đang tranh chấp, khoản đã khóa cho payout hoặc nguồn khác của
  Owner. Trước một yêu cầu rút mới, hệ thống tất toán phần phí có thể bù trừ
  rồi mới tính số còn rút được.
- Nếu bù trừ đã thắng race mà MoMo đến sau, chỉ ghi phần còn nợ và refund
  đúng phần thu vượt về MoMo; không cộng thành số dư Shop và không thu hai lần.

Mỗi bút toán bù trừ ghi nguồn settlement/tiền bồi thường/correction cụ thể.
Khi order gốc bị điều chỉnh sau đó, khoản thiếu vẫn gắn đúng nguồn đã chi;
không âm thầm lấy tiền đơn khác ngoài bù trừ phí Shop đã được công bố.
Ngân sách buyer refund loại phần settlement đã thực sự chi trả phí/payout.

## Sửa phí và hoàn đúng nguồn

`POST /api/fees/:id/corrections` cho Admin, gửi
`{payableAmount, reason, evidence}`. Chỉ giảm/hủy hoặc giữ nguyên khi xét
phản đối, không tự tăng nghĩa vụ cũ. Chứng từ, quyết định và số đã thu giữ
lịch sử; phần chưa thu bị hủy, phần thu thừa tạo yêu cầu hoàn nguồn gốc.

- Thu ví: cộng lại đúng pool của buyer và ghi credit có nguồn xác định.
- Bù trừ Shop: trả vào nguồn `FEE_CORRECTION` khả dụng ngay của đúng Shop,
  không đưa về escrow. Allocation chi gốc vẫn giữ để đối soát.
- Thu MoMo: chỉ xác nhận hoàn khi tra soát khớp khoản refund thành công.
  Timeout giữ `UNKNOWN`, không gửi một refund mới sau phản hồi mơ hồ.
- Netting hãng: gắn đúng charge/receipt đã xác minh; không coi là tiền CASH.
  Nếu hãng netting sau khi sàn đã thu tiền, ghi đúng giá trị đã nhận và hoàn
  phần tiền đã thu thừa. Netting không được dùng thu thêm khoản đang phản đối.
- Sửa khoản đã netting cần hãng trả lại giá trị thực tế: Admin ghi chứng từ
  `POST /api/admin/fee-refunds/:id/carrier-receipt` với đúng số tiền, reference,
  thời điểm nhận và căn cứ. Không dùng lại chứng từ ở COD/claim khác hoặc
  coi yêu cầu gửi hãng là đã nhận tiền.

### Giới hạn thực tế của MoMo

[MoMo công bố mức refund ví tối thiểu 1.000đ, tối đa 50.000.000đ](https://developers.momo.vn/v3/docs/payment/api/payment-api/refund/).
Phần thu vượt/correction nhỏ hơn 1.000đ vẫn lưu đúng số tiền và capture nguồn
ở `REVIEW`, báo vận hành ngay và không tự gọi API với số sai, đổi sang ví
Rewear hoặc báo đã hoàn. Đây là khoản còn cần xử lý với provider, không phải
đã giải quyết tài chính. Không tự gộp các capture khác nhau để vượt ngưỡng.

Refund chưa rõ được cảnh báo sau 30 phút; lỗi xác định/ngoài giới hạn cảnh báo
ngay. Hạn Admin phản hồi là 4 giờ liên tục từ cảnh báo đầu, cập nhật không
đặt lại mốc và không xác nhận hộ việc tiền đã về.

## Theo dõi và quyền truy cập

- `GET /api/fees`, `/api/fees/shop/:shopId`, `/api/fees/:id`: bên liên quan
  xem số còn nợ, lý do, notice, collections và refunds an toàn. `status` là
  trạng thái xử lý; dùng `outstanding=0` để biết không còn nợ.
- `GET /api/fees/:id/history`: quyết định thuộc chính khoản phí.
- `POST /api/fees/:id/objections`: lý do và bằng chứng phản đối.
- `GET /api/fees/admin/queue?offset=0`: Admin đọc chứng từ, lịch sử, khoản
  đang phản đối/quá hạn. Party DTO không lộ chứng từ hoặc reference nội bộ.
- `GET /api/fee-payments/refunds/pending`: hàng đợi refund MoMo cho Admin;
  `POST /api/fee-payments/refunds/:id/response` lưu cập nhật vận hành.
- `GET /api/admin/fee-settlement-incidents`: lỗi nguồn/bút toán cần đối soát.
  Một bản ghi lỗi không chặn hoàn/bù trừ của Shop khác; sửa nguồn hợp lệ rồi
  worker thử lại, không đánh dấu hoàn thành chỉ vì đã bắt exception.

Finance Shop bổ sung `feePayable`, `feeDebited`, `feeSourceDebt`.
`returnFeePayable` đã trừ phần thực thu/netting của đúng charge. Số khả dụng
vẫn trừ payout đang khóa và outflow phí theo nguồn, tách EVIDENCE/SIMULATION.

## Giới hạn triển khai

Kiểm thử dùng PostgreSQL `rewear_test`, provider giả lập và JWT HTTP. Chưa
thu/hoàn MoMo thật, gọi GHN live, thực hiện chuyển khoản hoặc chạy migration
production. Không có biểu phí GHN thật được suy từ ví dụ. Chưa sửa dữ liệu
lịch sử thiếu disclosure; FE phải tích hợp bước đọc/chấp nhận policy trước
khi có thể thu phí cho các đơn mới. Các notice là dữ liệu bền vững trong ứng
dụng, chưa phải email/push của module thông báo chung.
