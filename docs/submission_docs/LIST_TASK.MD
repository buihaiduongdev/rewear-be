# BẢNG PHÂN CÔNG CÔNG VIỆC VÀ DANH MỤC TÁC VỤ (LIST OF TASKS)

- **Tên đề tài chính thức:** **Xây dựng Hệ thống Website bán quần áo đã qua sử dụng** (Tên ứng dụng: **Re.wear**)
- **Giảng viên hướng dẫn:** **ThS. Nguyễn Minh Đạo**
- **Đơn vị:** Khoa Công nghệ Thông tin – Bộ môn Công nghệ Phần mềm
- **Khóa học:** 2023 – 2027
- **Thời gian thực hiện:** 15/07/2026 – 30/12/2026 (Kế hoạch 15 tuần: 14/09/2026 – 27/12/2026)
- **Sinh viên thực hiện:**
  1. **Bùi Hải Dương** — MSSV: `23110197` — Vai trò: Full-stack Developer (Trưởng nhóm)
  2. **Bùi Thành Tâm** — MSSV: `23110310` — Vai trò: Full-stack Developer (Thành viên)
- **Tỷ lệ cam kết đóng góp tổng thể:** **50% (Hải Dương) — 50% (Thành Tâm)**

---

## BẢNG 1: PHÂN CÔNG CÁC MÔ-ĐUN CODE & KỸ THUẬT (CODE MODULES)

Phạm vi công việc kỹ thuật được phân rã trực tiếp từ Bản đặc tả yêu cầu phần mềm (SRS) và Thiết kế kiến trúc hệ thống (SDD), bảo đảm bao phủ toàn bộ các ca sử dụng (Use Cases) của 4 nhóm tác nhân và các quy tắc nghiệp vụ cốt lõi.

