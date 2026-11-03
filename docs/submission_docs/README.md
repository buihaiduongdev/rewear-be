# Rewear — hồ sơ đồ án

Thư mục này gom các tài liệu và minh chứng để chuẩn bị nộp đồ án theo yêu cầu
của môn học. File rỗng hiện chỉ là chỗ đặt hồ sơ dự kiến; chưa phải nội dung đã
hoàn thành hay được GVHD xác nhận.

## Bắt đầu từ đâu

- [DECISIONS.md](DECISIONS.md): quyết định đã được xác nhận trong buổi làm việc,
  nội dung cũ trong docs đang chờ review, và các điểm chưa chốt. Đây là file
  handoff quan trọng nhất để member nắm trạng thái.
- [SURVEY_EVIDENCE.MD](SURVEY_EVIDENCE.MD): kết quả khảo sát người mua/người bán.
- [LIST_TASK.MD](LIST_TASK.MD): phân công hai thành viên và liên kết bằng chứng.
- [SRS_SDD.MD](SRS_SDD.MD): phạm vi, yêu cầu, quy tắc và sơ đồ hệ thống.
- [COMMITMENT_STEP3.MD](COMMITMENT_STEP3.MD): phạm vi cam kết và metric cần thống
  nhất với GVHD.

## Session đang làm gì

Đang rà soát lại logic Rewear theo từng câu hỏi để member có thể đọc và tiếp tục
hoàn thiện bộ hồ sơ nộp. Các quyết định trong [DECISIONS.md](DECISIONS.md) là kết
quả đối thoại với chủ dự án; các file hồ sơ khác hiện chưa được soạn.

Đã chốt trong buổi làm việc:

- Khảo sát người ở TP.HCM, gồm người mua và người bán; không bắt buộc đã từng
  giao dịch; mục tiêu tối thiểu 30 phản hồi tổng cộng, chủ yếu câu hỏi chọn đáp án,
  thời gian khoảng 5 phút.
- Checkout nhiều người bán thanh toán một lần; phí giao tính theo từng người bán
  rồi cộng tổng checkout.
- Giữ món 10 phút khi checkout; món không khả dụng bị loại riêng, món còn lại
  tiếp tục. Một checkout dùng chung địa chỉ giao hàng như cách các sàn phổ biến.
- Nếu một seller không giao hoặc im lặng quá 24 giờ từ lúc checkout thanh toán
  thành công thì hủy riêng order đó; các order khác vẫn tiếp tục.
- Refund của order bị hủy vào ví tiền Rewear, gồm cả phần xu đã dùng. Ví không
  nạp/rút, chỉ dùng mua trên Rewear; nếu ví đủ thì buyer chọn trả toàn checkout
  bằng ví hoặc thanh toán online. Không ghép ví một phần với online.
- Xu giảm tối đa 10% tổng checkout; chỉ trừ sau thanh toán thành công. Xu không
  hết hạn. Quy tắc chi tiết và trạng thái review xem trong DECISIONS.md.

## Các hồ sơ còn lại

`PROGRESS_LOG.MD`, `AI_LOG.MD`, `AI_REVIEW.MD`, `TEST_PLAN_AND_CASES.MD`,
`UAT_USABILITY_REPORT.MD`, `REPORT.PDF`, `PLAGIARISM_REPORT.PDF`, `VIDEO.TXT`,
các JSON minh chứng và các thư mục `database/`, `quality_reports/`,
`project_history/`, `achievements/` là khung chờ điền. Không đánh dấu hoàn thành
chỉ vì file đã tồn tại.

## Handoff cho member

1. Đọc DECISIONS.md trước; giữ rõ nhãn “đã chốt”, “đã xác nhận giữ nguyên” và
   “còn mở”. Nội dung archive của BE chưa tự động được xem là chủ dự án đã review.
2. Tiếp tục hỏi chủ dự án từng câu nghiệp vụ còn mở; cập nhật DECISIONS.md ngay
   sau mỗi câu trả lời.
3. Chỉ sau khi chốt phạm vi, hoàn thiện survey, phân công hai thành viên,
   SRS/SDD và cam kết Bước 3. KPI minh họa của rubric không phải số liệu Rewear.
4. Dùng Git/PR/CI/test làm bằng chứng thật; phân biệt code đã merge, PR đang mở,
   code đã triển khai và luồng mới chỉ được thiết kế.

## Trạng thái

Tài liệu đang ở dạng working draft. Các mục tiêu khảo sát và quy tắc giao dịch đã
được ghi nhận trong DECISIONS.md; KPI, phạm vi cuối cùng, bảng chia task có tên/
đóng góp, và các xác nhận GVHD vẫn cần hoàn thiện. Cập nhật trạng thái sau khi có
bằng chứng hoặc quyết định mới.
