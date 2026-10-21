# Technical TODO

## Lộ trình triển khai nghiệp vụ

Cập nhật 21/10/2026. Kế hoạch chi tiết, phụ thuộc, quyết định còn mở và tiêu chí
hoàn thành nằm trong [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
Quyết định đã chốt nằm trong [CHECKOUT_DECISIONS.md](CHECKOUT_DECISIONS.md).
Các mục triển khai dưới đây chưa phải tính năng đã hoàn tất. Source PlantUML luồng
tiền đã cập nhật một phần; xem [danh mục diagram](../diagrams/README.md). Đã cập nhật
60 đoạn phần chữ và thay 8 ảnh checkout/payment/order/shipping/dispute trong tab Báo cáo;
đã bổ sung domain/product state/6 use case, 2 ERD và 3 diagram finance cùng mô tả UC-FIN-01..04.
Chính sách/quyền còn mở và thử nghiệm đối tác vẫn cần hoàn thiện.

| Trạng thái | ID      | Công việc                                                                              | Ưu tiên                         |
| ---------- | ------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| [ ]        | PLAN-01 | Thống nhất quy tắc; đồng bộ phần chữ, PlantUML và ảnh Docs; thử khả năng Sandbox       | Làm trước và nghiên cứu sớm     |
| [ ]        | PLAN-02 | Database test riêng và test transaction PostgreSQL; dev dùng synchronize               | Trước schema và checkout mới    |
| [ ]        | PLAN-03 | Quyền shop/staff, giới hạn tài khoản/địa chỉ và kho lấy hàng                           | Trước luồng dùng staff/shipping |
| [ ]        | PLAN-04 | Tình trạng, bộ ảnh, revision, submit/approve/reject và khóa sửa listing                | Feature nghiệp vụ kế tiếp       |
| [ ]        | PLAN-05 | Cart không giữ hàng; không quantity; unique theo cart + product                        | Sau quy tắc cart                |
| [ ]        | PLAN-06 | Checkout, reserve nguyên tử, snapshot bất biến và Order                                | Sau PLAN-04, 05 và contract phí |
| [ ]        | PLAN-07 | Xác nhận/hủy đơn, deadline, history và job phục hồi sau restart                        | Sau Order                       |
| [ ]        | PLAN-08 | Payment attempt, webhook, reconciliation và chi seller                                 | Sau Order và xác minh dòng tiền |
| [ ]        | PLAN-09 | Shipping API/webhook, COD và chuyển hoàn                                               | Sau Order và contract carrier   |
| [ ]        | PLAN-10 | Seller phản hồi, escalation, return, refund và evidence                                | Sau payment/shipping            |
| [ ]        | PLAN-11 | Review/chat/notification/wishlist/banner/settings/audit/reports theo phạm vi           | Theo phụ thuộc từng tính năng   |
| [ ]        | PLAN-12 | E2E, phục hồi, đo hiệu năng và minh chứng báo cáo; migration đánh giá trước triển khai | Trước nghiệm thu                |

### Quyết định cần ghi nhận trước phần code tương ứng

- [x] DEC-01: giỏ không giữ hàng/không quantity; một order nhiều món cùng nguồn bán.
- [x] DEC-02: thanh toán chung nhiều order; loại món hết khả dụng khỏi giỏ/checkout, tiếp tục món hợp lệ; lỗi hệ thống rollback.
- [ ] DEC-03: số/góc ảnh, ngoại lệ mất nhãn, mức tình trạng, số đo và khuyết điểm.
- [ ] DEC-04: đã chốt deadline chung 10 phút/lượt checkout, không gia hạn; đã chốt 72 giờ sau giao và xác nhận sớm không mở tiền/mất quyền khiếu nại; SOLD theo Quy tắc 1 hiện có; còn deadline bàn giao và ngoại lệ trả hàng/rút khiếu nại.
- [ ] DEC-05: tài khoản merchant, lịch đối soát tiền về ngân hàng và nguồn refund; COD hoãn ngoài MVP. Quyết toán/rút tiền vendor theo quyết định đã chốt, không phụ thuộc hold của cổng.
- [ ] DEC-06: đã chốt phí vận chuyển riêng từng nguồn bán; còn bên chịu phí đi/về, hoàn theo item/order, partial refund và chuyển hoàn.
- [ ] DEC-07: lời mời staff, ma trận quyền, tài khoản bị hạn chế và địa chỉ kho.
- [ ] DEC-08: phạm vi tính năng phụ, flat/tree category và chính sách lưu snapshot/evidence.

- [x] PAY-02: MVP chỉ thanh toán online sandbox, một lần cho nhóm checkout; COD hoãn sau MVP. Chọn MoMo Sandbox theo PAY-04.

- [x] PAY-03: thu tiền ngay sau thanh toán hợp lệ; Rewear giữ số dư vendor chờ quyết toán, không demo authorize/capture thủ công.
- [ ] Xác minh thanh toán thu tiền ngay, query và refund trên MoMo Sandbox; ghi kết quả thực tế, không đánh dấu tích hợp chỉ từ mock.

- [x] PAY-04: không giới hạn một cổng; MoMo là hướng thử ban đầu, danh sách phương thức và API thanh toán/query/refund chưa được kiểm chứng đầy đủ; rút tiền vendor do admin chuyển bên ngoài.

- [x] SELLER-01: seller có 24 giờ xác nhận đơn, demo có thể rút ngắn bằng cấu hình; còn chốt mốc bắt đầu; từ chối/quá hạn xử lý riêng order theo PAY-05.

- [x] SHIPPING-02: sàn quản lý tài khoản tích hợp và điểm lấy hàng theo nguồn bán; GHN là adapter thử ban đầu, không là hãng duy nhất; sàn trả cước, vendor không nhận khoản bù ship; bỏ hybrid khỏi MVP.
- [ ] Kiểm chứng mapping kho, quote, vận đơn và cước GHN; chốt hoàn phí ship cho buyer khi hủy/trả và chênh lệch cước.

- [ ] Trước triển khai thật: làm việc với GHN về hợp đồng, số shop/kho, tốc độ API và đối soát cước quy mô sàn; chưa kiểm chứng các giới hạn này trong đồ án sandbox.

- [x] PAY-05: ghi nhận thanh toán thành công cho toàn checkout, phân bổ theo order; seller từ chối/quá hạn hủy và refund riêng order, các order khác tiếp tục; vendor chưa được rút trước quyết toán.

- [x] SETTLEMENT-01: đủ 72 giờ sau giao thành công, không có tranh chấp mới mở tiền vendor; buyer bấm hoàn tất sớm không mở tiền hoặc mất quyền khiếu nại.

- [x] SETTINGS-01: admin cấu hình tham số nghiệp vụ; giao dịch lưu phí/deadline đã áp dụng, thay cấu hình không hồi tố đơn/reservation đang xử lý.
- [ ] Chốt mức hoa hồng khởi tạo, danh mục/ràng buộc tham số; triển khai admin API, audit và kiểm thử cấu hình mới không đổi giao dịch cũ.

- [x] WITHDRAW-01: vendor chủ động yêu cầu rút số dư tích lũy, chọn tài khoản nhận; không tự chuyển theo từng order.
- [x] WITHDRAW-02: MVP admin xử lý rút, chuyển tiền bên ngoài và ghi nhận kết quả kèm mã giao dịch/chứng từ; chưa tích hợp API chi tiền tự động.
- [x] WITHDRAW-03: vendor chỉ hủy khi Chờ xử lý; admin nhận xử lý thì khóa hủy, cập nhật nguyên tử và hoàn số dư đúng một lần.
- [ ] Chốt ngưỡng/phí, nhánh admin từ chối và khấu trừ phát sinh; kiểm thử giữ tiền chờ rút, chống rút trùng/vượt số dư và đối soát chi tiền.

- [x] Cập nhật một phần diagram luồng tiền và checkout/payment/order/shipping/dispute; thêm quyết toán 72 giờ và rút tiền thủ công. Xem [diagrams/README.md](../diagrams/README.md).
- [x] Thay 8 ảnh checkout/payment/order/shipping/dispute trong tab Báo cáo; kiểm tra PDF và caption. Xem [ánh xạ ảnh](../diagrams/README.md#ánh-xạ-với-báo-cáo).
- [x] Đồng bộ domain/ERD/product state/6 use case; thay 8 ảnh, thêm 2 ERD và chèn 3 finance cùng mô tả UC-FIN-01..04 vào Báo cáo.
- [ ] Hoàn thiện quyền tiền shop/staff, chính sách còn mở và acceptance criteria chi tiết; PLAN-01 vẫn chưa hoàn tất.

- [x] RETURN-01: hỗ trợ trả/hoàn riêng món được chấp thuận trong đơn nhiều món; các món khác giữ nguyên. Phí ship/hoa hồng và mở phần tiền không tranh chấp còn cần chốt.

- [x] RETURN-02: có khiếu nại và xác định lỗi vendor mới phong tỏa riêng cước hai chiều vendor chịu; không giữ thêm cước chỉ vì tố cáo chưa xác minh, không khấu trừ trùng.
- [ ] Chốt nguồn tiền khi vendor thiếu số dư; kiểm thử giữ/khấu trừ cước, duyệt hoàn ship và nhả dư đúng một lần.

- [x] RETURN-03: trả một phần chỉ hoàn tiền món; buyer có thể yêu cầu hoàn ship để admin duyệt. Trả toàn bộ do lỗi vendor hoàn tiền hàng và ship; không thu cước trùng.
- [x] RETURN-04: lỗi buyer đã xác minh thì bác trả/hoàn, xem đơn hoàn tất; không hoàn tiền/ship, không mở tiền vendor trước đủ 72 giờ.

- [x] RETURN-05: seller phản hồi 24 giờ; buyer gửi trả trong 3 ngày sau chấp thuận; vendor xác nhận 48 giờ sau đơn vị vận chuyển giao trả. Seller/vendor quá hạn chuyển admin, không tự refund vì im lặng; admin cấu hình, hồ sơ giữ deadline cũ.

### Kịch bản bắt buộc cho luồng giao dịch

- [ ] Hai buyer checkout cùng món: chỉ một reserve thành công.
- [ ] Retry checkout không tạo hai đơn; idempotency key khác payload bị từ chối.
- [ ] Một lượt nhiều seller: món hết khả dụng bị loại khỏi giỏ/checkout, món hợp lệ tiếp tục; tổng/phí cập nhật rõ, không còn món thì không tạo thanh toán.
- [ ] Hết 10 phút chung hoặc hủy: nhả đúng reservation; tải lại/retry không gia hạn; đổi danh sách phải hủy và giữ lại ở lượt mới.
- [ ] Chặn tự mua và chặn sửa giá/nội dung/ảnh/trạng thái khi HELD, kể cả request cạnh tranh.
- [ ] Một địa chỉ chung được snapshot từng order; phí giao riêng mỗi nguồn bán, thanh toán đúng tổng snapshot.
- [ ] Payment attempt lỗi còn trong hạn được retry; callback trùng/đến muộn không hồi sinh đơn đã hủy.
- [ ] Job cũ không nhả reservation mới; seller từ chối/quá hạn xử lý tiền đúng một lần.
- [ ] Listing/ảnh/địa chỉ bị sửa hoặc xóa không làm thay đổi snapshot của order.
- [ ] Approval và sửa nội dung/ảnh đồng thời không public revision chưa được duyệt.
- [ ] Tạo mã vận đơn chưa đánh dấu đã lấy hàng; webhook trùng/sai thứ tự không làm lùi state.
- [ ] Mở dispute sát deadline đồng thời job mở số dư/chi tiền không bỏ qua tranh chấp hợp lệ.
- [ ] Buyer bấm hoàn tất trước 72 giờ vẫn được khiếu nại; không mở tiền sớm; delivered lặp không reset deadline.
- [ ] Chấp nhận trả hàng chưa hoàn tiền ngay; có nhánh buyer không gửi trả/seller không xác nhận.
- [ ] Refund/chi tiền timeout phải đối soát; retry không trả/hoàn tiền hai lần.
- [ ] Evidence và tài nguyên shop không bị đọc/sửa bởi user hoặc staff ngoài quyền.
- [ ] Kiểm chứng online sandbox và phân biệt tích hợp thật với mô phỏng; COD hoãn sau MVP, kiểm chứng riêng khi mở lại phạm vi.

Các mục kỹ thuật bên dưới được giữ lại. Nâng framework, đổi validation và tách
dataset địa giới không chặn feature nghiệp vụ; các yêu cầu tính đúng đắn phải
được triển khai cùng module sử dụng chúng.

## Thống nhất validation và response schema bằng Zod

**Trạng thái:** Đã refactor ngày 20/10/2026 theo hướng schema của
`be-marty-demo-2`; giữ hạ tầng auth và response của Rewear.

- [x] Nâng nhóm NestJS lên 12, TypeScript 6; đồng bộ Node 24 LTS tối thiểu
      24.9, `.nvmrc`, cấu hình build/test và CI.
- [x] Chuyển request DTO của Auth, User, Category, Shop, Product, User Address
      và Media sang Zod schema cùng type `z.output`; gắn schema trực tiếp vào body,
      query và param, đăng ký native `StandardSchemaValidationPipe` global.
- [x] Xóa DTO class, decorator Trim, custom ZodValidationPipe và dependency trực
      tiếp class-validator/class-transformer; bỏ nhánh pagination dùng itemsDto
      không có caller. Một số dependency vẫn có thể kéo thư viện cũ qua optional peer.
- [x] Kiểm chứng trim, số/boolean, PATCH, null, field dư, query defaults và các
      trường không được phép ghi; login được validate trước khi chạy strategy.
- [x] Giữ serialize/envelope/status/ISO date; sinh OpenAPI từ metadata schema,
      chạy Orval trên snapshot tạm và kiểm tra TypeScript của client sinh ra.
- [x] Kiểm chứng HTTP với controller thật và persistence mock; giữ đường dẫn
      field trong `errors`. `message` của lỗi validation thống nhất thành mảng;
      FE hiện đã hỗ trợ cả chuỗi và mảng. Các điểm thay đổi được ghi trong README.
- [ ] Kiểm thử ứng dụng với PostgreSQL và các dịch vụ thật; test HTTP contract
      hiện không thay thế kiểm thử tích hợp này.

## Cải thiện hạ tầng tham khảo từ Marty demo

**Trạng thái:** Đề xuất sau khi đối chiếu `be-marty-demo-2` ngày 20/10/2026;
chưa triển khai. Hoàn tất PR Standard Schema trước, sau đó ưu tiên HTTP và PLAN-02.

### Ưu tiên 1 — HTTP và response contract

- [ ] Đăng ký global exception filter và transform interceptor qua `APP_FILTER` /
      `APP_INTERCEPTOR` để dùng dependency injection và thống nhất cấu hình app/test.
- [ ] Bổ sung nhánh bỏ qua envelope cho file/stream, SSE, redirect, HEAD, 204/205
      và response đã gửi hoặc được xử lý thủ công; kiểm chứng bằng HTTP test trước
      khi các endpoint tương ứng được sử dụng.
- [ ] Củng cố exception filter: giữ status của lỗi HTTP như JSON sai định dạng,
      giữ `errors` / `errorCode` hiện có, xử lý response đã gửi và trả thông báo chung
      cho lỗi 500 trở lên; lưu chi tiết nội bộ trong log, tránh ghi log trùng.
- [ ] Để `Serialize` dùng cùng một status cho `HttpCode`, envelope schema và
      OpenAPI; rà soát endpoint tạo mới/204 để giữ đúng contract hiện tại và bổ sung
      HTTP test kiểm tra status thực tế với tài liệu sinh ra.

### Ưu tiên 2 — Database và kiểm tra bất đồng bộ

- [ ] Trong PLAN-02, chuẩn bị database test và cấu hình database dùng chung;
      cấu hình SSL theo môi trường. Dev DB trống tiếp tục `synchronize`, chưa làm
      migration/baseline. CLI migration và lệnh cho bản build để nghiên cứu trước
      triển khai có dữ liệu cần bảo toàn.
- [ ] Bổ sung `oxlint-tsgolint`, bật lint có thông tin kiểu và
      `typescript/no-floating-promises`; rà soát lỗi hiện có, yêu cầu tác vụ bất đồng
      bộ được await/return hoặc có chủ đích chạy nền và xử lý lỗi rõ ràng.

### Ưu tiên 3 — Vận hành

- [ ] Bật shutdown hooks và kiểm chứng đóng kết nối/tài nguyên khi nhận tín hiệu
      dừng; bổ sung cleanup cho các tài nguyên do ứng dụng tự quản lý nếu có.
- [ ] Thêm concurrency cho CI, hủy lượt chạy cũ khi có push mới trên cùng ref.
- [ ] Đánh giá Observe khi tích hợp payment/shipping: nhu cầu trace, cấu hình,
      chi phí và bảo vệ dữ liệu nhạy cảm; chưa coi là điều kiện chặn feature.

Chưa đưa việc chuyển sang Better Auth hoặc Vitest vào phạm vi này. Giữ auth và bộ
test hiện tại; tham khảo các kịch bản kiểm thử HTTP của Marty khi bổ sung coverage.

## Nâng cấp module danh mục địa giới Việt Nam

**Trạng thái:** Cần nghiên cứu trước khi module được dùng lâu dài trong production.

Snapshot hiện tại giúp backend hoạt động độc lập với dịch vụ bên ngoài, nhưng file
`vietnam-administrative-divisions.ts` chứa gần 6.000 dòng dữ liệu sinh tự động. Cách
này làm source code và diff khó đọc, tăng kích thước bundle và dễ khiến dữ liệu bị
chỉnh sửa thủ công ngoài quy trình cập nhật.

### Hướng cần đánh giá

1. Tách snapshot khỏi TypeScript thành JSON có version, chỉ load và lập index một lần
   khi ứng dụng khởi động.
2. Đánh giá chuyển danh mục sang hai bảng `administrative_provinces` và
   `administrative_wards`, được cập nhật bằng script import hoặc seed có version.
3. Chỉ cân nhắc gọi nguồn bên ngoài ở runtime khi có SLA phù hợp; nếu áp dụng cần cache,
   timeout và snapshot dự phòng.
4. Xây dựng script đồng bộ để chuẩn hóa dữ liệu nguồn, tạo checksum và xuất báo cáo
   thay đổi trước khi cập nhật.

### Điều kiện hoàn thành

- Giữ nguyên contract của API tỉnh/thành và xã/phường hiện tại.
- Lưu được nguồn, ngày hiệu lực, phiên bản và checksum của dataset.
- Tự động kiểm tra số lượng, mã trùng, quan hệ tỉnh–xã và các bản ghi hiệu chỉnh.
- Không cần sửa thủ công hàng nghìn dòng dữ liệu khi danh mục hành chính thay đổi.
- Có hướng rollback về snapshot gần nhất nếu lần đồng bộ mới không hợp lệ.

Ưu tiên nghiên cứu phương án JSON có version trước vì thay đổi nhỏ và vẫn giữ được
đặc tính không phụ thuộc mạng ở runtime. Phương án database phù hợp hơn khi cần tìm
kiếm nâng cao, lịch sử phiên bản hoặc đồng bộ thường xuyên.

## Hoàn thiện quyền và vòng đời cửa hàng

**Trạng thái:** Chờ chốt nghiệp vụ sau phạm vi Shop MVP.

Module hiện hỗ trợ hồ sơ cửa hàng, chủ sở hữu và nhân viên ở hai trạng thái
`ACTIVE`/`INACTIVE`. Trước khi nối Shop với sản phẩm, đơn hàng và vận hành thực tế,
cần chốt thêm các quy tắc sau:

1. Luồng chuyển quyền sở hữu, chủ shop rời cửa hàng và cách xử lý khi tài khoản chủ
   shop bị khóa.
2. Ma trận quyền chi tiết của nhân viên đối với sản phẩm, tồn kho, đơn hàng và báo
   cáo; xác định có cần thêm vai trò ngoài `OWNER`/`STAFF` hay không.
3. Vòng đời vô hiệu hóa hoặc xóa cửa hàng và ảnh hưởng tới sản phẩm, đơn hàng đang
   xử lý, lịch sử giao dịch và dữ liệu cần lưu giữ.
4. Quy tắc quản lý địa chỉ cửa hàng, logo/banner, kiểm duyệt và trạng thái công khai.
5. Bổ sung migration chính thức cho `shops` và `shop_members` trước khi tắt
   `synchronize` ở môi trường production.

Các thay đổi sau phải giữ tương thích cho API hồ sơ Shop hiện tại hoặc có kế hoạch
version/migration rõ ràng.

## Hoàn thiện vòng đời sản phẩm

**Trạng thái:** Chờ chốt nghiệp vụ sau phạm vi Product MVP.

Module hiện hỗ trợ sản phẩm cá nhân hoặc sản phẩm thuộc cửa hàng, tạo bản nháp,
đăng bán, ẩn và đánh dấu đã bán. Trước khi nối với giỏ hàng và checkout, cần hoàn
thiện các phần sau:

1. Thiết kế cơ chế giữ hàng với trạng thái `HELD`, thời hạn hết giữ và xử lý đồng
   thời để một sản phẩm không được đặt bởi nhiều người.
2. Chốt quy trình kiểm duyệt, lý do từ chối và quyền xử lý khi sản phẩm vi phạm.
3. Chốt chính sách xóa và lưu giữ dữ liệu cho sản phẩm đã bán, bị ẩn hoặc gắn với
   đơn hàng có lịch sử giao dịch.
4. Bổ sung migration chính thức và rà soát index truy vấn trước khi tắt
   `synchronize` ở môi trường production.

Hiện tại client quản lý sản phẩm được chuyển sang `ACTIVE`, `HIDDEN` hoặc `SOLD`;
`HELD` chưa được đưa vào DTO chuyển trạng thái. Đây là phạm vi Product MVP hiện có.
PLAN-04 sẽ thay quyền mở bán bằng workflow kiểm duyệt và khóa các chỉnh sửa theo
vòng đời giao dịch. Khi nối Order, phải loại khả năng seller tự nhả hàng `HELD`
hoặc tự chuyển `SOLD` trái quy tắc đã chốt; không coi API MVP là contract cuối.

## Nâng cấp quản lý media

**Trạng thái:** Media MVP đã hỗ trợ ảnh sản phẩm và tải trực tiếp lên object storage
bằng presigned URL; các mục dưới đây thuộc giai đoạn tối ưu vận hành production.

Luồng hiện tại:

1. Client gửi MIME và kích thước để backend kiểm tra quyền, giới hạn và cấp URL
   `PUT` có thời hạn ngắn.
2. Client tải file trực tiếp lên dịch vụ S3-compatible với đúng header do backend
   trả về. Binary không đi qua API server.
3. Client gửi `storageKey`, MIME và kích thước để xác nhận. Backend dùng `HEAD`
   kiểm tra object thực tế trước khi lưu metadata, thứ tự và ảnh bìa trong database.

Các nâng cấp cần nghiên cứu tiếp:

1. Bổ sung job hoặc lifecycle rule để dọn object của ticket đã hết hạn nhưng client
   không gọi bước xác nhận.
2. Kiểm tra chữ ký thực của file thay vì chỉ dựa vào MIME header; chuẩn hóa ảnh,
   loại metadata nhạy cảm và tạo thumbnail theo kích thước hiển thị.
3. Dùng outbox hoặc hàng đợi để đồng bộ vòng đời bản ghi và object; bổ sung job đối
   soát, dọn file mồ côi và retry khi object storage tạm thời lỗi.
4. Chốt quota theo tài khoản/cửa hàng, chính sách lưu giữ và cơ chế kiểm duyệt nội
   dung trước khi mở upload cho quy mô lớn.
5. Bổ sung migration chính thức cho `media` và `media_links`, cùng index phục vụ các
   owner type mới nếu module được mở rộng ngoài sản phẩm.

Client phải hoàn tất đủ ba bước `upload-ticket` → `PUT` trực tiếp → xác nhận. Sau
khi xác nhận, client quản lý ảnh theo product và media ID; `storageKey` chỉ dùng
trong quá trình upload.

## Kết quả GHN Sandbox và việc còn lại

Theo [ghi chú GHN](ghn_integrate.md), người thực hiện đã thử bằng công cụ: master data, tạo/tra cứu vận đơn COD và webhook create/delivered. Chưa phải E2E backend; không đánh dấu toàn bộ PLAN-01 hoặc tích hợp GHN hoàn tất.

- [ ] Xác minh kho vendor dưới tài khoản sàn và tính cước checkout.
- [ ] Test cấu hình MVP COD = 0, sàn chịu cước; làm rõ PaymentType giữa create/detail/webhook.
- [ ] Test hủy, giao thất bại, hoàn/gửi trả và retry/sai thứ tự webhook.
- [ ] Xác minh nguồn webhook, đối soát bằng Detail và tích hợp backend.

## Rà soát phạm vi tích hợp và UI — 21/10/2026

Theo [phạm vi tích hợp và giao diện](INTEGRATION_SCOPE.md).

- [x] Sửa PAY-04/SHIPPING-02 trong decisions, plan và DB draft: không giới hạn một cổng/hãng; giữ GHN/MoMo là hướng thử ban đầu.
- [ ] Contract/capability theo provider, danh sách phương thức khả dụng; không cam kết tích hợp chỉ từ Figma.
- [x] Bỏ Views/Traffic và nhóm Accepting Orders/API connection trên header seller; chuẩn hóa chữ, rút gọn footer/nhãn và bỏ nền trang trí Figma. Đã kiểm tra ảnh mẫu sản phẩm, checkout, chat và quản trị; chưa kiểm thử toàn bộ prototype.
- [x] Đồng bộ tên chung trong 12 source diagram và thay 12 ảnh Báo cáo tương ứng; giữ ánh xạ 1:1 và chứng cứ thử GHN trong ghn_integrate.md.
