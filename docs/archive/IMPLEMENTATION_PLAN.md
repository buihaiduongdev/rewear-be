# Kế hoạch triển khai backend Re.wear

Cập nhật: 21/10/2026. Trạng thái: đã chốt một phần quy tắc checkout; chưa triển khai các hạng mục mới.

MVP đã chốt chỉ thanh toán online sandbox (PAY-02); các mục COD trong kế hoạch được hoãn, không là điều kiện hoàn thành MVP. Không giới hạn nghiệp vụ vào một cổng thanh toán hoặc hãng vận chuyển. MoMo/GHN là hướng thử nghiệm ban đầu; danh sách tích hợp khả dụng còn phải xác minh theo [phạm vi tích hợp](INTEGRATION_SCOPE.md).

Quyết định đã xác nhận và các câu hỏi còn mở được lưu tại [CHECKOUT_DECISIONS.md](CHECKOUT_DECISIONS.md). Cập nhật quyết định và plan sau mỗi nhóm trao đổi; source PlantUML luồng tiền và các luồng liên quan đã cập nhật một phần; xem [danh mục diagram](../diagrams/README.md). Ngày 21/10/2026 đã đồng bộ 60 đoạn quy tắc/use case và thay 8 ảnh checkout/payment/order/shipping/dispute trong tab Báo cáo Google Docs, kiểm tra bố cục PDF. Đã đồng bộ tiếp domain/product state/6 use case, thêm 2 ERD và chèn 3 diagram finance; Báo cáo có mô tả UC-FIN-01..04. Chính sách/quyền và thử nghiệm còn mở theo danh mục diagram.

