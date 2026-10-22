# Quyết định nghiệp vụ giỏ hàng và checkout

Cập nhật: 21/10/2026. Ghi nhận các quyết định đã được người thực hiện xác nhận;
không phải bản chép nguyên văn hội thoại và không có nghĩa tính năng đã triển khai.

Tài liệu này là căn cứ cập nhật [implementation plan](IMPLEMENTATION_PLAN.md),
[TODO](TODO.md), [mô hình dữ liệu dự thảo](database-proposal.md) và đồng bộ báo cáo,
diagram sau khi hoàn tất nhóm quyết định liên quan.

## 1. Quyết định đã chốt

| ID          | Nội dung                     | Quy tắc                                                                                                                                                                               |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEV-01      | Database trong giai đoạn dev | Người thực hiện xác nhận DB trống. Chưa làm migration/baseline; tiếp tục dùng synchronize. Vẫn kiểm thử transaction và cạnh tranh trên PostgreSQL riêng.                              |
| CART-01     | Giỏ hàng                     | Thêm vào giỏ không giữ hàng. Mỗi listing là một món duy nhất, không quantity; không trùng món trong cùng giỏ. Nhiều buyer có thể lưu cùng món.                                        |
| ORDER-01    | Chia đơn                     | Một order có nhiều item cùng một cá nhân bán hoặc shop. Khác nguồn bán tạo order riêng.                                                                                               |
| PAY-01      | Thanh toán chung             | Các order trong một lượt checkout thuộc cùng nhóm thanh toán; buyer thanh toán một lần cho tổng các order. MVP dùng online sandbox theo PAY-02; các phương thức khả dụng theo PAY-04. |
| CHECKOUT-01 | Món không còn khả dụng       | Loại món đó khỏi lượt checkout và giỏ, tiếp tục với các món còn mua được; báo rõ món bị loại, tính lại phí/tổng trước khi buyer thanh toán. Không còn món thì không tạo thanh toán.   |
| HOLD-01     | Thời hạn giữ                 | Một thời hạn 10 phút chung cho tất cả món/order trong lượt checkout, tính từ khi giữ hàng thành công. Thêm vào giỏ không bắt đầu giữ hàng.                                            |
| HOLD-02     | Gửi lại yêu cầu              | Tải lại hoặc gửi lại cùng lượt checkout trả về kết quả và deadline cũ; không tạo thêm đơn, không gia hạn.                                                                             |
| HOLD-03     | Đổi danh sách món            | Hủy lượt checkout cũ, nhả reservation còn hợp lệ rồi tạo lượt mới; phải kiểm tra và giữ lại hàng, không bảo đảm món vẫn còn.                                                          |
| HOLD-04     | Hủy/hết hạn                  | Nhả đúng reservation chưa được xác nhận thanh toán; tác vụ cũ/chạy lại không được nhả món thuộc lượt mới hoặc món đã thanh toán.                                                      |
| PRODUCT-01  | Sửa món đang giữ             | Seller không được sửa giá, nội dung, ảnh hoặc tự đổi trạng thái bán của món HELD.                                                                                                     |
| PRICE-01    | Hiển thị giá                 | Không thêm hộp xác nhận riêng chỉ vì giá thay đổi trước lúc giữ. Checkout hiển thị rõ giá hiện tại và tổng tiền; BE snapshot giá khi giữ hàng, thanh toán dùng đúng snapshot.         |
| BUYER-01    | Tự mua                       | Chặn mua sản phẩm cá nhân của chính buyer và sản phẩm của shop mà buyer sở hữu. Quyền mua của staff chưa được mở rộng trong quyết định này.                                           |
| ADDRESS-01  | Địa chỉ nhận                 | Một địa chỉ chung cho tất cả order trong lượt checkout, snapshot vào từng order. Giao đến địa chỉ khác phải checkout riêng.                                                           |
| SHIPPING-01 | Phí giao hàng                | Tính riêng theo từng cá nhân bán/shop và cộng vào tổng thanh toán chung.                                                                                                              |