| Mã | Tên Mô-đun Kỹ thuật | Phạm vi tính năng & Nghiệp vụ chi tiết | Ca sử dụng (Use Cases) | Người chính | Người hỗ trợ | Tỷ trọng | Trạng thái | Minh chứng Git / PR |
|---|---|---|---|---|---|---|---|---|
| **FEAT-01** | **Kiến trúc & Nền tảng hệ thống** | Setup NestJS Clean Architecture, Zod Config, PostgreSQL TypeORM, Swagger, Rate Limiter, Seeding, Base UI Foundations. | System Core | **Dương** | Tâm | 10% | Đã xong | BE PR #17, #18; `DatabaseModule` |
| **FEAT-02** | **Tài khoản, Sổ địa chỉ & Shop RBAC** | JWT Auth, Session Next.js, Sổ địa chỉ 3 cấp (Tỉnh/Huyện/Xã), Onboarding tạo shop, Phân quyền Shop RBAC (Owner, Manager, Staff). | UC-04, UC-05, CSH01, CSH02 | **Dương** | Tâm | 10% | Đã xong | BE PR #17; FE PR #1, #2, #3; PR #26 |
| **FEAT-03** | **Sản phẩm, Danh mục & Gemini AI** | Trang chủ Marketplace, Catalog, Danh mục phẳng 1 cấp, Bộ lọc đa tiêu chí, Gemini AI gợi ý mô tả từ text, Ẩn tin duyệt lại khi sửa. | UC-01, UC-02, UC-03, UC-16, UC-24 | **Dương** | Tâm | 10% | Đã xong | `feat/ai-storage-infras`, FE PR #4, PR #26 |
| **FEAT-04** | **Giỏ hàng & Giữ hàng 10 phút** | Giỏ hàng kiểm tra tính khả dụng món đồ đơn chiếc, Checkout đa shop, Tạm giữ hàng 10 phút chống race condition, Snapshot địa chỉ. | UC-08, UC-09 | **Dương** | Tâm | 10% | Đã xong | BE PR #19, #20; FE PR #5, #6, #7 |
| **FEAT-05** | **Đóng gói & Vận chuyển GHN Preview** | Quản lý quy chuẩn kiện hàng theo loại trang phục, Kho lấy hàng riêng của Shop, Báo giá cước GHN Sandbox theo từng kiện seller. | UC-09, UC-19 | **Dương** | Tâm | 10% | Đã xong | BE PR #21, #22, #23; FE PR #9, #10, #11 |
| **FEAT-06** | **Thanh toán MoMo Sandbox** | Tích hợp MoMo (Create Payment, Callback IPN, Tra soát Query định kỳ trước khi hết 10p giữ hàng), Hoàn tiền online nếu quá hạn. | UC-10 | **Tâm** | Dương | 10% | Đang hoàn thiện | PR #25; `PaymentModule` |
| **FEAT-07** | **Giao hàng thu hộ COD & Vận đơn GHN** | Vận đơn GHN COD Sandbox, Seller xác nhận 24h, Xử lý hủy đơn và phí ship 2 chiều, Đối soát tiền COD sàn và nhà vận chuyển. | UC-10, UC-19 | **Tâm** | Dương | 10% | Đang hoàn thiện | PR #25; `ShippingModule` |
| **FEAT-08** | **Đơn hàng 9 trạng thái & Escrow 72h** | Quản lý vòng đời đơn 9 trạng thái, Cơ chế ký quỹ bảo vệ 72h sau khi giao hàng thành công, Xác nhận đã nhận hàng (Receipt confirmed). | UC-11, UC-19 | **Tâm** | Dương | 10% | Đang hoàn thiện | PR #25; `OrderModule` |
| **FEAT-09** | **Khiếu nại, Trả hàng & Admin Phân xử** | Buyer yêu cầu trả hàng, Tải bằng chứng ảnh/video unbox, SLA xử lý tranh chấp 3–5 ngày, Yêu cầu xét lại 2 ngày, Admin phân xử. | UC-12, UC-26 | **Tâm** | Dương | 10% | Đang hoàn thiện | PR #25; `DisputeModule` |
| **FEAT-10** | **Ví hoàn tiền, Rút tiền & Tương tác** | Ví hoàn tiền (Refund-only), Xu thưởng 0.5%, Yêu cầu rút tiền Seller & Admin duyệt UNC ngân hàng, Chat Buyer-Shop, Đánh giá shop, Notif, Report. | UC-13, UC-20, UC-FIN-03, QTV01 | **Tâm** | Dương | 10% | Đang hoàn thiện | PR #25, #26; `WalletModule` |

**Tổng tỷ trọng Code Modules:** **Dương: 50% — Tâm: 50%**

---

## BẢNG 2: PHÂN CÔNG THIẾT KẾ, QUY TRÌNH & HỒ SƠ MINH CHỨNG (DOCS & PROCESS)

| Mã | Hạng mục Thiết kế / Quy trình / Minh chứng | Mô tả sản phẩm đầu ra | Người chính | Người hỗ trợ | Tỷ trọng | Trạng thái | Nguồn đối chiếu / Nộp |
|---|---|---|---|---|---|---|---|
| **DOC-01** | **Thiết kế Giao diện UI/UX & Prototype** | Xây dựng bộ Design System, Responsive Web (Desktop/Mobile), các trạng thái tương tác và Prototype hoàn chỉnh. | **Dương** | Tâm | 20% | Đã hoàn thành | Bản thiết kế `Re.wear-design` |
| **DOC-02** | **Hệ thống Biểu đồ Thiết kế UML** | Bộ 28 biểu đồ PlantUML: 10 usecases, 6 sequences, 4 activities, 4 state machines, domain class diagrams. | **Tâm** | Dương | 20% | Đã hoàn thành | BE PR #6 (`docs/diagrams/`) |
| **DOC-03** | **Khảo sát người dùng & Phân tích thị trường** | Thiết kế form khảo sát, thu thập $\ge 30$ mẫu TP.HCM, phân tích số liệu, lập 2 User Persona và bảng so sánh 3 đối thủ. | **Tâm** | Dương | 15% | Đang thực hiện | `SURVEY_EVIDENCE.MD` |
| **DOC-04** | **Đặc tả yêu cầu & Kiến trúc hệ thống (SRS/SDD)** | Soạn thảo tài liệu đặc tả SRS/SDD chuẩn IEEE, Từ điển dữ liệu, 5 yêu cầu phi chức năng định lượng, ma trận truy vết. | **Dương** | Tâm | 15% | Đang hoàn thiện | `SRS_SDD.MD` |
| **DOC-05** | **Kế hoạch kiểm thử & Đảm bảo chất lượng** | Bảng kế hoạch test 4 tầng ánh xạ Acceptance Criteria, Unit/Integration test cases, Báo cáo Linter 0 lỗi, Gitleaks 0 leak. | **Dương** | Tâm | 15% | Đang hoàn thiện | `TEST_PLAN_AND_CASES.MD`, `quality_reports/` |
| **DOC-06** | **Thực nghiệm UAT, Kiểm soát AI & Báo cáo Luận văn** | Thực nghiệm $\ge 10$ người dùng (SUS $\ge 80$), kê khai minh bạch AI Log, Báo cáo trùng lặp $\le 20\%$, Slide và Video demo. | **Tâm** | Dương | 15% | Chuẩn bị nộp | `UAT_USABILITY_REPORT.MD`, `AI_LOG.MD`, `REPORT.PDF` |

