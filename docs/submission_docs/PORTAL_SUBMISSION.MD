# NỘI DUNG NỘP CỔNG QUẢN LÝ ĐỀ TÀI (PROJECTS-FIT.HCMUTE.EDU.VN)

Tài liệu này trích xuất sẵn nội dung chuẩn hóa phục vụ việc sao chép và dán trực tiếp vào các ô nhập liệu trên hệ thống Quản lý Đề tài của Khoa CNTT — HCMUTE ([Mã đề tài: 358](https://projects-fit.hcmute.edu.vn/?view=student-mytopic&topic=358)).

---

## 1. NỘI DUNG NỘP Ô: "MỤC TIÊU CỦA ĐỀ TÀI"
- **Hạn nộp:** 16:44 ngày 20/11/2026
- **Trạng thái:** Cần GVHD xác nhận
- **Tiêu chuẩn Rubric:** Tính thực tiễn của đề tài và sự hiểu biết về vấn đề nghiên cứu (TC1)

```markdown
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
```

---

## 2. NỘI DUNG NỘP Ô: "PHẠM VI THỰC HIỆN CỦA ĐỀ TÀI"
- **Hạn nộp:** 16:46 ngày 27/11/2026
- **Trạng thái:** Cần GVHD xác nhận
- **Tiêu chuẩn Rubric:** Phân tích nghiệp vụ, đặc tả yêu cầu và thiết kế – giải pháp (TC2.1)

```markdown
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
```
