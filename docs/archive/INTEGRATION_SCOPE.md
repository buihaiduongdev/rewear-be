# Phạm vi tích hợp và giao diện

Cập nhật 21/10/2026. Quy tắc này điều chỉnh các mô tả giới hạn hệ thống vào GHN/MoMo trước đây. Đây là thiết kế đích, không xác nhận các tích hợp đã hoạt động.

## Thanh toán và vận chuyển

- Nghiệp vụ thanh toán, giữ hàng, đơn hàng, refund và quyết toán không phụ thuộc tên nhà cung cấp. Mỗi cổng có adapter và ánh xạ trạng thái riêng.
- Phân biệt phương thức thanh toán (ví, QR/ngân hàng, thẻ) với cổng xử lý. Checkout chỉ cho chọn phương thức thực sự khả dụng; danh sách MoMo, VNPAY, ZaloPay, thẻ trong Figma là phương án giao diện, chưa cam kết tích hợp đủ.
- Mỗi payment attempt lưu provider, method và tham chiếu ngoài; callback/query/refund phải xử lý qua đúng provider của giao dịch gốc. Không chuyển refund sang cổng khác.
- Shipping dùng contract báo cước, tạo/hủy/tra cứu vận đơn và sự kiện giao nhận chung. Lưu carrier, dịch vụ, tài khoản tích hợp và điểm lấy hàng đã chọn để theo dõi, hủy và đối soát đúng hãng.
- Không bắt buộc triển khai nhiều hãng cùng lúc hoặc tự động chuyển hãng khi lỗi. Danh sách nghiệm thu dựa trên adapter đã kiểm chứng; cách chọn hãng/dịch vụ ở checkout còn cần đặc tả.
- GHN và MoMo là hướng thử ban đầu. Giữ tên trong tài liệu API, cấu hình, bằng chứng thử nghiệm hoặc giao dịch thực sự sử dụng nhà cung cấp đó.
- Giữ quy tắc đã chốt: thanh toán online sandbox, chưa COD; sàn quản lý tài khoản vận chuyển và trả cước; phí ship không cộng vào số dư vendor; khoản chờ quyết toán 72 giờ do Rewear quản lý.

## Phần ngoài scope hiện tại

- Tracking lượt xem, cột Views và thống kê traffic sản phẩm.
- Bật/tắt nhận đơn của shop khi chưa có quy tắc nghiệp vụ và API tương ứng.
- Trạng thái kết nối API/sandbox trên header seller.
- Chứng nhận chính hãng, cơ sở dữ liệu nhãn thương hiệu, đo/bù phát thải CO₂ hoặc chứng nhận đối tác không có bằng chứng.

## Quy tắc trình bày Figma

- Dùng tiếng Anh; DM Sans làm font giao diện. Regular cho nội dung, SemiBold cho tiêu đề/giá/hành động; bỏ font monospace trang trí. Mã đơn có thể dùng monospace khi cần đọc/so sánh mã.
- Bốn mức chữ: tiêu đề trang 28, tiêu đề khối 18, nội dung/nút 14, nhãn phụ 12 px. Giữ hệ phân cấp giống nhau giữa các trang cùng nhóm.
- Nền trang trung tính, card trắng, viền nhẹ; không thêm nhiều lớp nền trong một card. Lime cho hành động chính/lựa chọn đang chọn; màu trạng thái chỉ dùng khi có ý nghĩa và luôn kèm chữ.
- Mỗi khối có một tiêu đề ngắn. Bỏ eyebrow, slogan, badge, chú thích lặp và nội dung kỹ thuật không giúp người dùng thao tác. Chỉ giữ giải thích cho phí, deadline, quyền hạn hoặc lỗi cần xử lý.
- Nhãn nghiệp vụ dùng Payment, Shipping, Tracking; tên provider chỉ xuất hiện ở lựa chọn hoặc giao dịch liên quan. Không gắn GHN/MoMo cố định lên header/footer toàn ứng dụng.
- Bảng sản phẩm tập trung vào sản phẩm, giá, tình trạng bán và thao tác; bỏ Views/Traffic. Header seller chỉ giữ điều hướng/tài khoản cần dùng.

## Đồng bộ còn lại

- [x] Sửa Figma: bỏ Traffic và trạng thái kết nối trên header seller, chuẩn hóa DM Sans/Regular-SemiBold, rút gọn nhãn và footer; kiểm tra ảnh mẫu buyer/seller/admin. Prototype và các trạng thái tương tác vẫn cần nghiệm thu riêng.
- [x] Đồng bộ chữ Báo cáo; đổi nhãn nhà cung cấp trong 12 diagram nghiệp vụ, render PNG/SVG và thay đúng 12 ảnh tương ứng trên Docs, giữ ánh xạ 1:1.