**Tổng tỷ trọng Docs & Process Modules:** **Dương: 50% — Tâm: 50%**

---

## CHI TIẾT CÔNG VIỆC PHÂN RÃ THEO TỪNG THÀNH VIÊN

### A. BÙI HẢI DƯƠNG (MSSV: 23110197) — Đóng góp: 50%

1. **Kiến trúc & Nền tảng hệ thống (FEAT-01)**:
   - Khởi tạo kiến trúc NestJS modular, thiết lập quy chuẩn ESLint, Prettier và Git hooks.
   - Xây dựng `ConfigModule` xác thực biến môi trường an toàn bằng Zod schema.
   - Thiết kế `DatabaseModule`, cấu hình TypeORM kết nối PostgreSQL với cơ chế connection pooling và chạy migration tự động.
   - Cấu hình Swagger/OpenAPI tự động sinh tài liệu API contract và tích hợp Orval codegen phía Frontend.
   - Viết cơ chế Seeding dữ liệu mẫu độc lập và các factory dữ liệu phục vụ Unit/Integration Test.

2. **Xác thực, Sổ địa chỉ & Shop RBAC (FEAT-02)**:
   - Xây dựng hệ thống xác thực người dùng bằng JWT (Access Token & Refresh Token an toàn, HTTP-only cookie).
   - Thiết lập luồng quản lý phiên đăng nhập (Session) trên Next.js App Router và bảo vệ Server Components.
   - Thiết kế mô hình Sổ địa chỉ nhận hàng (Address Book) hỗ trợ 3 cấp hành chính Việt Nam và địa chỉ Mặc định tự chọn khi checkout.
   - Xây dựng quy trình Onboarding tạo Shop: bắt buộc khai báo tên shop, logo, địa chỉ kho lấy hàng và tài khoản ngân hàng chính chủ.
   - Xây dựng kiến trúc phân quyền Shop RBAC: 1 Owner duy nhất per shop, vai trò dựng sẵn Manager/Staff và cơ chế hợp quyền `Set(permissions)`.

3. **Sản phẩm, Danh mục & Tích hợp Gemini AI (FEAT-03)**:
   - Xây dựng giao diện và API duyệt/tìm kiếm sản phẩm trang chủ Marketplace và trang chi tiết sản phẩm.
   - Chuẩn hóa mô hình Danh mục phẳng 1 cấp (Flat categories) tối ưu cho ngành hàng thời trang secondhand.
   - Xây dựng Bộ lọc tìm kiếm đa tiêu chí: Danh mục, Khoảng giá, Độ mới, Size, Khu vực Shop và Thứ tự sắp xếp.
   - Tích hợp Google Gemini AI (`GeminiService`) hỗ trợ người bán tự động gợi ý mô tả sản phẩm hấp dẫn từ các trường text form đã nhập.
   - Cơ chế kiểm duyệt tin đăng: tự động ẩn tin chuyển trạng thái chờ Admin duyệt lại khi người bán cập nhật nội dung hoặc giá cả.

