# BẢN CAM KẾT SẢN PHẨM CUỐI CÙNG VÀ BỘ CHỈ SỐ ĐÁNH GIÁ (BƯỚC 3)

- **Tên đề tài chính thức:** **Xây dựng Hệ thống Website bán quần áo đã qua sử dụng** (Tên ứng dụng: **Re.wear**)
- **Bộ môn:** Công nghệ Phần mềm — Khoa Công nghệ Thông tin
- **Khóa đào tạo:** 2023 – 2027
- **Giảng viên hướng dẫn:** **ThS. Nguyễn Minh Đạo**
- **Nhóm sinh viên thực hiện:**
  1. **Bùi Hải Dương** — MSSV: `23110197` — Vai trò: Full-stack Developer (Trưởng nhóm) — Cam kết đóng góp: **50%**
  2. **Bùi Thành Tâm** — MSSV: `23110310` — Vai trò: Full-stack Developer (Thành viên) — Cam kết đóng góp: **50%**
- **Thời điểm chốt cam kết:** Mốc 50% thời gian thực hiện đồ án (Hạn nộp Bước 3: 23/11/2026).

---

## 1. BỐI CẢNH VÀ MỤC TIÊU ĐỀ TÀI

### 1.1. Bối cảnh thực tế

Thị trường quần áo đã qua sử dụng (Secondhand / Pre-loved Fashion) tại Việt Nam đang phát triển nhanh chóng nhưng giao dịch chủ yếu diễn ra phân tán qua mạng xã hội và các trang rao vặt tự do. Người dùng gặp nhiều rủi ro:
- Món đồ là sản phẩm đơn chiếc (Unique Item - mỗi món chỉ có 1 chiếc duy nhất, số lượng tồn kho = 1), dễ phát sinh tranh chấp mua trùng khi có nhiều người cùng thanh toán (Race Condition / Overselling).
- Tình trạng hàng hóa thực tế không khớp mô tả, thiếu sự minh bạch và không có cơ chế giữ tiền trung gian để bảo vệ người mua.
- Người bán nhỏ lẻ gặp khó khăn trong việc quản lý kho hàng, đóng gói theo chuẩn kích thước và tự động kết nối các hãng vận chuyển chuyên nghiệp.

### 1.2. Mục tiêu sản phẩm Re.wear
Xây dựng nền tảng thương mại điện tử chuyên biệt cho quần áo thời trang secondhand, giải quyết trọn vẹn chu trình mua bán từ đăng tin, đóng gói, tạm giữ hàng chống mua trùng, vận chuyển liên tỉnh đến thanh toán, ký quỹ bảo vệ người mua và xử lý khiếu nại.

---

## 2. PHẠM VI CAM KẾT HOÀN THÀNH (IN-SCOPE & OUT-OF-SCOPE)

### 2.1. Phạm vi thực hiện cam kết (In-Scope — 10 Phân hệ kỹ thuật)

Nhóm cam kết hoàn thành $100\%$ các phân hệ kỹ thuật cốt lõi và tích hợp hoạt động ổn định trên môi trường Staging/Production:

1. **Kiến trúc & Nền tảng hệ thống (FEAT-01)**:
   - Backend NestJS theo Clean Architecture, quản trị cấu hình chặt chẽ với Zod.
   - Cơ sở dữ liệu PostgreSQL TypeORM, cơ chế tự động Seed dữ liệu thử nghiệm, Rate Limiting chống DDoS/Spam và Swagger API Docs.
2. **Quản lý Tài khoản, Sổ địa chỉ & Phân quyền Shop RBAC (FEAT-02)**:
   - Đăng nhập bảo mật JWT, OAuth Google và NextAuth Session.
   - Sổ đa địa chỉ 3 cấp hành chính Việt Nam (Tỉnh/Thành phố, Quận/Huyện, Phường/Xã).
   - Mô hình Shop thống nhất cho người bán: 1 Chủ sở hữu duy nhất (Owner) và phân quyền RBAC thành viên (Manager, Staff).
3. **Quản lý Danh mục, Sản phẩm & Trợ lý AI (FEAT-03)**:
   - Danh mục thời trang phẳng 1 cấp, bộ lọc tìm kiếm đa tiêu chí (giá, size, màu, tình trạng).
   - Tích hợp Gemini AI hỗ trợ gợi ý mô tả sản phẩm tự động từ thông tin form.
   - Cơ chế kiểm duyệt tin đăng và tự động ẩn tin chờ duyệt lại khi người bán chỉnh sửa giá/mô tả.