**PRODUCT-02 — Đối chiếu quy tắc sẵn có:** Báo cáo Quy tắc 1 đã ghi chuyển SOLD khi seller xác nhận giao hàng; không phải một quyết định mới từ đợt đồng bộ này. Theo Quy tắc 8, khóa tự bán lại món có lỗi được chấp thuận trả/hoàn; không áp dụng hàng loạt cho các món khác chỉ vì order có refund. Tạo mã vận đơn chưa được coi là đã giao hàng.

**PAY-02 — Phương thức MVP (đã chốt):** Chỉ thanh toán online qua sandbox; chưa triển khai COD. Giữ một lần thanh toán cho toàn bộ nhóm checkout. Provider được chọn tại PAY-04; khả năng tích hợp cụ thể còn cần xác minh.

**PAY-03 — Thu tiền ngay, giữ số dư nội bộ (đã chốt, thay thế quyết định demo hold trước đây):** Buyer thanh toán một lần; sau khi xác minh kết quả thành công, sàn ghi nhận đã thu và phân bổ tiền cho từng order. Không yêu cầu authorize/capture thủ công hoặc cổng thanh toán giữ tiền 72 giờ. Rewear quản lý khoản phải trả vendor ở trạng thái chờ quyết toán; điều kiện mở số dư theo SETTLEMENT-01. Việc cổng chuyển tiền về tài khoản ngân hàng merchant tuân theo đối soát của cổng, không mặc định webhook thành công là tiền đã về ngân hàng.

**PAY-04 — Phương thức và cổng thanh toán (cập nhật 21/10/2026):** Nghiệp vụ không giới hạn ở MoMo. Checkout hiển thị các phương thức được cấu hình và có tích hợp khả dụng; phân biệt phương thức (ví, QR/ngân hàng, thẻ) với cổng xử lý. MoMo Sandbox là hướng thử ban đầu, không là cam kết độc quyền. Danh sách provider/phương thức nghiệm thu còn cần xác minh. Quy tắc thu tiền, refund và quyết toán dùng chung; chi vendor thủ công theo WITHDRAW-02. Xem [phạm vi tích hợp](INTEGRATION_SCOPE.md).

**SELLER-01 — Thời hạn xác nhận (đã chốt):** Seller có 24 giờ để xác nhận đơn. Demo được cấu hình thời gian ngắn hơn và ghi rõ thời gian sử dụng. Mốc bắt đầu tính còn cần chốt; xử lý từ chối/quá hạn theo PAY-05.

**SHIPPING-02 — Tài khoản vận chuyển và cước (cập nhật 21/10/2026):** Sàn quản lý tài khoản tích hợp vận chuyển và điểm lấy hàng theo nguồn bán; không mở kết nối tài khoản riêng vendor/hybrid trong MVP. Nghiệp vụ hỗ trợ lựa chọn hãng theo cấu hình/tích hợp khả dụng, không giới hạn ở GHN. GHN là adapter thử nghiệm đầu tiên; cách tạo kho và quản lý tài khoản là chi tiết của từng hãng. Buyer trả tiền hàng và phí giao cho sàn; sàn ứng/trả cước cho đơn vị vận chuyển. Phí ship không cộng vào số dư vendor vì vendor không ứng cước; khoản quyết toán tiền hàng cho vendor trừ hoa hồng theo chính sách sẽ chốt. Hoa hồng do admin cấu hình theo SETTINGS-01, mức khởi tạo chưa chốt; vendor chủ động rút theo WITHDRAW-01.

### Giới hạn tích hợp GHN của đồ án

Hướng thử nghiệm GHN hiện dùng môi trường sandbox với một tài khoản chung
của sàn; không xác lập GHN là hãng duy nhất của hệ thống. Do đây là đồ án học tập, nhóm chưa thể ký hợp đồng vận chuyển riêng, nên
chưa kiểm chứng được giới hạn số cửa hàng/kho, tốc độ gọi API và chính sách đối
soát cước ở quy mô sàn thương mại thực tế. Khi triển khai thật, cần làm việc trực
tiếp với GHN về các điều khoản này.

