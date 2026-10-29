# Re.wear — Tổng quan dự án

Sàn mua bán thời trang secondhand. Tài liệu này là điểm vào cho developer/agent:
tìm nhóm tính năng, mở đúng khu vực Figma và tra cứu mã nguồn, diagram.
Đặc tả chi tiết và phần trình bày giao diện nằm trong
[Báo cáo](https://docs.google.com/document/d/1iSOPW66vllAYl5PjRUGdEqCqoB3ZvL_9gCXr2o7c9DQ/edit?tab=t.0).

## Mục lục dự án

| Nội dung                                  | Vị trí                                       |
| ----------------------------------------- | -------------------------------------------- |
| Cài đặt, chạy, kiểm thử và API contract   | [README dự án](../README.md)                 |
| Quy tắc làm việc và PR                    | [AGENT.md](../AGENT.md)                      |
| Product lifecycle và API mới              | [PRODUCT_LIFECYCLE.md](PRODUCT_LIFECYCLE.md) |
| Seed và factory cho dev/E2E               | [SEEDING.md](SEEDING.md)                     |
| Module nghiệp vụ                          | [src/modules](../src/modules)                |
| Thành phần dùng chung                     | [src/common](../src/common)                  |
| Tích hợp hạ tầng                          | [src/infrastructure](../src/infrastructure)  |
| Kiểm thử                                  | [test](../test)                              |
| Danh mục diagram, source và ảnh tương ứng | [diagrams/README.md](diagrams/README.md)     |
| Nhật ký hỗ trợ AI                         | [AI_USAGE_LOG.md](AI_USAGE_LOG.md)           |
| Quyết định, kế hoạch và ghi chú tham khảo | [archive](#tài-liệu-lưu-trữ)                 |

## Tính năng và giao diện

Link mở thẳng section trong Figma; mỗi nhóm tính năng được xếp trên một hàng riêng.
Đây là phạm vi thiết kế, **không phải danh sách tính năng đã triển khai**.

| Vai trò            | Nhóm tính năng                                                            | Figma                                                                                                     |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Chung              | Thành phần, màu sắc và kiểu chữ                                           | [UI foundations](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=41-2)         |
| Chung              | Đăng ký, đăng nhập và khôi phục tài khoản                                 | [Authentication](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=28-2)         |
| Chung              | Hướng dẫn mua hàng và chính sách                                          | [Buying help](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-419)          |
| Guest / Buyer      | Trang chủ, tìm kiếm, lọc và chi tiết sản phẩm                             | [Product discovery](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=28-3)      |
| Buyer              | Hồ sơ và địa chỉ nhận hàng                                                | [Profile & addresses](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-420)  |
| Buyer              | Giỏ hàng, kiểm tra khả dụng và checkout                                   | [Cart & checkout](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=28-4)        |
| Buyer              | Chọn phương thức và theo dõi kết quả thanh toán                           | [Payment](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=48-2524)             |
| Buyer              | Danh sách đơn, chi tiết và theo dõi giao hàng                             | [Orders & delivery](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=48-113)    |
| Buyer              | Yêu cầu trả hàng, bằng chứng và khiếu nại                                 | [Returns & disputes](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=56-341)   |
| Buyer / Seller     | Trao đổi qua tin nhắn                                                     | [Messages](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-421)             |
| Seller             | Tổng quan hoạt động bán hàng                                              | [Overview](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=28-5)               |
| Shop Owner         | Tạo shop, địa chỉ lấy hàng và đăng ký điểm lấy hàng với đơn vị vận chuyển | [Shop onboarding](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=63-2225)     |
| Seller             | Đăng bán, ảnh thực tế, tình trạng và quản lý sản phẩm                     | [Products & listings](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-422)  |
| Seller             | Xác nhận đơn, đóng gói, tạo vận đơn và theo dõi giao nhận                 | [Orders & shipping](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-423)    |
| Seller             | Phản hồi yêu cầu trả hàng và xử lý hàng hoàn                              | [Returns](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-424)              |
| Seller             | Số dư chờ quyết toán, khả dụng và yêu cầu rút tiền                        | [Funds & withdrawals](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-425)  |
| Shop Owner / Staff | Thông tin shop, địa chỉ lấy hàng và nhân viên theo quyền                  | [Shop settings & team](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-426) |
| Admin              | Duyệt và xử lý vi phạm sản phẩm                                           | [Product moderation](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=28-6)     |
| Admin              | Quản lý người dùng và shop                                                | [Users & shops](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-427)        |
| Admin              | Quản lý danh mục                                                          | [Categories](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-428)           |
| Admin              | Duyệt tranh chấp và quyết định hoàn tiền/phí                              | [Disputes](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-429)             |
| Admin              | Duyệt yêu cầu rút và ghi nhận chuyển tiền bên ngoài                       | [Withdrawals](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-430)          |
| Admin              | Cấu hình tham số nghiệp vụ và lịch sử thay đổi                            | [System settings](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=67-431)      |

Seller bao gồm người bán cá nhân và người bán thuộc shop; quyền Owner/Staff phải
được kiểm tra ở backend. Các mẫu cũ nằm ở
[Reference](https://www.figma.com/design/xjyTlIecBwx0SdTILgBkFL/Re.wear-design?node-id=51-3207),
không dùng để suy ra phạm vi tích hợp đã hoàn thành.

## Quy tắc chính

- Mỗi sản phẩm là một món riêng. Checkout kiểm tra lại khả dụng, loại món không
  còn mua được; các món hợp lệ giữ chung 10 phút, không gia hạn và không được sửa khi đang giữ.
- Một checkout thanh toán một lần, tách đơn theo nguồn bán và tính phí vận chuyển
  riêng cho từng nguồn bán. Seller tạo vận đơn từ đơn đã có.
- Nghiệp vụ dùng cổng thanh toán và đơn vị vận chuyển chung; phương thức trên UI
  chỉ được bật khi có adapter khả dụng. MVP thanh toán online sandbox.
- Sàn ghi nhận tiền thanh toán và quản lý số dư nội bộ. Tiền seller được mở sau
  72 giờ từ giao thành công nếu không có tranh chấp; xác nhận nhận hàng sớm không mở tiền sớm.
- Seller yêu cầu rút tiền; admin xử lý chuyển tiền bên ngoài và ghi nhận kết quả.
  Tham số cấu hình mới không thay đổi phí/deadline đã lưu trên giao dịch cũ.

## Hiện trạng và bước tiếp theo

Backend đã có các module tài khoản/xác thực, danh mục, địa giới Việt Nam, địa chỉ,
shop, sản phẩm và media. Mức hoàn thiện từng API cần đối chiếu mã nguồn và kiểm thử;
việc có module không đồng nghĩa toàn bộ luồng trong Figma đã hoạt động.

Ưu tiên tiếp theo: hoàn thiện contract tồn kho/trạng thái sản phẩm và snapshot,
rồi triển khai giỏ hàng → checkout/reservation/đơn hàng → thanh toán → vận chuyển
→ trả hàng/hoàn tiền/quyết toán. Quy tắc còn mở và backlog chi tiết giữ trong
[TODO](archive/TODO.md) và [kế hoạch](archive/IMPLEMENTATION_PLAN.md).

## Tài liệu lưu trữ

Các tài liệu dưới đây giữ nguyên lịch sử thiết kế và công việc chưa hoàn thành;
chuyển thư mục không có nghĩa đã hoàn tất hoặc hủy các TODO. Khi triển khai, kiểm
tra quyết định mới nhất và code; không coi bản đề xuất là hiện trạng database/API.

| Tài liệu                                              | Nội dung                                    |
| ----------------------------------------------------- | ------------------------------------------- |
| [Checkout decisions](archive/CHECKOUT_DECISIONS.md)   | Quyết định và câu hỏi nghiệp vụ còn mở      |
| [Database proposal](archive/database-proposal.md)     | Mô hình dữ liệu dự thảo                     |
| [Implementation plan](archive/IMPLEMENTATION_PLAN.md) | Thứ tự triển khai, phụ thuộc và kiểm chứng  |
| [Integration scope](archive/INTEGRATION_SCOPE.md)     | Phạm vi tích hợp và giao diện               |
| [TODO](archive/TODO.md)                               | Backlog, việc đã làm và giới hạn kiểm chứng |
| [GHN integration notes](archive/ghn_integrate.md)     | Chứng cứ thử nghiệm một adapter vận chuyển  |
