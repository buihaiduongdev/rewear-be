# Kế hoạch hoàn thiện hồ sơ nộp Rewear

Plan này điều phối việc đi từ các quyết định nghiệp vụ đã ghi trong `DECISIONS.md` đến các hạng mục nộp trên Cổng nộp đồ án môn học. Đây là kế hoạch hoàn thiện hồ sơ minh chứng, không phải kế hoạch triển khai code sản phẩm.

## Mục tiêu

Hoàn thiện đầy đủ nội dung và minh chứng cho từng đầu mục nộp theo chuẩn Rubric của Khoa; bảo đảm phạm vi, phân công và số liệu có thể đối chiếu trực tiếp với developer, lịch sử Git/PR, kết quả kiểm thử thực tế và xác nhận của GVHD.

## Quy tắc làm việc

- Nguồn sự thật (Source of Truth): Bắt đầu từ `docs/submission_docs/DECISIONS.md`; cập nhật trạng thái sau từng nội dung đã được xác nhận.
- Tài liệu cũ (Google Drive, `docs/archive/`) chỉ mang tính chất tham khảo; nếu trùng nội dung vẫn đối chiếu và xác nhận lại với developer trước khi đưa vào hồ sơ chính thức.
- Tuyệt đối không biến ví dụ minh họa của rubric thành quy tắc Rewear, KPI đã đạt, kết quả khảo sát hoặc bằng chứng đã có khi chưa thực hiện.
- Phân biệt minh bạch 5 trạng thái: Đã xác nhận nghiệp vụ, Còn mở, Đã triển khai trong code, Đã kiểm chứng qua test/môi trường thực tế, và Đã được GVHD ký xác nhận.

## Trạng thái đầu vào & Nguồn đối chiếu

