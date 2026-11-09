# Re.wear — Hồ sơ Nộp Đồ án (Submission Documents)

Thư mục này tập trung toàn bộ tài liệu đặc tả, hồ sơ minh chứng và các biên bản cam kết phục vụ các mốc đánh giá của Bộ môn Công nghệ Phần mềm và Cổng nộp đồ án.

---

## 1. Nguồn tra cứu chính thức

- **Cổng Kiểm Tra Hồ Sơ Đồ Án:** [https://kanghidro.github.io/hd-nop-project/](https://kanghidro.github.io/hd-nop-project/)
- **Rubric đánh giá đồ án:** [Google Docs Rubric](https://docs.google.com/document/d/1juEuPZqhd7-ZqkM5EcUMriEUEbTT4rph/edit)
- **Báo cáo đề cương luận văn:** [Google Docs Báo cáo](https://docs.google.com/document/d/1iSOPW66vllAYl5PjRUGdEqCqoB3ZvL_9gCXr2o7c9DQ/edit?tab=t.0)
- **Nhật ký kiểm soát AI:** [`../AI_USAGE_LOG.md`](../AI_USAGE_LOG.md)

---

## 2. Danh mục Hồ sơ Chi tiết

| Hồ sơ | Nội dung chính | Mốc hạn cổng nộp | Trạng thái |
|---|---|---|---|
| [`DECISIONS.md`](DECISIONS.md) | Toàn bộ quyết định luồng ứng dụng và quy tắc nghiệp vụ đã chốt chính thức (RBAC, Giữ hàng, MoMo/COD, Escrow 72h, Ví hoàn tiền, AI, Rút tiền). | Nền tảng | **Đã chốt** |
| [`LIST_TASK.MD`](LIST_TASK.MD) | Phân công công việc 10 mô-đun kỹ thuật & 6 đầu mục tài liệu (50% Dương — 50% Tâm), phân rã trực tiếp từ SRS/SDD và ánh xạ Use Case. | 30/11/2026 | **Đã chốt** |
| [`COMMITMENT_STEP3.MD`](COMMITMENT_STEP3.MD) | Bản cam kết sản phẩm cuối cùng tại Bước 3 & Bộ 5 chỉ số KPI định lượng (Atomic Hold, Response Time, Escrow, Code Quality, SUS). | 23/11/2026 | **Đã soạn thảo** |
| [`PLAN.MD`](PLAN.MD) | Lộ trình và checklist theo dõi tiến độ hoàn thiện hồ sơ theo từng mốc hạn. | Điều phối | **Đang cập nhật** |
| [`SRS_SDD.MD`](SRS_SDD.MD) | Đặc tả yêu cầu phần mềm (SRS) và Thiết kế kiến trúc (SDD) khớp 100% mã nguồn thực tế và 28 biểu đồ PlantUML. | 01/12/2026 | **Đang hoàn thiện** |
| [`SURVEY_EVIDENCE.MD`](SURVEY_EVIDENCE.MD) | Phiếu khảo sát Google Forms, dữ liệu $\ge 30$ phản hồi tại TP.HCM và phân tích nhu cầu. | Nghiên cứu | **Chuẩn bị** |
| [`TEST_PLAN_AND_CASES.MD`](TEST_PLAN_AND_CASES.MD) | Kế hoạch kiểm thử 4 tầng, ma trận test cases và kết quả kiểm thử tự động. | 07/12/2026 | **Chuẩn bị** |
| [`UAT_USABILITY_REPORT.MD`](UAT_USABILITY_REPORT.MD) | Biên bản thực nghiệm $\ge 10$ người dùng thực tế và tính toán điểm chuẩn hóa SUS. | 08/12/2026 | **Chuẩn bị** |

---

## 3. Hướng dẫn Thành viên (Member Guidelines)

- **Source of Truth về Nghiệp vụ:** Toàn bộ các quy tắc và luồng xử lý chi tiết được lưu trữ và cập nhật duy nhất tại [`DECISIONS.md`](DECISIONS.md). Không cần tóm tắt lại các phiên hỏi đáp vào README.
- **Minh chứng kỹ thuật:** Mọi tính năng cam kết đều phải có kiểm thử tự động (Unit / E2E test) và commit / Pull Request tương ứng trên GitHub.
- **Nguyên tắc nộp:** Đảm bảo hồ sơ khớp $100\%$ với mã nguồn thực tế đang chạy trên môi trường Staging/Production trước khi nộp lên Cổng kiểm tra.