Đây là giới hạn của phạm vi đã chọn, không phải xác nhận API đã chạy thành công.
Kết quả tạo kho, báo cước, tạo vận đơn và webhook sandbox được ghi riêng sau khi
thử nghiệm; không suy ra khả năng vận hành thực tế từ kết quả sandbox.

**PAY-05 — Ghi nhận thu tiền và xử lý từng order (đã chốt, cập nhật):** Thu toàn bộ khoản thanh toán chung của checkout, không đợi vendor xác nhận. Chỉ ghi nhận đã thu sau xác nhận thanh toán hợp lệ từ cổng. Phân bổ tiền hàng và phí ship theo từng order/vendor. Seller từ chối hoặc quá hạn thì hủy riêng order đó và refund phần tương ứng; các order khác tiếp tục. Tiền vendor chờ quyết toán, chưa được rút chỉ vì buyer đã thanh toán. Logic số dư, quyết toán, khiếu nại và rút tiền dùng chung; adapter mỗi cổng chỉ xử lý tạo thanh toán, xác minh kết quả, query và refund.

**SETTLEMENT-01 — Mở tiền và khiếu nại (đã chốt):** Khoản phải trả vendor chỉ được chuyển sang số dư có thể rút sau đủ 72 giờ kể từ sự kiện giao thành công đáng tin cậy, và không có tranh chấp đang mở. Buyer bấm “Đã nhận hàng / Hoàn tất” sớm chỉ đổi trạng thái đơn, không rút ngắn deadline, không mở tiền và không mất quyền khiếu nại trong cửa sổ 72 giờ. Tranh chấp khóa khoản tiền của order liên quan cho đến khi được xử lý; cách phân bổ sau phán quyết còn cần chốt.

Thời hạn 72 giờ là khóa quyết toán nội bộ Rewear sau khi đã thu tiền, độc lập với cơ chế giữ tiền hoặc lịch chuyển tiền ngân hàng của cổng. Giữ mốc 72 giờ trong đặc tả hiện tại; cấu hình demo phải tách biệt và ghi rõ nếu rút ngắn. Buyer hoàn tất sớm không mở tiền hoặc mất quyền khiếu nại.

**SETTINGS-01 — Tham số hệ thống (đã chốt):** Admin được cấu hình các tham số nghiệp vụ, thay vì cố định trong mã nguồn. Hoa hồng là tham số cấu hình; mức khởi tạo chưa chốt. Các mốc đang thống nhất là giữ hàng 10 phút, seller xác nhận 24 giờ và khiếu nại/chờ mở tiền 72 giờ sau giao; đây là giá trị mặc định ban đầu, không tự thay đổi trong lần bổ sung này.

Hướng triển khai: giới hạn quyền admin ở BE, kiểm tra kiểu/khoảng giá trị và ghi lịch sử thay đổi. Giao dịch lưu giá trị/phí/deadline đã áp dụng; sửa cấu hình không hồi tố đơn hoặc reservation đã tạo. Thời điểm áp dụng/snapshot từng tham số và giá trị khởi tạo hoa hồng cần đặc tả khi triển khai settings. Token/secret của các nhà cung cấp vẫn thuộc cấu hình tích hợp ở BE, không đưa vào danh sách tham số nghiệp vụ chỉ vì cho admin cấu hình.

**WITHDRAW-01 — Vendor chủ động rút tiền (đã chốt):** Sau khi đủ điều kiện mở số dư theo SETTLEMENT-01, tiền tích lũy trong số dư có thể rút. Vendor chủ động tạo yêu cầu rút, có thể gom từ nhiều đơn và chọn tài khoản nhận; không tự chuyển tiền theo từng đơn. Admin thực hiện chi tiền theo WITHDRAW-02; ngưỡng/phí rút và chính sách khấu trừ phát sinh còn cần chốt.