4. **Giỏ hàng & Tạm giữ hàng 10 phút (FEAT-04)**:
   - Xây dựng Giỏ hàng (Cart) kiểm tra tính hợp lệ và tự động loại bỏ món hàng không còn khả dụng khi có người khác mua.
   - Thiết kế cơ chế Checkout đa người bán: gom nhiều shop vào một phiên thanh toán duy nhất với chung một địa chỉ nhận hàng.
   - Cơ chế Tạm giữ hàng 10 phút (Idempotent 10-minute hold reservation) giải quyết triệt để race condition mua trùng món đồ đơn chiếc (tồn kho = 1).
   - Lưu trữ snapshot địa chỉ giao hàng và thông tin sản phẩm bất biến tại thời điểm đặt đơn.

5. **Đóng gói & Báo giá vận chuyển GHN Preview (FEAT-05)**:
   - Quản lý quy chuẩn kích thước/khối lượng kiện hàng (Shipping Package) theo từng nhóm trang phục.
   - Quản lý địa chỉ kho lấy hàng riêng (Pickup Point) theo từng Shop để truyền vào hãng vận chuyển.
   - Tích hợp GHN Sandbox API tính cước vận chuyển tự động theo từng kiện seller trong phiên checkout.
   - Xây dựng giao diện bảng cước vận chuyển chi tiết theo từng shop và đồng hồ đếm ngược TTL giữ hàng trên Frontend.

6. **Thiết kế UI/UX & Tài liệu Kỹ thuật (DOC-01, DOC-04, DOC-05)**:
   - Phụ trách xây dựng hệ thống thiết kế giao diện UI/UX (Design System, Responsive Desktop/Mobile và Prototype tương tác người dùng).
   - Phụ trách soạn thảo tài liệu đặc tả yêu cầu phần mềm SRS/SDD, Từ điển dữ liệu và 5 yêu cầu phi chức năng NFR định lượng.
   - Thiết lập cấu trúc kế hoạch kiểm thử `TEST_PLAN_AND_CASES.MD`, cấu hình công cụ quét mã tĩnh, linter và quét lỗ hổng bảo mật.

---

### B. BÙI THÀNH TÂM (MSSV: 23110310) — Đóng góp: 50%

1. **Thanh toán trực tuyến MoMo Sandbox (FEAT-06)**:
   - Nghiên cứu và xây dựng adapter tích hợp MoMo Sandbox (Create Payment, Callback IPN, Query Status).
   - Xây dựng tiến trình worker tra soát giao dịch tự động trước khi hết 10 phút giữ hàng để xác nhận trạng thái tiền về sàn.
   - Xây dựng luồng hoàn tiền trực tiếp qua cổng thanh toán khi giao dịch đến muộn sau khi hệ thống đã nhả hàng giữ.
   - Xử lý kiểm tra chữ ký số HMAC-SHA256, bảo đảm tính bất biến của dòng tiền và xử lý an toàn lỗi timeout cổng thanh toán.

2. **Giao hàng thu hộ COD & Đối soát GHN Sandbox (FEAT-07)**:
   - Mở rộng quy trình thanh toán COD qua hãng vận chuyển Giao Hàng Nhanh (GHN Sandbox).
   - Cơ chế khóa hàng COD, seller xác nhận trong 24 giờ và xử lý hủy đơn an toàn trước khi bàn giao cho bưu tá.
   - Xử lý trách nhiệm chịu phí vận chuyển 2 chiều khi giao hàng thất bại hoặc người mua đổi ý; cơ chế giới hạn tần suất spam COD.
   - Thiết kế mô hình đối soát thu hộ COD giữa sàn và đối tác vận chuyển.

