# Diagram nghiệp vụ Rewear

Cập nhật một phần ngày 21/10/2026 theo [quyết định checkout](../archive/CHECKOUT_DECISIONS.md).
Đây là thiết kế cho phần sẽ triển khai, không phải sơ đồ chứng minh tính năng hoặc
tích hợp sandbox đã hoạt động. Tên trạng thái là đề xuất, chưa phải enum API cuối.

## Phạm vi nhà cung cấp

Theo [phạm vi tích hợp](../archive/INTEGRATION_SCOPE.md), diagram nghiệp vụ dùng tên chung **Cổng thanh toán** và **Đơn vị vận chuyển**. Ngày 21/10/2026 đã sửa 12 source có nhãn nhà cung cấp, render lại PNG/SVG và thay đúng 12 ảnh tương ứng trong tab Báo cáo; giữ caption và ánh xạ source 1:1. Tên nhà cung cấp cụ thể chỉ nằm trong ghi chú tích hợp/thử nghiệm.

## Luồng tiền và quyết toán mới

| Diagram                                                         | Nội dung                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Luồng tiền](data-flow/funds-flow.puml)                         | Buyer thanh toán chung; thu tiền về merchant sàn; sàn trả đơn vị vận chuyển; tiền hàng tách hoa hồng và khoản phải trả vendor; refund theo order. |
| [Quyết toán vendor](state-machine/vendor-settlement-state.puml) | Chờ đủ 72 giờ sau giao, khóa theo tranh chấp, mở số dư và giữ tiền chờ rút.                                                                       |
| [Rút tiền](activity/vendor-withdrawal.activity.puml)            | Vendor yêu cầu, chỉ hủy khi chờ; admin chuyển tiền bên ngoài và lưu chứng từ; chưa rõ kết quả phải đối soát.                                      |

Nét đứt trong diagram luồng tiền biểu diễn ghi nhận/phân bổ nội bộ, không phải
chuyển tiền. Thu tiền, mở số dư và chuyển tiền vendor là ba bước riêng. Thời hạn
72 giờ là khóa nội bộ Rewear, không yêu cầu cổng giữ tiền 72 giờ.

## Diagram đã đồng bộ trong đợt này

- [Tạo checkout](sequences/place-order.sequence.puml) và
  [activity checkout](activity/order_checkout_payment_activity.puml): loại món hết
  khả dụng, CAS tại DB, nhóm order theo nguồn bán, một địa chỉ và deadline 10 phút
  chung; lỗi hệ thống rollback, không có COD trong MVP.
- [Thanh toán](sequences/online-payment.sequence.puml) và
  [state thu tiền](state-machine/payment_transaction_state_machine.puml): thu tiền ngay cho checkout, đối soát khi chưa rõ kết quả và refund theo order.
- [Xử lý và giao hàng](sequences/order-processing-and-shipping.sequence.puml),
  [activity seller](activity/seller_order_fulfillment_activity.puml) và
  [state order](state-machine/order_state_machine.puml): Tài khoản vận chuyển của sàn, kho theo
  nguồn bán; webhook đáng tin cậy, buyer hoàn tất sớm không mở tiền/mất quyền khiếu nại.
- [Tranh chấp/trả/hoàn](activity/dispute_return_refund_activity.puml): seller phản hồi
  trước, escalation khi cần, kiểm tra điều kiện trả trước refund; RETURN-01/02/03 bổ sung trả theo món; trả một phần chỉ hoàn tiền món, hoàn ship cần yêu cầu/admin duyệt; trả toàn bộ do lỗi vendor hoàn cả tiền hàng và ship. RETURN-04: lỗi buyer không được hoàn tiền, hoàn tất sớm vẫn chưa mở tiền vendor.

## Đồng bộ domain, ERD và báo cáo