Hướng triển khai: kiểm tra quyền với nguồn số dư và tài khoản nhận, snapshot đích nhận trên yêu cầu; chuyển số tiền yêu cầu sang trạng thái chờ rút trong cùng transaction để không rút trùng. Ghi lịch sử/idempotency và đối soát kết quả chi; timeout không mặc nhiên là thất bại để cộng lại số dư. Rút tiền không tự mở rộng quyền khiếu nại ngoài 72 giờ hoặc cho phép tự động khấu trừ khiếu nại muộn/cước phát sinh; các nhánh này cần chính sách riêng.

**WITHDRAW-02 — Admin xử lý rút tiền MVP (đã chốt):** Admin kiểm tra yêu cầu và tài khoản nhận, thực hiện chuyển tiền bên ngoài rồi ghi nhận kết quả cùng mã giao dịch/chứng từ. Chưa tích hợp API chi tiền tự động trong MVP. Không đánh dấu đã chuyển chỉ vì yêu cầu được duyệt; tách chờ xử lý, đang xử lý và kết quả. Trường hợp chưa xác định đã chuyển hay chưa phải đối chiếu trước khi chuyển lại hoặc hoàn số dư. Demo chuyển tiền mô phỏng phải ghi rõ là mô phỏng.

**WITHDRAW-03 — Hủy yêu cầu rút (đã chốt):** Vendor chỉ được hủy yêu cầu của mình khi còn Chờ xử lý; hủy thành công trả tiền chờ rút về số dư có thể rút đúng một lần. Khi admin đã nhận xử lý, vendor không được hủy. Thao tác nhận xử lý và hủy phải tranh chấp trên cùng điều kiện trạng thái trong transaction; chỉ một thao tác được thành công. Các nhánh admin từ chối/không chuyển được tiền cần đặc tả riêng, không coi khóa vendor hủy là tự động mất tiền.

**RETURN-01 — Trả/hoàn theo món (đã chốt):** Đơn có nhiều món được khiếu nại, trả và hoàn tiền theo từng món được chấp thuận; các món còn lại giữ nguyên, không bắt buộc hủy/trả toàn bộ order. Ghi rõ danh sách order item và số tiền theo quyết định xử lý. Phí giao/trả theo RETURN-02/03; hoa hồng và thời điểm mở phần tiền không tranh chấp trong cùng order còn cần chốt; chưa tự chuyển sang mở tiền theo item.

**RETURN-02 — Vendor chịu cước hai chiều khi có lỗi (đã chốt):** Chỉ khi có hồ sơ khiếu nại và kết quả xác định lỗi thuộc vendor mới phong tỏa riêng khoản tiền để vendor chịu cước giao đi và gửi trả. Không dự phòng/khấu trừ cước hai chiều cho mọi đơn bình thường hoặc chỉ từ tố cáo chưa được xác minh. Khoản phong tỏa cước tách khỏi tiền hàng chờ quyết toán và khoản đang khóa theo tranh chấp; phong tỏa chưa phải ghi nhận đã thu phí.

Hướng triển khai: liên kết khoản giữ với hồ sơ, item/order liên quan và hai vận đơn; sàn trả đơn vị vận chuyển bằng tài khoản tích hợp rồi quyết toán khoản vendor chịu theo cước hợp lệ, xử lý chênh lệch/nhả phần dư và chống khấu trừ trùng. Không đồng thời giữ rồi trừ thêm lần nữa cùng khoản cước. Chưa chốt nguồn tiền khi vendor không đủ số dư; cước giao đi và yêu cầu hoàn ship khi trả một phần áp dụng RETURN-03; không suy ra các điểm này từ việc vendor chịu phí. Trong lúc khiếu nại chưa có kết luận, quy tắc khóa tiền order hiện có vẫn áp dụng, chưa tạo thêm khoản phạt cước.