- **Cổng Kiểm Tra Hồ Sơ Đồ Án:** [https://kanghidro.github.io/hd-nop-project/](https://kanghidro.github.io/hd-nop-project/)
- **Rubric đánh giá đồ án chính thức:** [Rubric Google Docs](https://docs.google.com/document/d/1juEuPZqhd7-ZqkM5EcUMriEUEbTT4rph/edit)
- **Báo cáo đặc tả ban đầu:** [Báo cáo Re.wear](https://docs.google.com/document/d/1iSOPW66vllAYl5PjRUGdEqCqoB3ZvL_9gCXr2o7c9DQ/edit?tab=t.0)
- **Khung thư mục hồ sơ:** Đã có đầy đủ scaffold tại `docs/submission_docs/`.
- **Quyết định nghiệp vụ:** Đã chốt xong toàn bộ luồng ứng dụng tổng quát (Shop thống nhất, RBAC, Chat, Rating, Duyệt tin khi sửa, Thông báo, Wishlist/Follow, Danh mục/Bộ lọc, Report, Sổ địa chỉ, Promo xu sàn, Dashboard, 9 trạng thái đơn hàng, Gemini AI mô tả, Rút tiền Shop) cùng các quy tắc khảo sát, checkout, seller KYC, escrow 72h, tranh chấp và COD.

## Trình tự công việc chi tiết

### 1. Chốt các quy tắc nghiệp vụ còn mở
- Rà soát `DECISIONS.md` theo từng nhóm luồng nghiệp vụ.
- Đối với các điểm cũ trong docs cần review, xin xác nhận giữ nguyên hoặc sửa đổi.
- Ghi nhận câu trả lời vào `DECISIONS.md`, phân định rõ quy tắc thay thế.
- **Đầu ra:** Toàn bộ luồng ứng dụng tổng quát đã hoàn tất (`GUEST`, `CHAT`, `RATING`, `PRODUCT`, `SHOP-*`, `NOTIF`, `WISHLIST`, `CATEGORY`, `FILTER`, `REPORT`, `ADDRESS`, `PROMO`, `DASHBOARD`, `ORDER-STATE`, `AI-FEATURE`, `PAYOUT`).

### 2. Hoàn thiện khảo sát và thu thập dữ liệu
- Soạn phiếu khảo sát Google Forms thời lượng ~5 phút, có logic rẽ nhánh cho 4 nhóm: chỉ mua, chỉ bán, cả mua và bán, hoặc chưa từng mua bán.
- Các nội dung trọng tâm: nhóm tuổi/nghề nghiệp; kênh đang dùng; ý định mua/bán trong 12 tháng; độ tin cậy thông tin sản phẩm; an toàn giao dịch; rào cản đăng bán và yếu tố quyết định mua.
- Thu thập tối thiểu 30 phản hồi thực tế tại TP.HCM.
- Xây dựng 2 User Persona điển hình (Buyer, Shop Owner) và bảng so sánh $\ge 3$ giải pháp đối thủ trên thị trường vào `SURVEY_EVIDENCE.MD`.

### 3. Chốt mục tiêu và phạm vi với GVHD (Bước 3)
- Soạn mục tiêu đề tài súc tích, nêu rõ sản phẩm đầu ra và đối tượng người dùng.
- Lập phạm vi MVP bám sát các luồng có thể demo, phân định rạch ròi tính năng đã làm / đã merge, tính năng đang làm và hướng mở rộng tương lai.
- Trình developer kiểm tra, sau đó xin chữ ký/xác nhận của GVHD để tránh điều kiện chặn **G1**.
- Ghi nhận toàn bộ nội dung và metric cam kết vào `COMMITMENT_STEP3.MD`.

### 4. Lập phân công hai thành viên
- Trích xuất danh sách PR/commit từ hai repository `rewear-be` và `rewear-fe`.
- Đối chiếu tác giả, commits, đóng góp thực tế giữa Bùi Hải Dương và Tâm Bùi.
- Phân chia vai trò chính / hỗ trợ, trọng số đóng góp và link minh chứng cụ thể cho từng module vào `LIST_TASK.MD` để tránh điều kiện chặn **G9**.

### 5. Soạn thảo SRS/SDD & Cập nhật Diagrams
- Chuyển toàn bộ các quyết định đã chốt trong `DECISIONS.md` thành Actor, Use Cases, Acceptance Criteria và Business Rules.
- Bổ sung Từ điển dữ liệu (Data Dictionary), tối thiểu 5 yêu cầu phi chức năng (NFR) định lượng có phương pháp đo cụ thể.
- Cập nhật tối thiểu 4 loại sơ đồ (Use Case, Sequence, Activity/State Machine, ERD) khớp 100% với mã nguồn hiện tại vào `SRS_SDD.MD`.

### 6. Chốt metric và hồ sơ cam kết
- Đề xuất $\ge 5$ KPI nghiệp vụ đo lường được từ mục tiêu khảo sát.
- Thiết lập ngưỡng kỹ thuật (độ phủ kiểm thử, thời gian phản hồi API, tỷ lệ pass test) phù hợp với đề tài.
- Hoàn thiện và đóng băng file `COMMITMENT_STEP3.MD`.

### 7. Gom minh chứng kỹ thuật và vận hành
- `project_history/`: Xuất đủ `pr_history.json`, `cicd_runs.json`, `bug_tracker.json` từ GitHub.
- `quality_reports/`: Lập `CODING_CONVENTION.MD`, xuất báo cáo linter (0 lỗi), gitleaks (0 leak) và coverage test.
- `TEST_PLAN_AND_CASES.MD`: Bảng test case 4 tầng ánh xạ về Acceptance Criteria, kèm kết quả chạy pass 100%.
- README bàn giao: Hướng dẫn cài đặt, chạy seed data, tài khoản test và liên kết môi trường Staging/Prod.

### 8. Thực nghiệm người dùng (UAT) và Báo cáo cuối
- Tổ chức thử nghiệm với $\ge 10$ người dùng thật theo kịch bản tác vụ chuẩn.
- Đo lường tỷ lệ hoàn thành tác vụ ($\ge 90\%$), khảo sát điểm SUS ($\ge 80$) và ghi nhận ít nhất 1 vòng cải tiến sau phản hồi vào `UAT_USABILITY_REPORT.MD`.
- Hoàn thiện luận văn `REPORT.PDF`, báo cáo trùng lặp `PLAGIARISM_REPORT.PDF` ($\le 20\%$), slide thuyết trình và liên kết video demo `VIDEO.TXT`.

## Danh sách đầu ra theo cổng nộp

| Hạn theo cổng nộp | Đầu ra | File / Nguồn chính | Điều kiện nghiệm thu |
|---|---|---|---|
| **20/11/2026 16:44** | Mục tiêu đề tài | Nội dung portal; bản nguồn trong README/SRS | Developer duyệt; GVHD xác nhận |
| **23/11/2026 16:49** | Cam kết sản phẩm & Metric | `COMMITMENT_STEP3.MD` | Phạm vi/KPI đo được; GVHD ký duyệt (G1) |
| **27/11/2026 16:46** | Phạm vi đề tài | `SRS_SDD.MD`, nội dung portal | Khớp mục tiêu; Developer/GVHD duyệt |
| **30/11/2026 16:48** | Phân công thành viên | `LIST_TASK.MD` | Hai thành viên thống nhất vai trò & trọng số (G9) |
| **01/12/2026 22:33** | SRS/SDD & Sơ đồ | `SRS_SDD.MD`, diagrams | Khớp 100% mã nguồn thực tế |
| **07/12/2026 16:50** | Repository & Mã nguồn | GitHub repo; `.git` nguyên vẹn | Repo build chạy được; 0 secret (G8) |
| **07/12/2026 22:34** | Kế hoạch & Kết quả Test | `TEST_PLAN_AND_CASES.MD` | Test 4 tầng, pass 100%, 0 bug critical (G5) |
| **07/12/2026 22:35** | CI/CD Pipeline & Vận hành | `project_history/` | Pipeline $\ge 6$ chặng chạy được (G6) |
| **08/12/2026 22:32** | Hồ sơ kiểm soát AI | `AI_LOG.MD`, `AI_REVIEW.MD` | Kê khai trung thực, nêu $\ge 5$ lỗi/ảo giác AI (G3, G4) |
| **08/12/2026 22:33** | Báo cáo chất lượng mã nguồn | `quality_reports/` | Linter 0 lỗi, quét secret 0 leak, coverage $\ge 70\%$ |
| **08/12/2026 22:34** | Thực nghiệm người dùng (UAT) | `UAT_USABILITY_REPORT.MD` | $\ge 10$ người dùng thật, SUS $\ge 80$ (G7) |
| **08/12/2026 22:35** | Báo cáo trùng lặp & Luận văn | `PLAGIARISM_REPORT.PDF`, `REPORT.PDF` | Trùng lặp $\le 20\%$ (V4), 0 lỗi chính tả |
| **08/12/2026 22:36** | Slide, Video Demo & Điểm thưởng | `VIDEO.TXT`, Slide, `achievements/` | Video demo rõ nét, achievements nếu có |

## Theo dõi tiến độ

- [x] Chốt toàn bộ các quyết định luồng ứng dụng tổng quát (`DECISIONS.md`).
- [x] Xác nhận đầu mối hai thành viên, vai trò và phân rã chi tiết (`LIST_TASK.MD`).
- [ ] Soạn và rà phiếu khảo sát Google Forms.
- [ ] Thu thập và phân tích $\ge 30$ phản hồi khảo sát (`SURVEY_EVIDENCE.MD`).
- [ ] Developer xác nhận mục tiêu/phạm vi; xin chữ ký GVHD (`COMMITMENT_STEP3.MD`).
- [ ] Hoàn thiện `LIST_TASK.MD` từ bằng chứng PR/commit.
- [ ] Hoàn thiện `SRS_SDD.MD` và chuẩn hóa diagrams.
- [ ] Chốt bộ 5 KPI định lượng và xác nhận GVHD.
- [ ] Gom minh chứng kiểm thử, quality reports, CI/CD và staging.
- [ ] Chạy thực nghiệm UAT và ghi nhận cải tiến.
- [ ] Hoàn thiện luận văn, kiểm tra đạo văn, slide và video demo.
- [ ] Kiểm tra toàn diện mọi liên kết, dung lượng tệp và quyền truy cập trước khi nộp cổng.
