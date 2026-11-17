# PHẠM VI THỰC HIỆN CỦA ĐỀ TÀI (SCOPE OF WORK)

- **Đề tài:** Xây dựng Hệ thống Website bán quần áo đã qua sử dụng (Re.wear)
- **Sinh viên thực hiện:** Bùi Hải Dương (23110197) & Bùi Thành Tâm (23110310)
- **Giảng viên hướng dẫn:** ThS. Nguyễn Minh Đạo

---

### 1. Đối tượng Người dùng Phục vụ (4 Nhóm tác nhân)
1. **Khách vãng lai (Guest):** Xem trang chủ, tìm kiếm, lọc đồ theo giá/size/màu sắc/tình trạng, xem thông tin shop và chi tiết món đồ; bắt buộc đăng nhập khi thêm giỏ hàng hoặc đặt mua.
2. **Người mua (Buyer):** Quản lý sổ địa chỉ giao hàng, đặt mua đồ từ nhiều shop trong một lần thanh toán, thanh toán qua MoMo Sandbox hoặc COD, theo dõi hành trình đơn hàng GHN, xác nhận đã nhận hàng, gửi khiếu nại kèm video mở hộp (unbox), chat với người bán và đánh giá shop.
3. **Cửa hàng / Người bán (Shop Owner / Manager / Staff):** Đăng bán đồ secondhand (sử dụng Gemini AI gợi ý mô tả), cài đặt kích thước kiện hàng và địa chỉ kho lấy hàng riêng, xác nhận đơn hàng, in nhãn giao hàng GHN, quản lý doanh thu, tạo yêu cầu rút tiền về ngân hàng và phân quyền nhân viên phụ việc.
4. **Quản trị viên sàn (Admin):** Kiểm duyệt bài đăng sản phẩm mới và bài đăng sau khi chỉnh sửa; duyệt thông tin định danh người bán (KYC); tiếp nhận và phân xử các khiếu nại trả hàng giữa người mua và người bán; duyệt lệnh rút tiền ngân hàng.

---

### 2. Danh mục Phân hệ Kỹ thuật Cam kết Thực hiện (In-Scope — 10 Phân hệ)
- **FEAT-01 (Nền tảng hệ thống):** Backend NestJS Clean Architecture, PostgreSQL TypeORM, Zod Config Validation, Swagger OpenAPI, Rate Limiter và tạo dữ liệu mẫu (Seeding).
- **FEAT-02 (Tài khoản & Phân quyền Shop):** Đăng nhập JWT/NextAuth, Sổ địa chỉ 3 cấp hành chính; mô hình 1 Chủ shop duy nhất và phân quyền nhân viên (Manager, Staff).
- **FEAT-03 (Sản phẩm & Trợ lý Gemini AI):** Quản lý danh mục, bộ lọc tìm kiếm nhiều tiêu chí, Gemini AI tự động gợi ý mô tả, cơ chế tự động ẩn tin chờ duyệt lại khi người bán sửa nội dung.
- **FEAT-04 (Giỏ hàng & Giữ hàng 10 phút):** Giỏ hàng kiểm tra tính khả dụng của từng món đồ lẻ, cơ chế tạm giữ hàng 10 phút khi tiến hành thanh toán để chống lỗi mua trùng.
- **FEAT-05 (Đóng gói & Tính cước GHN):** Chuẩn hóa kích thước kiện hàng theo loại trang phục, kho lấy hàng riêng của từng shop, tự động tính cước vận chuyển riêng cho từng kiện qua GHN Sandbox API.
- **FEAT-06 (Thanh toán trực tuyến MoMo):** Tích hợp MoMo Sandbox (tạo mã QR/chuyển app, IPN Callback xử lý kết quả, tiến trình tự động đối soát giao dịch và hoàn tiền nếu quá hạn giữ hàng).
- **FEAT-07 (Giao hàng thu hộ COD):** Tạo đơn giao hàng COD qua GHN Sandbox, quy định thời hạn người bán xác nhận đơn trong 24h và cơ chế xử lý phí ship 2 chiều khi giao hàng không thành công.
- **FEAT-08 (Quản lý đơn hàng & Ký quỹ 72h):** Vòng đời đơn hàng qua 9 trạng thái rõ ràng, cơ chế tự động giữ tiền 72 giờ sau khi giao hàng thành công để bảo vệ người mua trước khi giải ngân vào ví người bán.
- **FEAT-09 (Xử lý khiếu nại & Trả hàng):** Cho phép người mua gửi yêu cầu khiếu nại kèm hình ảnh và video mở hộp, quy trình phân xử tranh chấp theo thời hạn cam kết (SLA), Admin đưa ra quyết định hoàn tiền hoặc từ chối.
- **FEAT-10 (Ví hoàn tiền & Tương tác):** Ví nội bộ chỉ nhận tiền hoàn từ đơn hủy/khiếu nại để mua đơn tiếp theo, tính năng tích lũy Xu thưởng sàn, chat trực tiếp Người mua – Cửa hàng, đánh giá shop và thông báo hệ thống.

---

### 3. Giới hạn Phạm vi (Out-of-Scope — Tránh dàn trải)
Để tập trung tối đa vào độ ổn định và chất lượng hoàn thiện của hệ thống, nhóm thống nhất không thực hiện:
- Không tích hợp thẻ thanh toán quốc tế (Visa/Mastercard); tập trung hoàn thiện MoMo Sandbox và GHN COD tại Việt Nam.
- Không xây dựng ví điện tử nạp/rút/chuyển tiền tự do; chỉ sử dụng Ví hoàn tiền nội bộ để bảo đảm tính pháp lý.
- Không phát triển tính năng đấu giá trực tiếp (Live Auction/Bidding).
- Không làm tính năng tự động nhận diện thương hiệu qua ảnh bằng Computer Vision phức tạp; tập trung vào Gemini AI xử lý văn bản mô tả.

---

### 4. Môi trường Triển khai
- **Ứng dụng Web Responsive:** Tương thích tốt trên cả máy tính (Desktop), máy tính bảng (Tablet) và điện thoại (Mobile) bằng Next.js + Tailwind CSS.
- **Môi trường chạy thử:** Triển khai Staging công khai trên Internet, kết nối Database đám mây, sẵn sàng tài khoản thử nghiệm cho Hội đồng chấm điểm.
