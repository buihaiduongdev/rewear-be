# Re.wear — Tổng quan Tài liệu Kỹ thuật

Nền tảng thương mại điện tử chuyên biệt cho quần áo thời trang đã qua sử dụng (Secondhand / Pre-loved Fashion), giải quyết bài toán hàng độc bản (Single Inventory), chống tranh chấp mua đồng thời (Race Condition), tích hợp vận chuyển đa kiện và ký quỹ bảo vệ giao dịch.

- **Đề tài chính thức:** Xây dựng Hệ thống Website bán quần áo đã qua sử dụng
- **Bộ môn:** Công nghệ Phần mềm — Khoa Công nghệ Thông tin
- **Giảng viên hướng dẫn:** ThS. Nguyễn Minh Đạo
- **Sinh viên thực hiện:** Bùi Hải Dương (`23110197`) & Bùi Thành Tâm (`23110310`) (Tỷ lệ đóng góp: 50% – 50%)

---

## 1. Nguồn tra cứu chính thức

- **Cổng Kiểm Tra Hồ Sơ Đồ Án:** [https://kanghidro.github.io/hd-nop-project/](https://kanghidro.github.io/hd-nop-project/)
- **Rubric đánh giá đồ án:** [Google Docs Rubric](https://docs.google.com/document/d/1juEuPZqhd7-ZqkM5EcUMriEUEbTT4rph/edit)
- **Báo cáo đề cương luận văn:** [Google Docs Báo cáo](https://docs.google.com/document/d/1iSOPW66vllAYl5PjRUGdEqCqoB3ZvL_9gCXr2o7c9DQ/edit?tab=t.0)
- **Nhật ký kiểm soát AI:** [`AI_USAGE_LOG.md`](AI_USAGE_LOG.md)

---

## 2. Danh mục Hồ sơ Nộp Đồ án (`submission_docs/`)

Toàn bộ hồ sơ phục vụ các mốc đánh giá của Bộ môn và Cổng nộp đồ án được quy hoạch tập trung tại thư mục [`docs/submission_docs/`](submission_docs/):

| Hồ sơ | Nội dung chính | Mốc hạn cổng nộp |
|---|---|---|
| [`DECISIONS.md`](submission_docs/DECISIONS.md) | Toàn bộ quyết định luồng ứng dụng: RBAC Shop, Chat, Đánh giá, Xu sàn, Trạng thái đơn, Rút tiền. | Nền tảng |
| [`LIST_TASK.MD`](submission_docs/LIST_TASK.MD) | Phân công 10 mô-đun code & 6 đầu mục tài liệu (50% Dương — 50% Tâm), phân rã trực tiếp từ SRS/SDD. | 30/11/2026 |
| [`COMMITMENT_STEP3.MD`](submission_docs/COMMITMENT_STEP3.MD) | Cam kết sản phẩm Bước 3 & Bộ 5 chỉ số KPI định lượng (Atomic Hold, P95 $\le 200\text{ms}$, Escrow 72h, Coverage $\ge 70\%$, SUS $\ge 80$). | 23/11/2026 |
| [`PLAN.MD`](submission_docs/PLAN.MD) | Lộ trình và checklist theo dõi tiến độ hoàn thiện hồ sơ nộp cổng. | Điều phối |
| [`SRS_SDD.MD`](submission_docs/SRS_SDD.MD) | Đặc tả yêu cầu phần mềm (SRS) và Thiết kế kiến trúc (SDD) khớp 100% mã nguồn thực tế. | 01/12/2026 |
| [`SURVEY_EVIDENCE.MD`](submission_docs/SURVEY_EVIDENCE.MD) | Phiếu khảo sát Google Forms, dữ liệu $\ge 30$ người dùng TP.HCM và phân tích nhu cầu. | Nghiên cứu |
| [`TEST_PLAN_AND_CASES.MD`](submission_docs/TEST_PLAN_AND_CASES.MD) | Kế hoạch kiểm thử 4 tầng, ma trận test cases và kết quả kiểm thử tự động. | 07/12/2026 |

---

## 3. Tổng quan Kiến trúc & Công nghệ

- **Backend:** NestJS 11 theo Clean Architecture / Module-first, TypeScript, TypeORM, PostgreSQL 16, Swagger OpenAPI, Zod Environment Validation.
- **Frontend:** Next.js 16 (App Router, Turbopack), Tailwind CSS, React Query, NextAuth.
- **Tích hợp bên ngoài:**
  - **GHN Sandbox:** Báo giá cước vận chuyển tự động theo từng kiện shop, tạo vận đơn bưu tá lấy hàng.
  - **MoMo Sandbox:** Cổng thanh toán trực tuyến QR/App, IPN webhook và worker tra soát giao dịch.
  - **Google Gemini AI:** Gợi ý tiêu đề, mô tả sản phẩm thông minh từ dữ liệu form người bán nhập.
- **Hệ thống sơ đồ thiết kế:** Bộ 28 biểu đồ PlantUML hoàn chỉnh được lưu trữ tại [`docs/diagrams/`](diagrams/README.md) (Usecase, Sequence, Activity, State Machine, Domain Model).

---

## 4. Tóm lược Nghiệp vụ cốt lõi

1. **Tồn kho độc bản (Unique Items):** Mỗi sản phẩm thời trang secondhand là duy nhất (tồn kho $= 1$).
2. **Khóa giữ hàng nguyên tử 10 phút (Atomic Hold):** Khi người mua tiến hành checkout, hệ thống khóa giữ sản phẩm trong 10 phút với TTL cố định nhằm triệt tiêu tranh chấp mua trùng (Race condition). Hết hạn sẽ tự động nhả kho.
3. **Đóng gói quy chuẩn & Cước phí đa shop:** Người bán thiết lập thông số kiện hàng (kích thước, trọng lượng) và địa chỉ kho lấy hàng riêng (`/selling/pickup`). Cước GHN được tính và hiển thị minh bạch theo từng kiện seller.
4. **Vòng đời đơn 9 trạng thái & Escrow 72h:** Đơn hàng tuân thủ state machine 9 trạng thái. Tiền thanh toán được giữ ký quỹ an toàn trong 72 giờ từ khi giao hàng thành công trước khi giải ngân cho người bán, bảo đảm quyền mở khiếu nại unbox cho người mua.
5. **Ví hoàn tiền (Refund-only):** Tiền hoàn từ đơn hủy/khiếu nại được cộng vào ví nội bộ để cấn trừ 100% cho lần mua sắm tiếp theo.

---

## 5. Hướng dẫn Chạy thử & Dữ liệu mẫu (Development & Seeding)

- **Khởi động Database:** `docker compose up -d` (PostgreSQL trên cổng `5432`).
- **Seed dữ liệu thử nghiệm:**
  ```bash
  cd rewear-be
  SEED_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/rewear' pnpm seed
  ```
- **Chạy kiểm thử tích hợp (E2E Integration Tests):**
  ```bash
  cd rewear-be
  pnpm test:e2e
  ```
  *(Đã kiểm chứng: 75/75 E2E tests passing 100% bao gồm pickup location, cart, checkout atomic lock và product lifecycle).*

---

## 6. Lưu trữ Tài liệu Cũ (`docs/archive/`)

Các bản ghi chép chi tiết, bản nháp sprint ban đầu và log công cụ AI được lưu trữ tại:
- [`archive/legacy_specs/`](archive/legacy_specs/): Các file đặc tả kỹ thuật tính năng ban đầu (`CART`, `CHECKOUT`, `PICKUP_LOCATION`, `PRODUCT_LIFECYCLE`, `SEEDING`, `SHIPPING_PACKAGE`, `SHIPPING_QUOTE`, `superpowers/`).
- [`archive/`](archive/): Các đề xuất database, kế hoạch thực hiện và checklist cũ (`CHECKOUT_DECISIONS`, `TODO`, `ghn_integrate`).