**RETURN-03 — Phạm vi hoàn tiền khi vendor có lỗi (đã chốt, cập nhật):** Khiếu nại được chấp thuận và đủ điều kiện trả/hoàn: trả một phần chỉ hoàn tiền món được chấp thuận, không tự hoàn phí giao đi; các món khác giữ nguyên. Buyer có thể chọn yêu cầu hoàn phí vận chuyển và nêu lý do để admin xét duyệt theo bằng chứng/mức độ lỗi vendor; không đặt ngưỡng cứng “gần hết kiện” hoặc tự chia đều cước theo số món. Trả toàn bộ order do lỗi vendor thì hoàn toàn bộ tiền hàng và phí giao đi đã thu của order; order khác không bị ảnh hưởng. Không trừ cước vendor chịu vào tiền món được hoàn. Khi trả một phần, phần cước giao đi vendor phải bù tương ứng khoản hoàn ship được duyệt; không thu thêm cùng khoản cước buyer đã trả mà không hoàn lại, tránh thu trùng. Phí gửi trả do vendor chịu khi xác định vendor có lỗi, theo RETURN-02.

**RETURN-04 — Lỗi buyer không được trả/hoàn (đã chốt):** Khi xác minh lỗi thuộc buyer, bác yêu cầu trả/hoàn; đơn được xem là hoàn tất, không hoàn tiền hàng hoặc ship và không phong tỏa thêm cước hai chiều bắt vendor chịu. Đổi ý, không vừa khi số đo đã đúng mô tả, hoặc lỗi đã công khai không mặc nhiên là lỗi vendor. Thiếu video không tự kết luận buyer có lỗi. Trong lúc chưa xác minh, xử lý theo hồ sơ tranh chấp; sau bác bỏ vẫn chỉ mở tiền vendor khi đủ 72 giờ và các điều kiện quyết toán, không mở sớm do trạng thái Hoàn tất.

**RETURN-05 — Deadline phản hồi và trả hàng (đã chốt):** Mặc định seller phản hồi khiếu nại trong 24 giờ kể từ khi hồ sơ hợp lệ được gửi cho seller; quá hạn chuyển admin. Buyer có 3 ngày kể từ khi yêu cầu trả được chấp thuận để gửi trả. Vendor có 48 giờ kể từ sự kiện giao trả thành công đáng tin cậy từ đơn vị vận chuyển để xác nhận nhận đúng hàng; quá hạn chuyển admin, không tự refund chỉ vì vendor im lặng. Admin cấu hình các mốc; hồ sơ lưu timestamp/deadline và giá trị đã áp dụng, cấu hình mới không hồi tố. Mốc ghi nhận buyer đã gửi trả phải dựa vào bằng chứng/vận chuyển đáng tin cậy, không chỉ bấm tạo mã vận đơn. Hành vi buyer quá hạn không gửi hoặc carrier giao trả thất bại được đặc tả tiếp theo báo cáo và nhánh ngoại lệ.

## 2. Hướng triển khai cần kiểm chứng

- Dùng conditional update/CAS trên PostgreSQL để reserve món còn khả dụng;
  không cần mở đầu bằng SELECT FOR UPDATE. Chi tiết cột reservation/version và
  tên bảng được hoàn thiện trong PR code; đây chưa phải schema đã phát hành.
- Cập nhật giữ hàng, tạo checkout/order/snapshot và thay đổi giỏ trong transaction.
  Món không còn khả dụng là kết quả nghiệp vụ có thể bỏ qua; lỗi DB/hệ thống phải
  rollback transaction, không coi là lý do tự xóa món khỏi giỏ.
- Không giữ transaction mở trong 10 phút hoặc trong khi gọi cổng thanh toán/carrier.
  DB lưu chủ sở hữu reservation và deadline; Redis không phải nguồn duy nhất xác
  nhận giữ hàng. Chưa quyết định thêm Redis hay hàng đợi.
- Chặn sửa đồng thời với reserve, xử lý idempotency và nhả reservation đúng một lần;
  có kiểm thử PostgreSQL thực cho các trường hợp cạnh tranh.