Nguồn nghiệp vụ: [Báo cáo Re.wear](https://docs.google.com/document/d/1iSOPW66vllAYl5PjRUGdEqCqoB3ZvL_9gCXr2o7c9DQ/edit?tab=t.0), mã nguồn backend hiện tại và kết quả đối chiếu ngày 20/10/2026. Mô hình dữ liệu trong [database-proposal.md](database-proposal.md) vẫn là Draft cho đến khi các quyết định liên quan được thống nhất.

Ngày 21/10/2026 đã đổi nhãn nhà cung cấp trong 12 diagram nghiệp vụ sang tên chung, render và thay 12 ảnh tương ứng trên Báo cáo; đã kiểm tra bản PDF. Source và ảnh giữ ánh xạ 1:1.

## 1. Thứ tự và phạm vi

Theo [phạm vi tích hợp và UI](INTEGRATION_SCOPE.md), không đưa tracking lượt xem, bật/tắt nhận đơn hoặc trạng thái kết nối API trên header seller vào MVP khi chưa có yêu cầu. Design có nhiều phương thức không đồng nghĩa đã tích hợp các cổng đó.

Mỗi dòng là một nhóm công việc, có thể chia thành nhiều PR nhỏ. Tên endpoint, enum và bảng mới dưới đây là đề xuất để thiết kế; chưa phải API contract đã phát hành.

| ID      | Công việc                                           | Phụ thuộc                                                      | Điều kiện hoàn thành chính                                                           |
| ------- | --------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| PLAN-01 | Thống nhất quy tắc, diagram và thử khả năng đối tác | Không                                                          | Có bảng quyết định; các khả năng Sandbox chưa xác minh được đánh dấu rõ              |
| PLAN-02 | Chuẩn bị kiểm thử với PostgreSQL cho dev            | Không; schema mới theo PLAN-01                                 | Có database test riêng, schema dev qua synchronize và kiểm chứng transaction         |
| PLAN-03 | Hoàn thiện nền tảng tài khoản, shop và quyền        | Các quyết định liên quan trong PLAN-01                         | Quyền thực thi ở BE; giới hạn một shop/chủ, địa chỉ và scope staff nhất quán         |
| PLAN-04 | Tình trạng sản phẩm, kiểm duyệt và vòng đời media   | PLAN-01, 02; quyền staff theo PLAN-03                          | Seller gửi duyệt; chỉ admin phê duyệt mới public; bằng chứng có phiên bản            |
| PLAN-05 | Giỏ hàng                                            | PLAN-01, 02                                                    | Giỏ không giữ hàng; không quantity; không trùng item trong cùng giỏ                  |
| PLAN-06 | Checkout, snapshot và Order                         | PLAN-04, 05; phí giao nhận đã có contract                      | Giữ hàng nguyên tử, chống request trùng, snapshot bất biến và tách order theo seller |
| PLAN-07 | Xử lý đơn bán và tác vụ hết hạn                     | PLAN-06                                                        | Xác nhận/hủy/timeout đúng trạng thái; job chạy lại không nhả nhầm hàng               |
| PLAN-08 | Thanh toán, đối soát và chi tiền seller             | PLAN-06, 07; khả năng tiền trong PLAN-01 đã xác minh           | Không ghi thanh toán/hoàn/chi tiền thành công trước xác nhận hợp lệ                  |
| PLAN-09 | Vận chuyển và COD                                   | PLAN-03, 06, 07; khả năng vận chuyển trong PLAN-01 đã xác minh | Tạo vận đơn, nhận webhook, phân biệt chờ lấy hàng/đang giao/đã giao                  |
| PLAN-10 | Khiếu nại, trả hàng và hoàn tiền                    | PLAN-08, 09                                                    | Seller phản hồi trước; trả hàng trước hoàn tiền; không chi tiền khi đang tranh chấp  |
| PLAN-11 | Review, chat và các tính năng còn trong phạm vi     | Từng chức năng theo module cần dùng                            | Không bỏ sót chức năng đã cam kết; có quyền và tiêu chí nghiệm thu                   |
| PLAN-12 | Nghiệm thu, triển khai và hoàn thiện báo cáo        | Các chức năng thuộc MVP đã hoàn tất                            | Có E2E, kiểm thử phục hồi, số đo và minh chứng thực tế                               |

PLAN-01 và PLAN-02 có thể tiến hành độc lập. Việc tìm hiểu Sandbox làm sớm, không đợi viết xong Order. Không đưa thanh toán thật vào vận hành trước khi PLAN-10 và cơ chế chặn chi tiền khi tranh chấp đã được kiểm chứng.

## 2. Các quyết định cần khóa

Chỉ chặn nhóm công việc phụ thuộc quyết định đó; không chặn toàn bộ dự án. Khi chốt, ghi phương án, lý do và tài liệu/diagram bị ảnh hưởng. Không tự nâng một đề xuất thành quy tắc đã thống nhất.

| ID     | Quyết định                    | Đề xuất hoặc câu hỏi cần giải quyết                                                                                                         | Chặn                |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| DEC-01 | Giỏ hàng và chia order        | Đã chốt: giỏ không giữ hàng/không quantity; một order nhiều món cùng nguồn bán. Xem CART-01, ORDER-01                                       | PLAN-05, 06         |
| DEC-02 | Thanh toán nhiều seller       | Đã chốt: thanh toán chung; bỏ món hết khả dụng khỏi giỏ/checkout, tiếp tục món hợp lệ. Lỗi hệ thống rollback. Xem PAY-01, CHECKOUT-01       | PLAN-06, 08         |
| DEC-03 | Bộ ảnh và tình trạng          | Đề xuất tối thiểu ba góc ảnh khi gửi duyệt, thêm ảnh khuyết điểm; ngoại lệ mất nhãn; ánh xạ bốn mức tình trạng và các số đo theo loại đồ    | PLAN-04             |
| DEC-04 | Trạng thái và deadline        | Đã chốt giữ 10 phút chung/lượt, không gia hạn. SOLD theo Quy tắc 1 hiện có; còn mốc hạn seller, bàn giao và nhánh ngoại lệ trả hàng         | PLAN-04, 07, 09, 10 |
| DEC-05 | Dòng tiền và COD              | Merchant đứng tên ai, ai nhận COD, kênh chi seller, nguồn hoàn COD; thu tiền ngay theo PAY-03; quyết toán và số dư vendor do Rewear quản lý | PLAN-08, 09, 10     |
| DEC-06 | Phí và phạm vi refund         | Đã chốt tính phí vận chuyển riêng mỗi nguồn bán. Còn mở bên chịu phí đi/về, partial refund, giao thất bại và sai hàng trả                   | PLAN-06, 10         |
| DEC-07 | Shop, tài khoản và staff      | Mời/accept hay thêm trực tiếp; ma trận quyền; tài khoản bị khóa còn xem lịch sử; địa chỉ kho của shop và seller cá nhân                     | PLAN-03, 09         |
| DEC-08 | Phạm vi nghiệm thu và lưu trữ | Flat category hay tree; wishlist/follow, chat, notification, banner, settings, báo cáo; thời hạn giữ snapshot/evidence/log                  | PLAN-03, 04, 11, 12 |

Mốc 15 phút thanh toán trong Báo cáo được thay bằng 10 phút chung/lượt checkout, tính từ khi giữ hàng thành công và không gia hạn khi gửi lại. Phần chữ và 8 ảnh liên quan đã đồng bộ; phạm vi còn lại xem danh mục diagram. Đã chốt seller có 24 giờ xác nhận (SELLER-01), demo có thể cấu hình ngắn hơn; mốc bắt đầu còn cần chốt; từ chối/quá hạn hủy và refund riêng order theo PAY-05. Đã chốt SETTLEMENT-01: sau đủ 72 giờ từ giao thành công và không có tranh chấp mới mở số dư vendor; buyer xác nhận sớm không mở tiền hoặc mất quyền khiếu nại. Lưu deadline cụ thể trên giao dịch, tránh thay cấu hình làm đổi ngầm đơn đang xử lý.

## 3. Công việc chi tiết

### PLAN-01 — Đặc tả và kiểm tra khả năng đối tác

- [x] Ghi DEC-01/02 và phần đã chốt của DEC-04/06 vào CHECKOUT_DECISIONS.md; cập nhật plan, TODO và phần chữ DB draft.
- [ ] Hoàn tất các quyết định còn mở của DEC-03 đến DEC-08; bổ sung acceptance criteria theo phương thức thanh toán sẽ chốt.
- [ ] Chuẩn hóa bảng chuyển trạng thái Product, Order, Shipment, Payment, Dispute; tách trạng thái order khỏi trạng thái tiền.
- [ ] Sửa domain cardinality: cart nhiều người cùng lưu một listing; order nhiều item; nhiều payment attempt; user có thể chưa có địa chỉ; listing thuộc đúng một nguồn bán.
- [x] Cập nhật một phần source PlantUML checkout/payment/order/shipping/dispute; thêm luồng tiền, quyết toán 72 giờ và rút tiền thủ công. Phạm vi và phần còn mở: [diagrams/README.md](../diagrams/README.md).
- [x] Đồng bộ domain/ERD/product state và 6 use case bị ảnh hưởng; source cho ảnh tổng quan và các góc nhìn báo cáo đã lưu trong repo. Bổ sung UC-FIN-01..04 theo phần đã chốt; các chính sách còn mở giữ nhãn dự thảo.
- [x] Render và thay 8 ảnh checkout/payment/order/shipping/dispute trong tab Báo cáo; kiểm tra PDF, sửa caption/ngắt trang trong phạm vi thay ảnh. Xem [ánh xạ ảnh](../diagrams/README.md#ánh-xạ-với-báo-cáo).
- [x] Thay 8 ảnh domain/product/use case, thêm 3 finance và 2 ERD; sửa số mục use case trùng, tuần tự 3.7 và caption hình mới trong chương 3.
- [ ] Hoàn thiện ma trận quyền shop/staff, nhánh tiền còn mở và acceptance criteria; rà soát ID/bảng use case toàn báo cáo khi chốt đặc tả cuối.
- [ ] Cập nhật DB draft theo quyết định đã chốt; bỏ câu hỏi cũ mà Báo cáo đã trả lời.
- [ ] Định nghĩa contract tạo thanh toán/xác minh/query/refund theo capability từng cổng; phương thức trả về từ cấu hình khả dụng. Thử adapter ban đầu MoMo Sandbox: tạo thanh toán thu tiền ngay, xác minh callback, query và refund; ghi kết quả đã che dữ liệu nhạy cảm. Chưa tích hợp API chi vendor trong MVP.
- [x] Chốt PAY-03: thu tiền ngay, giữ số dư chờ quyết toán nội bộ; không yêu cầu authorize/capture thủ công.
- [ ] Xác minh chế độ thu tiền ngay trên tài khoản Sandbox; phân biệt thanh toán thành công, lịch đối soát về ngân hàng và số dư vendor có thể rút.
- [ ] Định nghĩa contract quote/create/query/cancel và trạng thái giao nhận chung, mapping riêng từng hãng. Thử carrier Sandbox: mô hình tài khoản của sàn/shop, quote/create/query/cancel, webhook và đối soát COD; xác định cách ánh xạ mã địa chỉ.
- [ ] Nếu khả năng đối tác không đáp ứng: ghi rõ phần demo mô phỏng, giới hạn và thay đổi yêu cầu cần thống nhất. Không báo tích hợp hoàn tất chỉ vì mock chạy được.

Đầu ra: bảng quyết định trong kế hoạch, diagram được đồng bộ và ghi chép kết quả Sandbox. Chưa cần chọn framework/hàng đợi mới ở bước này.

### PLAN-02 — Database test cho giai đoạn dev

Người thực hiện xác nhận DB dev trống; tiếp tục synchronize, chưa làm migration/baseline (DEV-01).

- [ ] Chuẩn bị database test riêng, reset/seed có thể chạy lặp và cấu hình tránh kết nối nhầm database sử dụng thật.
- [ ] Tạo schema/seed test lặp được từ entity bằng synchronize trên database test riêng.
- [ ] Trước triển khai có dữ liệu cần bảo toàn: mở task migration/baseline và chính sách synchronize; không chặn code dev hiện tại.
- [ ] Có test PostgreSQL thật cho lock, unique/partial unique, transaction rollback và các cập nhật đồng thời; unit mock không đủ chứng minh những tính chất này.

### PLAN-03 — Tài khoản, shop, quyền và giới hạn

- [ ] Thống nhất auth theo email-link hiện có hoặc mở rộng OTP/SĐT bằng task riêng; sửa đặc tả tương ứng thay vì công bố tính năng chưa có.
- [ ] Nếu giữ quyền xem lịch sử cho tài khoản bị hạn chế: tách chưa xác thực/bị khóa/được phép đọc lịch sử và kiểm tra quyền theo hành động.
- [ ] Bảo đảm một user chỉ sở hữu tối đa một shop theo quy tắc đã chốt, kể cả hai request tạo shop đồng thời; xử lý dữ liệu trùng hiện có trước constraint.
- [ ] Bổ sung địa chỉ lấy hàng cho nguồn bán shop/cá nhân; tách mã địa giới chuẩn khỏi mã carrier và bảo vệ credential tích hợp ở BE.
- [ ] Triển khai invitation có accept/expire/revoke nếu chọn luồng mời; kiểm tra người nhận và chống tạo member trùng.
- [ ] Định nghĩa và thực thi quyền staff cho product/order/chat/report theo DEC-07; tiếp tục dùng scope shop và kiểm tra ở service.
- [ ] Áp giới hạn 10 địa chỉ và kiểm chứng khi tạo đồng thời; bảo toàn quy tắc tối đa một địa chỉ mặc định.
- [ ] Chốt flat category hoặc bổ sung cây theo task riêng; giữ contract rõ với FE.

### PLAN-04 — Product moderation, tình trạng và media

Chia thành hai PR: dữ liệu tình trạng/ảnh; workflow kiểm duyệt và khóa chỉnh sửa. Phương án enum sơ bộ: giữ DRAFT, ACTIVE, HIDDEN, HELD, SOLD; bổ sung PENDING_REVIEW/REJECTED và trạng thái sau xử lý vi phạm theo quyết định. Không tái sử dụng HIDDEN cho mọi nguyên nhân mà làm seller mở lại tin đã bị admin chặn.

- [ ] Khai báo tình trạng theo bốn mức, số đo theo loại đồ, sửa chữa và danh sách khuyết điểm; mỗi khuyết điểm có thể gắn ảnh cụ thể.
- [ ] Lưu nháp được thiếu thông tin; submit kiểm tra bộ ảnh, giá > 0, trường bắt buộc và giới hạn 50 tin cá nhân theo tập trạng thái được chốt.
- [ ] Bổ sung metadata góc ảnh/vị trí khuyết điểm; upload tiếp tục dùng ticket → PUT trực tiếp → confirm.
- [ ] Tạo revision nội dung và danh sách ảnh; approval gắn đúng revision. Sửa ảnh/nội dung đồng thời với admin duyệt không được public nhầm bản chưa duyệt.
- [ ] Đề xuất action submit và moderation approve/reject; reject bắt buộc lý do, người xử lý và lịch sử. Không cho seller tự DRAFT → ACTIVE.
- [ ] Áp dụng rule chỉ đổi giá không duyệt lại, đổi nội dung/ảnh phải duyệt lại; xác định cách xử lý bản đang public khi sửa.
- [ ] Kiểm tra trạng thái cho cả update thông tin lẫn upload-ticket/confirm/delete/reorder ảnh; HELD không được tự nhả hoặc sửa, SOLD theo chính sách lưu giữ đã chốt.
- [ ] Loại thao tác tự SOLD khỏi API seller khi Order quản lý vòng đời hàng; chốt riêng có hỗ trợ đánh dấu bán ngoài sàn hay không.
- [ ] Khi ẩn/bật lại phải giữ dấu vết approval, tránh bypass quyết định từ chối/gỡ tin của admin.
- [ ] Có cơ chế giữ object đã được snapshot sử dụng, không xóa vật lý chỉ vì gỡ khỏi listing; checksum/phiên bản và chính sách lưu giữ rõ ràng.
- [ ] Bảo vệ danh sách media quản lý của draft/pending/rejected theo quyền, không buộc FE public tin để đọc ảnh vừa upload.

Kiểm chứng: seller/staff ngoài quyền không duyệt được; chưa đủ ảnh không submit được; upload/sửa ảnh không bỏ qua duyệt lại; cập nhật và duyệt đồng thời chỉ chấp nhận revision hợp lệ.

### PLAN-05 — Cart

- [ ] Module cart, cart_items và entity cho synchronize dev; unique cartId + productId, không unique productId toàn hệ thống và không quantity.
- [ ] Đề xuất API đọc giỏ, thêm item, xóa item; hỗ trợ chọn tập item để checkout mà không tự chọn hết giỏ.
- [ ] Không giữ hàng lúc thêm; đọc giá/tình trạng hiện tại, nhóm hiển thị theo nguồn bán; BE vẫn tính lại khi checkout.
- [ ] Chặn tự mua món cá nhân hoặc shop buyer sở hữu. Khi checkout, tự loại món hết khả dụng khỏi giỏ/lượt mua, báo rõ món bị loại; tiếp tục món hợp lệ.
- [ ] Kiểm chứng nhiều buyer lưu cùng listing, request thêm trùng và truy cập cart của user khác.

### PLAN-06 — Checkout và Order

Chia PR schema/snapshot và PR transaction/API checkout. Áp dụng CHECKOUT_DECISIONS.md: nhiều order theo nguồn bán, một nhóm thanh toán, địa chỉ chung, phí vận chuyển riêng mỗi nguồn bán và deadline chung 10 phút.

- [ ] Module order, order_items, order_status_history; đúng một nguồn bán/order, nhiều item cùng nguồn bán, mỗi item là một món duy nhất; không cho buyer chọn quantity.
- [ ] Snapshot giá, thuộc tính, tình trạng, số đo/khuyết điểm, seller, revision/ảnh, địa chỉ và các khoản phí.
- [ ] Contract báo phí: nguồn quote, thời hạn quote và thông số kiện hàng còn mở. Hiển thị rõ giá/tổng hiện tại, không thêm hộp xác nhận riêng cho giá sản phẩm; snapshot giá lúc giữ và thanh toán đúng snapshot. Không gọi API carrier trong transaction đang giữ hàng.
- [ ] Idempotency checkout theo user và yêu cầu; request gửi lại nhận kết quả/deadline cũ, không gia hạn; payload khác cùng key trả lỗi rõ. Đổi danh sách món phải hủy lượt cũ, nhả reservation hợp lệ rồi kiểm tra/giữ lại cho lượt mới.
- [ ] Trong transaction: kiểm tra seller/shop/category/revision, chống tự mua, reserve món khả dụng, loại món hết khả dụng khỏi checkout và giỏ rồi tạo order/history/snapshot cho món giữ được. Không còn món thì không tạo thanh toán; lỗi hệ thống rollback các thay đổi.
- [ ] Ưu tiên conditional update/CAS tại PostgreSQL, kiểm tra kết quả từng món; kiểm tra điều kiện sửa giá/nội dung đồng thời với reserve. Xử lý nhiều món theo thứ tự ổn định, có kiểm chứng cạnh tranh; không dùng read rồi save thiếu điều kiện.
- [ ] Gắn reservation với nhóm checkout và chủ sở hữu; một deadline 10 phút chung cho các order, không chỉ có heldUntil. Nhả hàng theo đúng reservation và trạng thái; job cũ không nhả reservation mới/món đã thanh toán.
- [ ] Snapshot một địa chỉ chung vào từng order; tính phí vận chuyển riêng từng nguồn bán và tổng nhóm thanh toán.
- [ ] Khóa sửa giá/nội dung/ảnh/trạng thái bán khi HELD ở backend, kể cả request cạnh tranh.
- [ ] API đọc đơn mua/đơn bán/chi tiết; scope buyer/seller/shop, phân trang và timeline.
- [ ] Deadline được lưu bằng timestamp cụ thể; tổng tiền do BE tính theo quy tắc, dữ liệu tiền có đơn vị/currency rõ ràng.

Kiểm chứng: hai buyer mua cùng món chỉ một reserve thành công; checkout lặp không tạo thêm đơn; DB lỗi rollback cả lịch sử/giỏ theo contract; sửa hoặc xóa nguồn dữ liệu không thay snapshot.

### PLAN-07 — Xử lý đơn và tác vụ nền

- [ ] API seller xác nhận/từ chối và buyer hủy; kiểm tra trạng thái, quyền, lý do và ghi history cùng transaction.
- [ ] Tác vụ hết 10 phút giữ hàng chung/lượt checkout và 24 giờ chờ seller; nhả đúng reservation một lần và tạo yêu cầu xử lý tiền khi cần.
- [ ] Phân biệt payment attempt lỗi với order hết hạn; không nhả hàng chỉ vì một lần thanh toán lỗi trong khi còn được thử lại.
- [ ] Chốt giới hạn chờ bàn giao sau seller xác nhận và luồng hủy/giao thất bại; không để hàng bị giữ vô thời hạn.
- [ ] Job phải quét bù sau restart và an toàn khi nhiều worker chạy cùng lúc. Chọn scheduler/queue theo nhu cầu thực tế, không dùng timer trong RAM làm nguồn duy nhất.
- [ ] Gửi thông báo và gọi dịch vụ ngoài sau commit; dùng bản ghi công việc bền vững/outbox khi cần bảo đảm retry, tránh giao dịch DB thành công nhưng mất yêu cầu xử lý tiền.

### PLAN-08 — Payment, reconciliation và chi seller

PAY-05 đã chốt: buyer trả toàn bộ checkout một lần, ghi nhận đã thu theo kết quả hợp lệ từ cổng, không chờ vendor. Phân bổ theo order; vendor từ chối/quá hạn chỉ hủy và refund order đó; các order khác tiếp tục. Rewear giữ số dư vendor chờ quyết toán.

Triển khai từng PR: payment attempt/webhook; đối soát/refund và số dư vendor. Adapter cổng chỉ phụ trách tạo thanh toán, xác minh kết quả, query và refund; logic quyết toán/khiếu nại/rút tiền dùng chung. Giữ DI hiện có, chưa tạo framework tích hợp tổng quát. MVP rút tiền qua admin chuyển bên ngoài.

- [ ] payment_transactions và lịch sử/sự kiện cần thiết; payment attempt thuộc nhóm checkout để thanh toán chung các order. Thiết kế liên kết/phân bổ theo order cho refund/chi seller sau khi chốt quy tắc tiền. Tách trạng thái buyer thanh toán khỏi khoản cần chi/đã chi seller.
- [ ] Tạo giao dịch ngoài DB transaction đang khóa; lưu reference và trạng thái pending trước khi gọi, có query/retry khi timeout.
- [ ] Callback phải kiểm tra chữ ký, merchant/reference, amount/currency và trạng thái; trang redirect FE không quyết định thanh toán thành công.
- [ ] Dedup theo định danh sự kiện hoặc khóa nghiệp vụ phù hợp dữ liệu provider; requestId gọi API không mặc nhiên thay thế dedup webhook.
- [ ] Xử lý sự kiện trùng, sai thứ tự, nhiều attempt cùng thành công và thành công đến sau deadline; không hồi sinh đơn đã nhả hàng.
- [ ] Idempotency theo từng thao tác tiền; timeout không đồng nghĩa thất bại, query trước khi quyết định retry hoặc bù trừ.
- [ ] Đối soát định kỳ và thao tác admin yêu cầu đồng bộ; không cho admin nhập tay trạng thái thành công của cổng.
- [ ] Mở số dư theo SETTLEMENT-01: đã thu tiền, giao thành công, đủ 72 giờ và không có tranh chấp; kiểm tra kết quả đối soát và khoản phải trả. Buyer confirmation sớm không mở tiền.
- [ ] Tách trạng thái order khỏi quyền mở dispute và trạng thái quyết toán: order đã được buyer bấm hoàn tất vẫn cho khiếu nại hợp lệ trong 72 giờ; webhook giao hàng lặp không reset deadline.
- [ ] Serialize mọi thay đổi điều kiện chi/dispute theo cùng tài nguyên; trước khi phát lệnh tiền phải kiểm tra lại, job đã được xếp lịch không được bỏ qua dispute vừa mở.
- [ ] Chốt trạng thái đang chi và trường hợp kết quả chưa rõ; chưa xác nhận chi thành công thì chưa ghi nhận đã trả seller.
- [ ] Khóa bật luồng thật tới khi có PLAN-10; nếu demo thì đánh dấu môi trường/trạng thái mô phỏng rõ ràng.

- [ ] WITHDRAW-01: vendor xem số dư/lịch sử, chọn tài khoản nhận và chủ động tạo yêu cầu rút; không tự chuyển tiền theo từng order.
- [ ] Giữ tiền chờ rút nguyên tử, kiểm tra quyền tài khoản nhận và snapshot đích nhận; chống hai yêu cầu rút vượt số dư, retry không chi hai lần. Chỉ hoàn số dư khi xác định yêu cầu chưa được chi.
- [ ] WITHDRAW-02: admin kiểm tra/nhận xử lý yêu cầu, chuyển tiền bên ngoài rồi ghi kết quả kèm reference/chứng từ và audit; không tích hợp API chi tiền tự động trong MVP. Không ghi thành công chỉ vì duyệt yêu cầu; xử lý an toàn khi chưa rõ kết quả, không chuyển lại hoặc hoàn số dư ngay.
- [ ] WITHDRAW-03: vendor chỉ hủy khi Chờ xử lý; hủy trả số dư đúng một lần. Admin nhận xử lý và vendor hủy phải kiểm tra/cập nhật nguyên tử trên cùng trạng thái; kiểm thử chỉ một bên thành công.
- [ ] Chốt ngưỡng/phí rút, nhánh admin từ chối và chính sách khấu trừ phát sinh; không suy ra quyền tự động trừ ví từ việc vendor chưa rút.

### PLAN-09 — Vận chuyển qua adapter; COD hoãn sau MVP

Áp dụng SHIPPING-02: sàn quản lý tài khoản tích hợp và điểm lấy hàng theo nguồn bán; sàn trả cước, vendor không nhận phí ship vào số dư. Chưa triển khai hybrid/tài khoản riêng vendor. Nghiệp vụ dùng contract chung; GHN là adapter thử đầu tiên, không là hãng duy nhất.

Giới hạn đồ án: thử nghiệm một tài khoản GHN chung, chưa có hợp đồng vận chuyển riêng. Chưa kiểm chứng giới hạn số shop/kho, tốc độ API hoặc đối soát cước ở quy mô sàn thực tế; cần thỏa thuận trực tiếp với GHN trước triển khai thật. Kết quả API sandbox phải được ghi nhận riêng, không coi là xác nhận năng lực production.

- [ ] Module shipment, lịch sử carrier event, contract vận chuyển chung và adapter thử nghiệm GHN; phân biệt quote/create/cancel/query.
- [ ] Lưu mapping nguồn bán → kho GHN thuộc tài khoản sàn; kiểm chứng tạo kho, quote và tạo vận đơn trên môi trường thử nghiệm. Credential giữ ở BE, kiểm tra quyền quản lý kho.
- [ ] Snapshot tài khoản/kho và bên trả cước trên shipment; ghi nhận cước GHN để đối soát với khoản đã thu buyer, không cộng phí ship vào khoản phải trả vendor. Quản lý nguồn tiền trả GHN theo lịch đối soát thực tế của cổng.
- [ ] Mapping mã địa giới carrier ở lớp tích hợp; không thay mã chuẩn trong user_addresses thành mã riêng của hãng.
- [ ] Snapshot kho lấy hàng, địa chỉ nhận, kiện hàng, gói dịch vụ, người trả phí và COD amount; online không bị thu lại tiền hàng.
- [ ] Tạo vận đơn có idempotency/đối soát sau timeout; chặn tạo hai vận đơn đang hoạt động cho một chiều giao khi không có nhu cầu chia kiện.
- [ ] Có nhãn/mã vận đơn không đồng nghĩa đã lấy hàng. Chuyển order theo event pickup/in-transit/delivered đáng tin cậy.
- [ ] Webhook xác thực theo khả năng hãng, dedup, mapping state và query đối soát; ghi lịch sử cả khi sự kiện không làm đổi order.
- [ ] Giao lại, hủy vận đơn, giao thất bại, chuyển hoàn và xác nhận nhận lại hàng; chỉ nhả sản phẩm khi đủ điều kiện.
- [ ] Tiền COD được đối soát riêng với trạng thái delivered; xác định tài khoản nhận, khoản cần chi và quy trình hoàn COD theo DEC-05.
- [ ] Carrier delivered mở thời hạn kiểm tra 72 giờ đúng một lần; không dùng biên lai gửi hàng do seller tải lên thay sự kiện nhận hàng.

### PLAN-10 — Dispute, return và refund

Chia PR hồ sơ/trao đổi, PR return/refund và các kiểm chứng cạnh tranh với chi tiền.

- [ ] RETURN-01: hồ sơ tranh chấp gắn order và danh sách item cụ thể; hỗ trợ trả/refund món được chấp thuận, giữ nguyên các món khác. Lưu event/actor/lý do và số tiền từng item; quy tắc số case đang mở cần hoàn thiện.
- [ ] Chốt xử lý hoa hồng khi refund item và mở phần tiền không tranh chấp; phí ship theo RETURN-02/03. Hiện vẫn khóa khoản tiền order theo SETTLEMENT-01.
- [ ] RETURN-02: chỉ phong tỏa riêng cước đi/về khi có khiếu nại và xác định lỗi vendor; tách khoản giữ cước khỏi tiền hàng/khóa tranh chấp, gắn hồ sơ và vận đơn, chống thu trùng. Không mặc định giữ cước cho mọi đơn hoặc tố cáo chưa xác minh.
- [ ] RETURN-03: trả một phần hoàn tiền món, không tự hoàn ship; buyer yêu cầu hoàn ship để admin xét. Trả toàn bộ do lỗi vendor hoàn tiền hàng và ship order; không ảnh hưởng order khác. Vendor chịu phí trả, cước đi bù theo khoản hoàn ship hợp lệ; chống thu cước trùng.
- [ ] RETURN-04: xác minh lỗi buyer thì bác trả/hoàn và xem đơn hoàn tất; không hoàn tiền/ship, không tính cước vendor. Vẫn chờ đủ 72 giờ mới mở tiền; thiếu video không tự chứng minh lỗi buyer.
- [ ] Quyết toán cước hợp lệ, nhả phần dư; đặc tả nguồn tiền khi vendor thiếu số dư và lưu yêu cầu/duyệt hoàn ship theo RETURN-03.
- [ ] Buyer gửi mô tả và ảnh; hỗ trợ video theo loại khiếu nại. Thiếu video không tự động quyết định kết quả.
- [ ] Mở dispute khóa điều kiện chi trong cùng cơ chế đồng thời của Order; kiểm tra thời hạn trên server.
- [ ] RETURN-05: seller phản hồi khiếu nại trong 24 giờ, quá hạn/bất đồng mới chuyển admin; buyer gửi trả trong 3 ngày sau chấp thuận; vendor xác nhận trong 48 giờ sau đơn vị vận chuyển giao trả, quá hạn chuyển admin, không tự refund vì im lặng. Lưu deadline theo cấu hình snapshot; buyer rút yêu cầu theo rule đã chốt.
- [ ] Admin đối chiếu snapshot và lịch sử, ghi quyết định/lý do; không sửa/xóa bằng chứng gốc hoặc kết quả tiền bằng nhập liệu.
- [ ] Tạo/theo dõi vận đơn trả, hạn gửi trả, xác nhận đúng hàng; xử lý seller im lặng, nhận sai/hỏng/mất hàng và phí đi/về.
- [ ] Chỉ tạo refund khi đủ điều kiện và xác minh giao dịch đã thu; giao dịch chưa rõ kết quả phải query/đối soát trước. Hủy checkout chưa thanh toán khác với hoàn tiền đã thu.
- [ ] Refund pending, retry/query và xác nhận cuối; order không gộp mọi kết quả trả hàng/hoàn tiền vào CANCELLED.
- [ ] Media cho DISPUTE/RETURN và VIDEO: giới hạn riêng, presign upload, quyền xem bằng chứng, chính sách giữ/xóa; không dùng URL public của ảnh listing cho bằng chứng riêng tư.
- [ ] Kết quả tranh chấp quyết định việc khóa listing/tái bán theo policy; không tự public hàng lỗi hoặc hàng chưa về tay seller.

### PLAN-11 — Hoàn tất chức năng trong phạm vi

- [ ] Review: chỉ buyer hợp lệ khi order hoàn tất; một review/item; ảnh, phản hồi seller và moderation có lý do.
- [ ] Chat: người tham gia, phạm vi shop/staff, ngữ cảnh product/order, gửi/đọc/phân trang, quyền attachment và quy tắc giữ lịch sử.
- [ ] Notification: danh sách/đánh dấu đã đọc, sự kiện đơn hàng/duyệt tin/tranh chấp; phát thông báo có thể retry sau commit.
- [ ] Wishlist và follow shop theo DEC-08: uniqueness và quyền; không làm reserve listing.
- [ ] Banner/nội dung trang chủ: thời gian hiển thị, quyền admin và nội dung hết hạn.
- [ ] Settings theo SETTINGS-01: admin cấu hình tham số nghiệp vụ (hoa hồng, thời hạn); validate giá trị, kiểm tra quyền ở BE và lưu lịch sử trước/sau. Khởi tạo các thời hạn đã chốt 10 phút/24 giờ/72 giờ; mức hoa hồng ban đầu còn mở.
- [ ] Snapshot phí/tham số và deadline trên giao dịch; cấu hình mới không hồi tố order/reservation đã tạo. Xác định thời điểm snapshot từng tham số; tách secret tích hợp khỏi settings nghiệp vụ.
- [ ] Audit nghiệp vụ: thay quyền, duyệt tin, chuyển trạng thái, phán quyết và yêu cầu đối soát; phân biệt request log với lịch sử nghiệp vụ.
- [ ] Reports: định nghĩa riêng doanh số hàng, phí, phải trả seller, đã chi, hoàn tiền; scope shop/admin và xuất file theo phạm vi nghiệm thu.

### PLAN-12 — Nghiệm thu và triển khai

- [ ] Kiểm chứng khởi tạo schema dev trên database trống, backup/restore và phục hồi job; migration/bảo toàn dữ liệu được đánh giá riêng trước triển khai ngoài phạm vi dev.
- [ ] E2E happy path và nhánh lỗi cho buyer/seller/staff/admin, COD/online, webhook, deadline và hoàn tiền.
- [ ] Đo hiệu năng theo môi trường công bố, kiểm tra quyền chéo tài khoản/shop, snapshot và số liệu đối soát.
- [ ] Kiểm tra secret/log, cấu hình môi trường và chính sách lưu object/snapshot/evidence theo quyết định.
- [ ] Hoàn thiện chương triển khai/kiểm thử bằng kết quả thực; ghi rõ những tích hợp chỉ được mô phỏng.

## 4. PR nên làm trước

1. **PR tài liệu:** kế hoạch/TODO, quyết định và diagram đã thống nhất. Không sửa enum nghiệp vụ cùng lúc với việc còn thay quyết định.
2. **PR nền kiểm thử dữ liệu:** PLAN-02; test transaction/cạnh tranh trên PostgreSQL và thêm ràng buộc theo module; dev dùng synchronize, chưa làm migration.
3. **PR nền quyền và quy tắc shop:** phần PLAN-03 cần cho đăng bán và kho lấy hàng.
4. **PR dữ liệu tin đăng:** tình trạng, số đo, khuyết điểm, bộ ảnh/revision; giữ draft để FE upload trực tiếp.
5. **PR moderation:** submit/approve/reject, lịch sử, khóa sửa và quyền; sau đó mới nối Cart/Checkout.

Thử nghiệm Sandbox là task độc lập trong giai đoạn này. Không đợi tất cả chức năng phụ hoàn tất mới bắt đầu Cart, nhưng không mở quyền staff chưa được đặc tả.

## 5. Kiểm chứng cho từng PR code

- Chạy pnpm check và pnpm test --runInBand; thêm integration/E2E phù hợp phần thay đổi. Dùng script test của dự án để bật VM modules cần cho NestJS 12/Jest trên Node 24.
- Với lock/constraint/idempotency/job: bắt buộc có kiểm chứng PostgreSQL thực, không chỉ mock repository.
- Kiểm tra /api/docs-json khớp response serialize/envelope/status; ngày giờ là chuỗi ISO trong contract. Sinh thử client Orval ở FE khi API thay đổi.
- Trong giai đoạn dev: kiểm tra schema synchronize và constraint trên database test. Nếu mở task migration sau này, kiểm tra schema/dữ liệu trước và sau khi chạy.
- Cập nhật diagram, README/contract và AI_USAGE_LOG.md khi liên quan; mô tả phần chưa kiểm chứng rõ ràng.
- Hoàn thành checklist bằng kết quả thực tế, không đánh dấu xong chỉ vì có endpoint hoặc unit test happy path.

## 6. Backlog kỹ thuật và giới hạn thay đổi

Nâng NestJS và chuyển input validation sang Standard Schema đã được triển khai ngày 20/10/2026; xem kết quả và giới hạn kiểm chứng tại [TODO.md](TODO.md). Tách dataset địa giới khỏi TypeScript, thumbnail và tối ưu media quy mô lớn tiếp tục ở backlog, không chặn feature nghiệp vụ mới. Riêng giữ ảnh snapshot, phân quyền evidence, xử lý tác vụ tiền bền vững và test transaction phải đi cùng module sử dụng chúng.

Đợt đồng bộ tài liệu không triển khai code, không chạy migration và không tự chốt các phần quyết định còn mở. Phần chữ và ảnh đã cập nhật được ghi rõ ở PLAN-01. Quyết định được người thực hiện xác nhận ngày 21/10/2026 nằm trong CHECKOUT_DECISIONS.md. Các lựa chọn tên bảng/endpoint/enum được hoàn thiện trong PR liên quan sau khi quy tắc được thống nhất.

### Bằng chứng GHN hiện có

[ghn_integrate.md](ghn_integrate.md) ghi nhận test COD bằng công cụ Sandbox, không phải E2E backend. Kết quả create/detail/webhook delivered không xác minh cấu hình MVP online/sàn chịu cước. Checklist kho vendor, quote, COD = 0, hủy/trả và bảo vệ webhook còn mở theo tài liệu này; không xếp COD settlement thành yêu cầu MVP.