3. **Vòng đời đơn hàng 9 trạng thái & Ký quỹ Escrow 72h (FEAT-08)**:
   - Lập trình State Machine quản lý 9 trạng thái đơn hàng đồng bộ theo `order_state_machine.puml`.
   - Xây dựng cơ chế ký quỹ (Escrow) giữ tiền 72 giờ từ khi đơn vị vận chuyển giao hàng thành công để bảo vệ người mua.
   - Xây dựng tính năng xác nhận đã nhận hàng sớm (Receipt confirmed) và đồng hồ đếm ngược 72h khiếu nại.
   - Xây dựng giao diện quản lý đơn hàng phía Buyer và Seller, in nhãn vận đơn GHN trực tiếp trên web.

4. **Khiếu nại, Trả hàng & Admin Phân xử tranh chấp (FEAT-09)**:
   - Xây dựng quy trình mở khiếu nại (Report an issue), tải bằng chứng đối soát (ảnh khui hàng, video unbox).
   - Thiết lập SLA xử lý tranh chấp 3–5 ngày làm việc và quy trình yêu cầu xét lại (Appeals) trong 2 ngày làm việc.
   - Xây dựng phân hệ Admin Case: xem bằng chứng 2 bên, ra quyết định chấp nhận hoàn tiền, từ chối khiếu nại hoặc yêu cầu hoàn hàng.
   - Xây dựng quy trình xác minh định danh người bán (KYC): tải ảnh CCCD/Hộ chiếu, ân hạn 30 ngày và cơ chế khóa tài khoản vi phạm.

5. **Ví hoàn tiền, Rút tiền Vendor & Tính năng Tương tác (FEAT-10)**:
   - Thiết kế ví hoàn tiền nội bộ (Refund-only Wallet): chỉ nhận tiền hoàn từ đơn hủy/khiếu nại, dùng thanh toán 100% checkout tiếp theo.
   - Xây dựng cơ chế Xu thưởng mua hàng 0.5%, khấu trừ tối đa 10% tiền hàng và cơ chế thu hồi xu khi có đơn hoàn.
   - Xây dựng phân hệ Quản lý số dư Shop, tạo yêu cầu rút tiền về tài khoản ngân hàng và giao diện Admin duyệt ủy nhiệm chi ngân hàng kèm biên lai chuyển khoản.
   - Xây dựng hệ thống Chat Buyer - Shop (gắn kèm thẻ sản phẩm/đơn hàng), Chuông thông báo in-app & Email, Đánh giá shop 1–5 sao, Wishlist/Follow và Nút Báo cáo vi phạm (Report).

6. **Mô hình hóa UML, Khảo sát người dùng & Nghiệm thu UAT (DOC-02, DOC-03, DOC-06)**:
   - Phụ trách thiết kế hệ thống 28 biểu đồ PlantUML hoàn chỉnh: Usecases, Sequences, Activities, State Machines và Domain Model.
   - Thiết kế phiếu khảo sát Google Forms, thu thập $\ge 30$ phản hồi người dùng thời trang secondhand TP.HCM, phân tích số liệu và hoàn thiện `SURVEY_EVIDENCE.MD`.
   - Tổ chức thực nghiệm người dùng UAT với $\ge 10$ người dùng thật, tính toán chỉ số SUS ($\ge 80$), hoàn thiện hồ sơ kiểm soát AI và báo cáo luận văn tốt nghiệp.

---

## TỔNG KẾT MỨC ĐỘ ĐÓNG GÓP & CAM KẾT

- **Tỷ lệ đóng góp:** **50% Bùi Hải Dương — 50% Bùi Thành Tâm**.
- Hai thành viên tham gia đầy đủ, đồng đều ở cả 2 mảng: Lập trình sản phẩm (Code Full-stack) và Xây dựng Hồ sơ/Quy trình/Thiết kế hệ thống.
- Mọi đầu mục công việc đều được minh chứng bằng commit, Pull Request trên GitHub repo, hệ thống sơ đồ thiết kế UML và hồ sơ đặc tả hoàn chỉnh.