4. **Giỏ hàng & Tạm giữ hàng 10 phút (FEAT-04)**:
   - Giỏ hàng kiểm tra tính khả dụng của từng món đồ đơn chiếc theo từng shop.
   - Cơ chế tạm giữ hàng trong 10 phút chống tranh chấp mua đồng thời (Race Condition), tự động giải phóng tồn kho khi hết hạn phiên.
5. **Đóng gói quy chuẩn & Báo giá vận chuyển GHN Preview (FEAT-05)**:
   - Quản lý quy chuẩn kích thước/khối lượng kiện hàng theo phân loại trang phục.
   - Thiết lập địa chỉ kho lấy hàng riêng cho từng shop người bán.
   - Báo giá cước vận chuyển tự động qua Giao Hàng Nhanh (GHN Sandbox) phân tách theo từng kiện của seller.
6. **Thanh toán trực tuyến MoMo Sandbox (FEAT-06)**:
   - Tích hợp cổng thanh toán MoMo Sandbox (Tạo thanh toán QR/App, IPN Callback, tra soát trạng thái chủ động).
   - Tiến trình worker tra soát định kỳ trước khi hết 10 phút giữ hàng; tự động hoàn tiền nếu giao dịch xác nhận sau thời gian giữ hàng.
7. **Giao hàng thu hộ COD & Đối soát GHN Sandbox (FEAT-07)**:
   - Tích hợp phương thức giao hàng thu hộ COD qua GHN Sandbox; cơ chế seller xác nhận đơn trong 24 giờ.
   - Xử lý trách nhiệm chịu phí ship 2 chiều khi giao hàng thất bại hoặc người mua đổi ý; hạn chế lạm dụng đặt đơn COD.
8. **Vòng đời đơn hàng 9 trạng thái & Ký quỹ Escrow 72h (FEAT-08)**:
   - Quản lý trạng thái đơn hàng theo State Machine 9 trạng thái đồng bộ (`order_state_machine.puml`).
   - Cơ chế ký quỹ (Escrow) giữ tiền an toàn 72 giờ từ khi đơn vị vận chuyển giao hàng thành công để bảo vệ quyền lợi người mua.
   - Tính năng người mua chủ động xác nhận nhận hàng sớm (Receipt Confirmed) và in nhãn vận đơn GHN trực tiếp.
9. **Khiếu nại, Trả hàng & Admin Phân xử (FEAT-09)**:
   - Tiếp nhận khiếu nại (Report an issue) kèm bằng chứng hình ảnh và video mở hộp (unbox).
   - Quy trình phân xử tranh chấp với SLA xử lý 3–5 ngày làm việc và quyền yêu cầu xét lại trong 2 ngày.
   - Phân hệ Admin Case quản lý hồ sơ, ra phán quyết hoàn tiền/từ chối/yêu cầu trả hàng; xác minh định danh người bán (KYC).
10. **Ví hoàn tiền, Rút tiền Vendor & Tương tác người dùng (FEAT-10)**:
    - Ví nội bộ chỉ nhận tiền hoàn (Refund-only Wallet), hỗ trợ thanh toán 100% cho đơn hàng kế tiếp.
    - Cơ chế Xu thưởng sàn 0.5%, trừ tối đa 10% giá trị giỏ hàng; thu hồi xu khi đơn bị hoàn/hủy.
    - Quy trình yêu cầu rút tiền của người bán và giao diện Admin kiểm duyệt ủy nhiệm chi ngân hàng.
    - Hệ thống tương tác: Chat 1–1 Buyer–Shop kèm thẻ sản phẩm/đơn hàng, đánh giá Shop 1–5 sao, Wishlist, Follow shop và Thông báo in-app/Email.

### 2.2. Phạm vi không thực hiện (Out-of-Scope — Tránh dàn trải)

Để tập trung tối đa vào độ ổn định, chất lượng mã nguồn và tính toàn vẹn của nghiệp vụ mua bán secondhand, nhóm thống nhất không thực hiện các hạng mục sau:

- Không triển khai cổng thanh toán thẻ quốc tế trực tiếp (Visa/Mastercard qua Stripe) ngoài lãnh thổ Việt Nam; tập trung hoàn thiện MoMo Sandbox và GHN COD.
- Không xây dựng ví điện tử đa năng cho phép nạp tiền/chuyển tiền tự do giữa các tài khoản; chỉ sử dụng Ví hoàn tiền (Refund-only Wallet) nhằm tuân thủ pháp lý tài chính.
- Không xây dựng cơ chế đấu giá trực tiếp theo thời gian thực (Live Auction / Bidding).
- Không phát triển mã giảm giá riêng của từng shop (Shop Voucher); tập trung vào hệ thống Xu thưởng mua hàng tích lũy toàn sàn.
- Không xây dựng hệ thống tự động nhận diện thương hiệu qua ảnh bằng Computer Vision phức tạp; tập trung sử dụng Gemini AI gợi ý văn bản mô tả để đảm bảo độ chính xác nghiệp vụ.

