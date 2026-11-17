# MỤC TIÊU CỦA ĐỀ TÀI

- **Tên đề tài:** Xây dựng Hệ thống Website bán quần áo đã qua sử dụng
- **Tên ứng dụng:** Re.wear (Responsive Web Application)
- **Sinh viên thực hiện:** Bùi Hải Dương (23110197) & Bùi Thành Tâm (23110310)
- **Giảng viên hướng dẫn:** ThS. Nguyễn Minh Đạo

---

### 1. Bối cảnh thực tế và Vấn đề kỹ thuật
Giao dịch quần áo thời trang đã qua sử dụng (Secondhand / Pre-loved Fashion) tại Việt Nam hiện chủ yếu diễn ra tự phát trên mạng xã hội hoặc các hội nhóm rao vặt, dẫn đến các rủi ro kỹ thuật và vận hành:
1. **Đặc thù hàng đơn chiếc (mỗi sản phẩm chỉ có duy nhất 1 chiếc, tồn kho = 1):** Khác với thời trang sản xuất hàng loạt có nhiều size và số lượng lớn, đồ secondhand chỉ có đúng 1 chiếc cho mỗi bài đăng. Khi có nhiều người cùng chọn mua một lúc, hệ thống rất dễ phát sinh lỗi mua trùng (Race condition / Overselling).
2. **Thiếu cơ chế bảo vệ giao dịch (Ký quỹ trung gian - Escrow):** Tình trạng món đồ thực tế (độ mới, lỗi rách, ố bẩn) dễ lệch so với hình ảnh mô tả; việc người mua chuyển khoản trước trực tiếp cho người bán tiềm ẩn nguy cơ bị lừa đảo khi không có bên thứ ba tạm giữ tiền.
3. **Vận chuyển và đóng gói phân tán:** Người bán cá nhân và các shop nhỏ gặp khó khăn trong việc chuẩn hóa kích thước gói hàng, tính phí ship liên tỉnh tự động và quản lý nhiều kho lấy hàng riêng biệt.

---

### 2. Mục tiêu Tổng quát
Xây dựng hệ thống website thương mại điện tử chuyên biệt (Responsive Web Platform) cho thời trang secondhand **Re.wear**, giải quyết trọn vẹn chu trình mua bán từ đăng tin, đóng gói chuẩn hóa, tạm giữ hàng chống mua trùng, tính cước vận chuyển tự động, đến thanh toán trực tuyến, ký quỹ bảo vệ người mua và quy trình giải quyết khiếu nại mở hộp.

---

### 3. Mục tiêu Kỹ thuật & Nghiệp vụ Cụ thể
1. **Xây dựng giải pháp Full-stack Web đồng bộ:** Ứng dụng Frontend trên nền tảng **Next.js (App Router)** tối ưu cho cả máy tính và điện thoại; hệ thống Backend RESTful API bằng **NestJS (Clean Architecture)** kết nối cơ sở dữ liệu **PostgreSQL**.
2. **Chống xung đột khi nhiều người cùng mua 1 món (Race Condition):** Xây dựng cơ chế tạm giữ hàng trong 10 phút (Inventory Hold với TTL) khi người mua bắt đầu thanh toán; tự động nhả lại món đồ cho người khác nếu hết thời gian mà chưa thanh toán xong.
3. **Tự động hóa vận chuyển đa cửa hàng:** Tích hợp **API Giao Hàng Nhanh (GHN Sandbox)** để tự động tính cước theo từng kiện của từng shop bán và sinh mã vận đơn để bưu tá đến tận nơi lấy hàng.
4. **Cơ chế Ký quỹ bảo vệ giao dịch (Escrow 72 giờ):** Tích hợp cổng thanh toán trực tuyến **MoMo Sandbox** và giao hàng thu hộ **COD**; hệ thống tạm giữ tiền bán trong 72 giờ tính từ lúc giao hàng thành công để người mua kiểm tra sản phẩm trước khi chuyển tiền về ví người bán.
5. **Hỗ trợ người bán tạo nội dung bằng AI:** Tích hợp **Google Gemini AI** giúp tự động gợi ý tiêu đề và mô tả chi tiết món đồ dựa trên thông tin người bán nhập vào; áp dụng quy trình kiểm duyệt lại tin đăng nếu người bán sửa đổi nội dung.
6. **Mô hình Shop và phân quyền nhân viên (Shop RBAC):** Cho phép một tài khoản đăng ký mở Shop (với 1 Chủ shop duy nhất - Owner) và phân quyền cho nhân viên (Manager, Staff) cùng quản lý hàng hóa, đơn hàng và phản hồi tin nhắn của khách.
