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

- **Backend:** NestJS theo Clean Architecture / Module-first, TypeScript, TypeORM, PostgreSQL 16, Swagger OpenAPI (`/api/docs`), Zod Validation.
- **Frontend:** Next.js 16 (App Router, Turbopack), Tailwind CSS, React Query, NextAuth.
- **Tích hợp bên ngoài:**
  - **GHN Sandbox:** Báo giá cước vận chuyển tự động theo từng kiện shop, tạo vận đơn lấy hàng và giao hàng thu hộ (COD).
  - **PayOS:** Cổng thanh toán trực tuyến VietQR (`@payos/node`), webhook xác thực chữ ký, worker tra soát giao dịch trong 10 phút giữ hàng và hoàn tiền tự động khi giao dịch xác nhận muộn.
  - **Google Gemini AI:** Gợi ý tiêu đề, mô tả sản phẩm thông minh từ dữ liệu form người bán nhập.
- **Hệ thống sơ đồ thiết kế:** Lưu trữ nguồn biểu đồ PlantUML tại thư mục `docs/diagrams/`.

---

## 4. Tóm lược Nghiệp vụ cốt lõi (theo [`COMMITMENT_STEP3.MD`](submission_docs/COMMITMENT_STEP3.MD))

1. **Tồn kho độc bản & Kiểm duyệt (`FEAT-02`, `FEAT-03`):** Mỗi sản phẩm thời trang secondhand có tồn kho duy nhất ($= 1$), hỗ trợ Gemini AI gợi ý mô tả, phân quyền nhân sự Shop RBAC, Admin kiểm duyệt tin đăng và xác minh định danh người bán (KYC, ân hạn gia hạn giấy tờ 30 ngày).
2. **Khóa giữ hàng nguyên tử 10 phút (`FEAT-04`):** Khi người mua tiến hành checkout đa shop, hệ thống khóa giữ sản phẩm trong 10 phút với TTL cố định nhằm chống tranh chấp mua trùng (Race condition) và tự động giải phóng tồn kho khi hết hạn.
3. **Đóng gói quy chuẩn, Vận chuyển GHN Sandbox & COD (`FEAT-05`, `FEAT-07`):** Người bán thiết lập quy chuẩn kiện hàng và địa chỉ kho lấy hàng riêng; cước GHN được tính minh bạch theo từng kiện shop. Đơn COD yêu cầu người bán xác nhận trong 24 giờ, hạch toán phí vận chuyển 2 chiều vào sổ cái Shop khi lỗi phía người bán và hạn chế đặt COD khi người mua vi phạm.
4. **Thanh toán trực tuyến PayOS (`FEAT-06`):** Tạo giao dịch thanh toán VietQR qua PayOS, cập nhật trạng thái qua webhook và worker tra soát định kỳ trước khi hết hạn giữ hàng, tự động hoàn tiền nếu thanh toán đến sau khi đã nhả kho.
5. **Vòng đời đơn hàng, Ký quỹ Escrow 72h & Khiếu nại (`FEAT-08`, `FEAT-09`):** Đơn hàng vận hành theo State Machine đồng bộ; tiền hàng được giữ ký quỹ 72 giờ kể từ khi giao thành công. Trong thời gian này, người mua có thể mở khiếu nại kèm ảnh/video mở hộp (unbox) để Shop phản hồi, Admin phân xử trong SLA 3–5 ngày làm việc (hỗ trợ 1 lần khiếu nại lại trong 2 ngày làm việc) và theo dõi vận đơn hoàn hàng GHN.
6. **Ví hoàn tiền, Xu thưởng & Rút tiền Vendor (`FEAT-10`):** Tiền hoàn từ đơn hủy/khiếu nại được cộng vào Ví nội bộ (Refund-only Wallet) để thanh toán 100% cho lần mua tiếp theo; tích lũy Xu thưởng 0.5% sau quyết toán (khấu trừ tối đa 10% tiền hàng); người bán tạo yêu cầu rút tiền và Admin kiểm duyệt ủy nhiệm chi ngân hàng thủ công.