Ngày 21/10/2026 đã cập nhật domain, product state và 6 use case bị ảnh hưởng
(tổng quan, checkout, hậu mãi, tin đăng, giao hàng/số dư và quản trị tài chính).
Đã thay 8 ảnh tương ứng, thêm 3 ảnh finance và 2 ảnh ERD vào tab Báo cáo.
Đã sửa số mục use case trùng và đổi cụm tuần tự sang 3.7; thêm 3.8 tài chính,
3.9 ERD. Ánh xạ đầy đủ tại [danh mục ánh xạ](#ánh-xạ-với-báo-cáo).

Source hình domain ở [domain-model](domain-model/domain_class_diagram.puml).
ERD đầy đủ ở [DB draft](../archive/database-proposal.md#3-quan-hệ-tổng-quát), hai góc nhìn
ở [data-model](data-model/README.md). Các diagram là thiết kế đích; không có nghĩa
code/entity đã triển khai đủ.

## Phần còn cần chốt hoặc kiểm chứng

- Theo Quy tắc 1 đã có trong Báo cáo, sản phẩm chuyển SOLD khi seller xác nhận
  giao hàng; không coi tạo mã vận đơn là đã giao. Hành vi bán ngoài sàn, thay tin đang public
  và khóa vi phạm còn cần đặc tả riêng trước khi triển khai.
- UC-FIN-01 đến UC-FIN-04 đã mô tả số dư/rút/settings trong Báo cáo; mức hoa hồng,
  ngưỡng/phí rút, quyền tiền shop/staff, nhánh từ chối/thất bại và xử lý thiếu số dư
  vẫn cần chốt. Không tự coi sơ đồ là quyết định về các điểm này.
- Mốc bắt đầu hạn seller, deadline bàn giao và điều chỉnh tiền/hoa hồng sau refund
  còn mở. Chính sách hoàn theo món, hoàn ship và deadline tranh chấp theo RETURN-01..05.
- Xác minh MoMo thu tiền ngay/query/refund, sự kiện trùng/muộn và đối soát;
  GHN sandbox chưa xác minh đầy đủ kho vendor, tính cước, hủy/trả và quy mô vận hành.
- Các use case guest, shop/staff và kiểm duyệt nội dung không được nâng thành
  contract code đã kiểm chứng trong đợt này; ma trận quyền chi tiết vẫn cần hoàn thiện.
- PLAN-01 vẫn mở vì còn quyết định và thử nghiệm đối tác, không còn ghi toàn bộ
  ảnh domain/finance là chưa chèn.

## Render

Dùng PlantUML và Graphviz; xuất PNG/SVG vào thư mục tạm hoặc thư mục đầu ra của
workspace, giữ `.puml` làm source trong repository. Render lại khi sửa source và xem
ảnh trước khi đưa vào báo cáo. Lần cập nhật này không thay dependency ứng dụng.

## Cấu trúc source

Source được phân thư mục theo loại:

- `activity/`: luồng hoạt động, gồm xử lý rút tiền.
- `sequences/`: tương tác theo thời gian, gồm đăng tin và thanh toán.
- `state-machine/`: trạng thái sản phẩm, đơn, thanh toán và quyết toán.
- `usecases/`: use case theo tác nhân/phân hệ.
- `domain-model/`: lớp miền nghiệp vụ.
- `data-model/`: các góc nhìn ERD.
- `data-flow/`: luồng tiền.

Mỗi hình trên Google Docs có một source tương ứng. Các source đã dùng xuất ảnh
được giữ làm bản chính trong thư mục theo loại, dùng tên `.puml` thông thường.
Đã bỏ hậu tố `.report` và thay các bản chi tiết cũ không còn dùng cho hình hiện tại;
không duy trì song song hai bản của cùng một hình.

Khi sửa diagram, chỉnh source tại ánh xạ dưới đây, render rồi cập nhật đúng ảnh trên
Docs. PNG/SVG/PDF xuất ngoài thư mục source. Đợt chuẩn hóa tên này giữ nguyên nội dung
19 source đã khôi phục và không thay ảnh trên Docs.

## Ánh xạ với Báo cáo

Bảng này liệt kê đủ 27 source PlantUML hiện được giữ trong thư mục.

| Vị trí    | Source ảnh đã chèn                                                         |
| --------- | -------------------------------------------------------------------------- |
| 3.2.1     | [Tổng quan](usecases/system.usecase.puml)                                  |
| 3.2.3     | [Buyer checkout](usecases/buyer-cart-checkout-usecase.puml)                |
| 3.2.4     | [Buyer hậu mãi](usecases/buyer_orders_aftersales.puml)                     |
| 3.2.5     | [Seller tin đăng](usecases/seller_listing_inventory_usecase.puml)          |
| 3.2.6     | [Seller giao hàng/số dư](usecases/seller_orders_shipping_usecase.puml)     |
| 3.2.9     | [Admin tài chính](usecases/admin_accounts_disputes_finance_usecase.puml)   |
| Hình 3.10 | [Checkout activity](activity/order_checkout_payment_activity.puml)         |
| Hình 3.11 | [Fulfillment activity](activity/seller_order_fulfillment_activity.puml)    |
| Hình 3.12 | [Dispute activity](activity/dispute_return_refund_activity.puml)           |
| Hình 3.13 | [Order state](state-machine/order_state_machine.puml)                      |
| Hình 3.14 | [Product state](state-machine/product_item_state_machine.puml)             |
| Hình 3.15 | [Payment state](state-machine/payment_transaction_state_machine.puml)      |
| Hình 3.16 | [Domain](domain-model/domain_class_diagram.puml)                           |
| Hình 3.17 | [Luồng tiền](data-flow/funds-flow.puml)                                    |
| Hình 3.18 | [Quyết toán](state-machine/vendor-settlement-state.puml)                   |
| Hình 3.19 | [Rút tiền](activity/vendor-withdrawal.activity.puml)                       |
| Hình 3.20 | [Checkout ERD](data-model/checkout-erd.puml)                               |
| Hình 3.21 | [Finance ERD](data-model/finance-erd.puml)                                 |
| 3.7.2     | [Đăng tin](sequences/create-product.sequence.puml)                         |
| 3.7.3     | [Đặt hàng](sequences/place-order.sequence.puml)                            |
| 3.7.4     | [Thanh toán](sequences/online-payment.sequence.puml)                       |
| 3.7.5     | [Giao hàng](sequences/order-processing-and-shipping.sequence.puml)         |
| 3.2.2     | [Guest](usecases/guest.usecase.puml)                                       |
| 3.2.7     | [Shop owner](usecases/shop_owner_management_staff_usecase.puml)            |
| 3.2.8     | [Kiểm duyệt nội dung](usecases/admin_content_moderation_usecase.puml)      |
| 3.7.1     | [Đăng nhập](sequences/login.sequence.puml)                                 |
| 3.7.6     | [Nhân viên shop](sequences/staff-invitation-and-permissions.sequence.puml) |

Sequence đăng tin phân biệt DRAFT/presign/confirm hiện có với submit/review/revision
và khóa HELD đầy đủ chưa triển khai.