- Thời hạn phiên thanh toán và xử lý callback đến muộn phải phù hợp deadline chung;
  chưa chốt chính sách bù trừ tiền khi sự kiện đến sau lúc nhả hàng.

## 3. Nội dung chưa chốt

- Danh sách phương thức/cổng thanh toán khả dụng và kết quả thử sandbox tương ứng; COD nằm ngoài phạm vi MVP hiện tại.
- Merchant, hoa hồng khởi tạo, ngưỡng/phí rút và các bước kiểm tra/chứng từ chi tiền thủ công; phân bổ refund/phí khi tranh chấp. Hủy do seller từ chối/quá hạn theo PAY-05. Chưa chốt chi phí ship đã phát sinh hoặc phí cổng không được hoàn.
- Lấy quote từ đơn vị vận chuyển khả dụng bằng tài khoản/điểm lấy hàng tương ứng; còn thời hạn quote, xử lý thay đổi địa chỉ/phí trong lượt checkout và chính sách chênh lệch cước. Hoàn ship khi vendor có lỗi theo RETURN-03; các lý do hủy/trả khác còn cần chốt; không suy ra từ việc không bù cước vendor.
- Mốc bắt đầu 24 giờ seller xác nhận; các mốc bàn giao và nhánh ngoại lệ trả/hoàn còn lại. SOLD theo Quy tắc 1 đã có: seller xác nhận giao hàng;
  không coi thời hạn 10 phút là thời hạn cho toàn bộ vòng đời đơn.
- Giới hạn nhiều lượt checkout hoạt động của cùng buyer, chống lạm dụng giữ hàng;
  không suy ra từ quy tắc gửi lại cùng một lượt.

## 4. Lịch sử điều chỉnh

- Mốc 15 phút thanh toán trong bản kế hoạch/báo cáo trước đây được thay bằng
  **10 phút chung mỗi lượt checkout** theo xác nhận ngày 21/10/2026.
- Đề xuất rollback toàn bộ khi một món hết khả dụng được thay bằng loại món lỗi
  khả dụng rồi tiếp tục với món hợp lệ. Lỗi hệ thống vẫn rollback.
- Chọn tài khoản GHN chung của sàn, loại phương án hybrid/tài khoản riêng vendor khỏi MVP; chưa chốt chính sách hoàn cước buyer hoặc chi phí tranh chấp.
- Bỏ migration/baseline khỏi phạm vi dev hiện tại theo xác nhận DB trống;
  không bỏ yêu cầu kiểm thử tính đúng đắn trên PostgreSQL.

## 5. Đồng bộ tài liệu

- [x] Ghi nhận quyết định vào file này; cập nhật plan, TODO và DB draft liên quan.
- [x] Đồng bộ một phần chữ tab Báo cáo Google Docs ngày 21/10/2026: 60 đoạn quy tắc/use case checkout/payment/shipping/trả-hoàn, mốc 10 phút/72 giờ, ví và rút thủ công; giữ bảng/ảnh và các tab khác.
- [x] Bổ sung mô tả UC-FIN-01..04 cho số dư, rút, admin chuyển ngoài và settings vào mục 3.8 Báo cáo.
- [ ] Hoàn thiện chính sách/quyền còn mở và bảng acceptance criteria chi tiết trước phần triển khai tương ứng.
- [x] Cập nhật một phần PlantUML: 8 diagram checkout/payment/order/shipping/dispute và thêm 3 diagram tiền/quyết toán/rút; xem [danh mục](../diagrams/README.md).
- [x] Thay 8 ảnh checkout/payment/order/shipping/dispute trong tab Báo cáo bằng bản bố cục gọn; kiểm tra PDF, caption và ngắt trang. Xem [ánh xạ ảnh](../diagrams/README.md#ánh-xạ-với-báo-cáo).
- [x] Đồng bộ domain/ERD/product state/6 use case; thay 8 ảnh, thêm 2 ERD và 3 finance trong Báo cáo. Phần thiết kế chưa chốt và thử nghiệm còn lại nằm trong danh mục diagram.
