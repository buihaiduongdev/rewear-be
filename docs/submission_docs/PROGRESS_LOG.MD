# SỔ THEO DÕI TIẾN ĐỘ ĐỒ ÁN VÀ LỊCH SỬ BÁO CÁO GVHD (PROGRESS LOG)

- **Tên đề tài:** Xây dựng Hệ thống Website bán quần áo đã qua sử dụng (Tên ứng dụng: **Re.wear**)
- **Mã đề tài cổng Project:** `358` ([Link đề tài](https://projects-fit.hcmute.edu.vn/?view=student-mytopic&topic=358))
- **Giảng viên hướng dẫn (GVHD):** ThS. Nguyễn Minh Đạo
- **Giảng viên phản biện (GVPB):** ThS. Nguyễn Trần Thi Văn
- **Sinh viên thực hiện:**
  1. Bùi Hải Dương — MSSV: `23110197` (Trưởng nhóm)
  2. Bùi Thành Tâm — MSSV: `23110310` (Thành viên)
- **Học kỳ:** HK1 — Năm học 2026-2027 (Kế hoạch 15 tuần: 14/09/2026 – 27/12/2026)

---

## 1. BẢNG TỔNG HỢP THEO DÕI TIẾN ĐỘ ĐỊNH KỲ (CHU KỲ 2 TUẦN / LẦN)

> **Căn cứ Rubric & Cổng kiểm tra hồ sơ:** Bắt buộc ghi chép lịch sử làm việc tối thiểu 2 tuần/lần; GVHD duyệt theo chu kỳ (tránh điểm chặn **G2**). Các tuần chi tiết được đồng bộ song song với hệ thống Quản lý Đề tài HCMUTE.

| Đợt báo cáo | Khoảng thời gian | Nội dung đã hoàn thành | Vướng mắc & Rủi ro kỹ thuật | Kế hoạch đợt tới | Ghi nhận thay đổi thiết kế theo góp ý GVHD | Xác nhận GVHD |
|---|---|---|---|---|---|---|
| **Đợt 1 (Tuần 1 – 2)** | 14/09/2026 – 27/09/2026 | Khảo sát bài toán thời trang 2hand, phân tích 4 nhóm tác nhân (Guest, Buyer, Shop, Admin); xây dựng quy trình nghiệp vụ tổng quát và danh mục chức năng MVP. | Phạm vi ban đầu quá rộng (nhiều tính năng phân tích dữ liệu/ML chưa khả thi cho MVP). | Hoàn thiện Use Case tổng quát, lược đồ thực thể ERD và Activity Diagrams. | **GVHD chỉ đạo:** Không đưa các ưu/nhược điểm ngoài kỹ thuật vào khảo sát; tập trung chức năng thương mại điện tử cốt lõi. | **Đã duyệt** (25/09/2026) |
| **Đợt 2 (Tuần 3 – 4)** | 28/09/2026 – 11/10/2026 | Hoàn thiện Chương 3 SRS/SDD: lược đồ Use Case, Activity Diagrams, Sequence Diagrams (Auth, Đăng bán, Đặt hàng, Thanh toán, Phân quyền shop). Tích hợp GHN tạo vận đơn. | Khâu tính cước vận chuyển đa shop và trạng thái giao hàng phụ thuộc API đối tác bên ngoài. | Tinh gọn phân nhóm nghiệp vụ, thiết lập cấu trúc Authentication Next.js & NestJS, dựng mockup UI. | **GVHD chỉ đạo:** Bổ sung thêm các quy trình hoạt động chính của hệ thống; chuyển vận chuyển từ nhập tay sang tạo vận đơn qua API. | **Đã duyệt** (08/10/2026) |
| **Đợt 3 (Tuần 5 – 6)** | 12/10/2026 – 25/10/2026 | Thiết lập kiến trúc NestJS/Next.js, Zod Schema, OpenAPI. Chốt luồng giỏ hàng, khóa giữ hàng 10 phút, checkout đa kiện, tách đơn theo shop, cơ chế ký quỹ (escrow) 72h. | Tránh phụ thuộc cơ chế giữ tiền của cổng thanh toán MoMo; phân biệt thời gian giữ hàng và giữ số dư ví. | Triển khai API Product lifecycle, Cart, Seed data và kết nối giao diện Home theo Figma. | Chuyển toàn bộ việc quản lý số dư ký quỹ về sàn (Database Re.wear) thay vì phụ thuộc hold của cổng thanh toán. | **Đã duyệt** (22/10/2026) |
| **Đợt 4 (Tuần 7 – 8)** | 26/10/2026 – 08/11/2026 | Triển khai mã nguồn API Product, Cart, Seed DB, UI Home responsive. Chốt toàn bộ 15 nhóm quy tắc nghiệp vụ trong `DECISIONS.md` (Shop RBAC, KYC, tranh chấp SLA, COD). Chuẩn bị bộ hồ sơ `submission_docs`. | Đảm bảo tính nhất quán giữa tài liệu nộp, quyết định kiến trúc và mã nguồn thực tế. | Hoàn thiện phiếu khảo sát thực tế, tài liệu SRS/SDD chi tiết và cam kết Bước 3 có xác nhận GVHD. | Đơn giản hóa Shop RBAC: 1 Owner duy nhất quản lý thành viên; kiểm duyệt tin đăng lại khi sửa thông tin/ảnh. | **Đã duyệt T7** / **Chờ duyệt T8** (07/11/2026) |

---

## 2. NHẬT KÝ CHI TIẾT CÁC LẦN BÁO CÁO TUẦN TRÊN HỆ THỐNG CỦA KHOA

Trích xuất trực tiếp từ Cổng Quản lý Đề tài Khoa CNTT — Trường ĐH Sư phạm Kỹ thuật TP.HCM:

### Tuần 1 — Nộp lúc 15:25 ngày 17/09/2026 (Trạng thái: Đã duyệt)
* **Nội dung báo cáo:**
  * Khảo sát các chức năng cốt lõi cho nền tảng thương mại điện tử thời trang secondhand đồ án tốt nghiệp: đăng tin, kiểm soát tình trạng sản phẩm, tìm kiếm lọc đa thuộc tính, thương lượng chat, thanh toán tạm giữ (escrow), đánh giá uy tín và tích hợp vận chuyển.
  * Nghiên cứu các giải pháp kỹ thuật nâng cao: chống tranh chấp race condition giữ hàng, kiến trúc Module NestJS, caching chiến lược và tối ưu hiệu năng.
* **AI hỗ trợ:** Gemini 3.8 — Hỗ trợ gợi ý các nhóm tính năng và kiến trúc kỹ thuật phù hợp cho đồ án e-commerce secondhand.
* **Sinh viên đã sửa:** Tinh lọc các tính năng thực tế, phân tách các bảng danh mục chức năng theo phạm vi tiểu luận chuyên ngành.
* **Xác nhận GVHD:** **Đã duyệt**

### Tuần 2 — Nộp lúc 11:30 ngày 25/09/2026 (Trạng thái: Đã duyệt)
* **Nội dung báo cáo:**
  * Phân tích các đối tượng tham gia hệ thống và xác định phạm vi chức năng tương ứng (Guest, Buyer, Shop, Admin).
  * Xây dựng quy trình nghiệp vụ tổng quát cho website bán quần áo đã qua sử dụng.
  * Phân tích yêu cầu chức năng cho từng nhóm người dùng; xác định yêu cầu chức năng hệ thống và yêu cầu phi chức năng.
  * Điều chỉnh phạm vi chức năng theo góp ý của GVHD, tập trung vào các chức năng cốt lõi.
* **AI hỗ trợ:** ChatGPT (GPT-5.5) — Hỗ trợ rà soát phần khảo sát, phân tích yêu cầu và đề xuất cấu trúc quy trình tổng quát.
* **Sinh viên đã sửa:** Kiểm tra theo yêu cầu đề tài và góp ý GVHD; lựa chọn chức năng phù hợp; tinh chỉnh diễn đạt và chuẩn hóa nghiệp vụ.
* **Nhận xét của GVHD:** **"Đã nhận. Phần khảo sát không nên đưa các ưu/nhược điểm không liên quan đến mặt kỹ thuật."**

### Tuần 3 — Nộp lúc 00:49 ngày 02/10/2026 (Trạng thái: Đã duyệt)
* **Nội dung báo cáo:**
  * Hoàn thiện phần phân tích và thiết kế hệ thống cho website Re.wear.
  * Rà soát, điều chỉnh yêu cầu chức năng, yêu cầu phi chức năng và phạm vi đề tài.
  * Hoàn thiện mô hình quan hệ thực thể (ERD) và các thực thể chính.
  * Xây dựng danh sách Use Case và đặc tả các Use Case chính.
  * Xây dựng lược đồ hoạt động (Activity Diagrams) cho các quy trình nghiệp vụ chính.
  * Xây dựng lược đồ tuần tự (Sequence Diagrams) cho: đăng nhập, đăng sản phẩm, đặt hàng, thanh toán trực tuyến, xử lý đơn hàng và mời/phân quyền nhân viên shop.
* **AI hỗ trợ:** ChatGPT (GPT-5.6) — Hỗ trợ rà soát Use Case, Activity Diagram và Sequence Diagram.
* **Sinh viên đã sửa:** Chọn lọc và điều chỉnh nội dung theo phạm vi đề tài; hoàn thiện các luồng nghiệp vụ, tác nhân, phân quyền dựa trên thiết kế thực tế.
* **Nhận xét của GVHD:** **"Đã nhận. Nhóm bổ sung thêm các quy trình hoạt động chính cửa đề tài."**

### Tuần 4 — Nộp lúc 21:40 ngày 08/10/2026 (Trạng thái: Đã duyệt)
* **Nội dung báo cáo:**
  * Hoàn thiện Chương 3 – Phân tích và thiết kế hệ thống.
  * Rà soát các quy tắc nghiệp vụ cốt lõi; xác định tác nhân và chức năng tương ứng; hoàn thiện Use Case tổng quát.
  * Bổ sung chức năng quản lý shop, phân quyền nhân viên, thanh toán và vận chuyển.
  * Điều chỉnh nghiệp vụ vận chuyển sang tích hợp đơn vị vận chuyển (tạo vận đơn tự động và cập nhật trạng thái giao hàng qua API).
  * Tiếp tục xây dựng đặc tả Use Case, Activity/Sequence Diagrams; đối chiếu tính thống nhất toàn diện.
* **AI hỗ trợ:** ChatGPT (GPT-5.6) — Hỗ trợ đề xuất cấu trúc Chương 3, rà soát luồng nghiệp vụ và tinh chỉnh lược đồ thiết kế.
* **Sinh viên đã sửa:** Điều chỉnh tác nhân, chức năng, quy tắc phân quyền shop, quy trình vận chuyển và xử lý đơn hàng; đồng bộ với thiết kế thực tế.
* **Nhận xét của GVHD:** **"Đã nhận"**

### Tuần 5 — Nộp lúc 18:27 ngày 15/10/2026 (Trạng thái: Đã duyệt)
* **Nội dung báo cáo:**
  * Cập nhật bảng yêu cầu nghiệp vụ: bổ sung cột Đối tượng nghiệp vụ, phân nhóm công việc, loại bỏ chức năng trùng lặp.
  * Cập nhật quy định xử lý khiếu nại, trả hàng và hoàn tiền (SLA khiếu nại, mở bằng chứng unbox).
  * Điều chỉnh nghiệp vụ vận chuyển từ nhập thủ công sang API đối tác GHN (cập nhật đặc tả Use Case vận chuyển đủ luồng chính/phụ/ngoại lệ).
  * Thiết lập xác thực (Authentication) nền tảng cho Next.js Frontend và NestJS Backend.
  * Xây dựng các bản mockup UI sơ bộ trên Figma định hướng bố cục và luồng thao tác.
* **AI hỗ trợ:** ChatGPT (GPT-6) — Tư vấn cấu trúc auth Next.js / NestJS, bố cục UI và tổng hợp tài liệu báo cáo.
* **Sinh viên đã sửa:** Điều chỉnh phương án kỹ thuật phù hợp với phạm vi; thiết lập mã nguồn auth; dựng mockup UI trên Figma; rà soát đặc tả Use Case.
* **Nhận xét của GVHD:** **"Đã nhận"**

### Tuần 6 — Nộp lúc 12:20 ngày 22/10/2026 (Trạng thái: Đã duyệt)
* **Nội dung báo cáo:**
  * Rà soát đối chiếu đặc tả Use Case, sơ đồ và mã nguồn hiện có; làm rõ luồng giỏ hàng và checkout (Atomic hold 10 phút, thanh toán 1 lần, tách đơn theo shop).
  * Hoàn thiện quy tắc thanh toán, vận chuyển, khiếu nại, trả hàng, hoàn tiền và quyết toán người bán. Tách bạch thời gian giữ hàng (10 phút) với thời gian ký quỹ chờ mở số dư (72 giờ).
  * Không phụ thuộc cơ chế giữ tiền riêng của cổng thanh toán; quản lý số dư ký quỹ tại sàn Re.wear.
  * Xuất bộ 28 sơ đồ PlantUML chuẩn hóa vào repository (`docs/diagrams/`); hoàn thiện trang tổng quan tài liệu và liên kết nhóm màn hình Figma.
  * Backend bổ sung presigned URL lưu trữ ảnh, chuẩn hóa OpenAPI, refactor request validation sang Standard Schema / Zod.
* **AI hỗ trợ:** ChatGPT (GPT-6) — Hỗ trợ phân tích sai khác, sinh mã PlantUML, liên kết Figma và refactor validation.
* **Sinh viên đã sửa:** Chốt dứt khoát quyết định không phụ thuộc vào hold của cổng thanh toán; chuyển sang escrow nội bộ; yêu cầu tinh gọn giao diện và loại bỏ các thành phần ngoài phạm vi.
* **Nhận xét của GVHD:** **"Đã nhận"**

### Tuần 7 — Nộp lúc 22:23 ngày 28/10/2026 (Trạng thái: Đã duyệt)
* **Nội dung báo cáo:**
  * Đồng bộ contract API giữa Backend và Frontend bằng Orval codegen (tự động sinh client, hooks, Zod schema).
  * Hoàn thiện vòng đời sản phẩm tại Backend: lưu nháp, kiểm tra tình trạng/khuyết điểm/số đo, gửi duyệt, phê duyệt, từ chối; ẩn tin kiểm duyệt lại khi người bán sửa nội dung; ngăn sửa khi đang khóa giữ hoặc đã bán.
  * Xây dựng dữ liệu Seed và Factory chuẩn phục vụ dev & test (tài khoản vai trò, danh mục, shop, sản phẩm mẫu).
  * Triển khai trang chủ Marketplace responsive trên Next.js kết nối API thật (tìm kiếm, lọc, phân trang, xem nhanh).
  * Hoàn thiện API giỏ hàng: kiểm tra tồn kho độc bản, chống thêm trùng, chặn người bán tự thêm đồ của chính mình.
  * Bổ sung kiểm thử tự động API với PostgreSQL, kiểm thử concurrency và E2E Home page.
* **AI hỗ trợ:** ChatGPT (GPT-6) — Hỗ trợ sinh mã Orval client, seed factory, test case concurrency và tài liệu kỹ thuật.
* **Sinh viên đã sửa:** Chốt logic kiểm duyệt sản phẩm khi sửa thông tin; yêu cầu test với dữ liệu PostgreSQL thực tế; tách PR độc lập để review.
* **Nhận xét của GVHD:** **"Đã nhận"**

### Tuần 8 — Nộp lúc 23:48 ngày 07/11/2026 (Trạng thái: Chờ duyệt)
* **Nội dung báo cáo:**
  * Rà soát toàn diện danh mục yêu cầu nộp theo Rubric Khoa và Cổng kiểm tra hồ sơ; cấu trúc thư mục `docs/submission_docs/`.
  * Chốt và ban hành toàn bộ 15 nhóm quy tắc nghiệp vụ cốt lõi trong `DECISIONS.md` (PR #26): Shop RBAC (1 Owner duy nhất, Manager, Staff), Seller KYC, thời hạn giữ tiền 72h, quy trình xử lý khiếu nại unbox, chat Buyer-Shop, đánh giá shop, COD.
  * Lập kế hoạch phân công công việc (`LIST_TASK.MD`) và cam kết sản phẩm Bước 3 (`COMMITMENT_STEP3.MD`).
* **AI hỗ trợ:** ChatGPT (GPT-6) — Hỗ trợ tổng hợp danh mục file nộp, cấu trúc decision log và kế hoạch chuẩn bị hồ sơ.
* **Sinh viên đã sửa:** Phản biện và trực tiếp lựa chọn phương án nghiệp vụ; chuẩn hóa mô hình shop sở hữu đơn lẻ; bảo đảm toàn bộ nội dung khớp với mã nguồn thực tế.