---

## 3. BỘ 5 CHỈ SỐ KPI NGHIỆP VỤ ĐỊNH LƯỢNG (QUANTITATIVE METRICS)

Theo yêu cầu Tiêu chuẩn Đánh giá TC1 (Mức 5) và TC2.2 của Rubric, nhóm sinh viên cam kết hoàn thành và kiểm chứng bộ 5 chỉ số định lượng sau đây từ Bước 3 cho đến khi bảo vệ trước Hội đồng:

| Mã KPI     | Tên chỉ số định lượng                                                                   | Mô tả chi tiết & Công thức đo lường                                                                                                    | Ngưỡng cam kết (Target)                                                                                                                                                                                                                                                                              | Phương pháp & Bằng chứng kiểm chứng                                                                                      |
| ---------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **KPI-01** | **Tính chính xác và Toàn vẹn Giữ hàng nguyên tử (Inventory Atomic Hold)**               | Đảm bảo tính nhất quán tuyệt đối về tồn kho hàng độc bản khi có nhiều người mua cùng thanh toán; giải phóng tồn kho đúng thời hạn TTL. | • Tỷ lệ giữ hàng thành công chống race condition: **$100\%$**.<br>• Thời gian giữ hàng chuẩn xác: **$10\text{ phút} \pm 5\text{s}$**.<br>• Tồn kho quá hạn được giải phóng tự động: $\le 5\text{s}$ sau khi hết TTL.                                                                                 | Bộ HTTP E2E `test/e2e/rewear-commerce-flow.spec.ts` (luồng seller được duyệt, buyer checkout) và kiểm thử tải đồng thời. |
| **KPI-02** | **Hiệu năng & Thời gian phản hồi hệ thống (API Response Time & Performance)**           | Tốc độ đáp ứng của các API nghiệp vụ trọng yếu (Catalog, Chi tiết món đồ, Giỏ hàng, Checkout, Tra cứu đơn) dưới tải truy cập.          | • Thời gian phản hồi trung bình API cốt lõi: **$\le 200\text{ms}$** (ở phân vị $P95$).<br>• First Contentful Paint (FCP) phía giao diện Frontend: **$\le 1.5\text{s}$**.<br>• Tỷ lệ Uptime hệ thống: **$\ge 99.5\%$**.                                                                               | Đo lường bằng Lighthouse Audit, k6 load testing report và NestJS logging interceptor.                                    |
| **KPI-03** | **Độ an toàn giao dịch, Ký quỹ Escrow & Hoàn tiền (Transaction & Escrow SLA)**          | Độ tin cậy trong luồng tiền: Khớp trạng thái thanh toán MoMo/COD, tự động hoàn tiền ví nội bộ và thời gian bảo vệ người mua.           | • Sai lệch trạng thái thanh toán MoMo/COD: **$0\%$**.<br>• Thời gian hoàn tiền tự động vào Ví hoàn tiền: **$\le 5\text{s}$**.<br>• Ký quỹ Escrow bảo vệ người mua chuẩn: **$72\text{ giờ}$** (đếm ngược chính xác $100\%$).                                                                          | Bộ E2E Integration Test vòng đời đơn hàng, log tra soát thanh toán MoMo Sandbox và Database Audit Log.                   |
| **KPI-04** | **Chất lượng mã nguồn, Kiểm thử tự động & An toàn thông tin (Code Quality & Security)** | Mức độ tuân thủ quy chuẩn lập trình, độ bao phủ kiểm thử và bảo mật mã nguồn không để lộ thông tin nhạy cảm.                           | • Độ bao phủ mã nguồn mô-đun cốt lõi (Code Coverage): **$\ge 70\%$**.<br>• Số lỗi linter trên 1000 dòng mã: **$0$**.<br>• Số issue Blocker/Critical từ phân tích tĩnh: **$0$**.<br>• Số secret/khóa API bị lộ (Gitleaks scan): **$0$**.<br>• Tỷ lệ test case tự động pass trên CI: **$100\%$**.      | Báo cáo Jest/Vitest Coverage Report, kết quả chạy ESLint/TypeScript check, báo cáo quét bảo mật Gitleaks.                |
| **KPI-05** | **Khả dụng và Trải nghiệm người dùng thực nghiệm (Usability & User Acceptance)**        | Mức độ dễ sử dụng và tính trực quan của nền tảng khi đưa vào thực nghiệm với người dùng thật thuộc nhóm đối tượng mục tiêu tại TP.HCM. | • Số người dùng thực tế tham gia nghiệm thu: **$\ge 10$ người**.<br>• Tỷ lệ hoàn thành trọn vẹn tác vụ (Task Completion Rate): **$\ge 90\%$**.<br>• Điểm đánh giá thang đo chuẩn hóa SUS (System Usability Scale): **$\ge 80/100$**.<br>• Số vòng cải tiến tính năng sau phản hồi: **$\ge 1$ vòng**. | Biên bản thực nghiệm người dùng, bảng câu hỏi SUS chuẩn hóa và tài liệu `UAT_USABILITY_REPORT.MD`.                       |

---

## 4. CAM KẾT MÔI TRƯỜNG TRIỂN KHAI VÀ HÌNH THỨC NGHIỆM THU

1. **Môi trường vận hành:**
   - Sản phẩm cam kết được triển khai trên môi trường **Staging công khai** (hoặc Production) có thể truy cập qua Internet, kết nối cơ sở dữ liệu đám mây và cấu hình đầy đủ biến môi trường.
   - Sẵn sàng cung cấp tài khoản mẫu (Buyer, Seller Shop Owner, Admin) để Hội đồng chấm và Giảng viên phản biện trực tiếp thao tác.
2. **Kịch bản Demo trực tiếp:**
   - Thực hiện demo trực tiếp toàn bộ chu trình nghiệp vụ (End-to-End Flow): Đăng nhập $\to$ Đăng sản phẩm với Gemini AI $\to$ Thêm giỏ hàng $\to$ Tạm giữ hàng 10 phút $\to$ Tính phí ship GHN $\to$ Thanh toán MoMo / COD $\to$ Giao hàng $\to$ Ký quỹ Escrow 72h $\to$ Xác nhận đơn hoặc mở khiếu nại trả hàng $\to$ Hoàn tiền ví nội bộ.
   - Cam kết **$0$ lỗi chặn (Zero Blocker/Crash)** trong quá trình bảo vệ.

---

## 5. CAM KẾT ĐÓNG GÓP VÀ TRÁCH NHIỆM THÀNH VIÊN

- Hai sinh viên cam kết chia đều khối lượng công việc và trách nhiệm với tỷ lệ **50% — 50%**.
- Sinh viên **Bùi Hải Dương** phụ trách: Kiến trúc hệ thống, Quản lý tài khoản & Sổ địa chỉ 3 cấp, Catalog & Gemini AI, Giỏ hàng & Tạm giữ hàng 10 phút, Quản lý đóng gói & GHN Sandbox Preview; Soạn thảo đặc tả SRS/SDD và Kế hoạch kiểm thử chất lượng.
- Sinh viên **Bùi Thành Tâm** phụ trách: Thanh toán MoMo Sandbox & Tra soát giao dịch, Giao hàng thu hộ COD & Đối soát GHN, Vòng đời đơn hàng 9 trạng thái & Ký quỹ Escrow 72h, Khiếu nại trả hàng & Admin Case phân xử, Ví hoàn tiền & Rút tiền Vendor; Thiết kế 28 biểu đồ PlantUML, Khảo sát người dùng và Thực nghiệm UAT.
- Mọi kết quả công việc đều được minh chứng bằng mã nguồn, kiểm thử tự động và commit lịch sử trên GitHub repository.

---

## 6. XÁC NHẬN VÀ KÝ DUYỆT BẢN CAM KẾT

_TP. Hồ Chí Minh, ngày ...... tháng 11 năm 2026_

|                 Sinh viên thực hiện 1                 |                 Sinh viên thực hiện 2                 |           Giảng viên hướng dẫn           |
| :---------------------------------------------------: | :---------------------------------------------------: | :--------------------------------------: |
|                _(Ký và ghi rõ họ tên)_                |                _(Ký và ghi rõ họ tên)_                |         _(Ký và ghi rõ họ tên)_          |
| <br><br><br><br>**Bùi Hải Dương**<br>MSSV: `23110197` | <br><br><br><br>**Bùi Thành Tâm**<br>MSSV: `23110310` | <br><br><br><br>**ThS. Nguyễn Minh Đạo** |
