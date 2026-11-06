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

## Lưu ý về tài liệu cũ

Tài liệu Google Drive và các tài liệu lưu trong `docs/archive/` có thể đã lỗi thời;
developer chưa đọc và review đầy đủ chúng trong đợt tổng hợp này. Hãy dùng chúng
để tham khảo và tìm manh mối, không xem nội dung là quy tắc đã được duyệt. Nếu
quy tắc trong đó trùng với câu hỏi đang chốt, vẫn hỏi developer xác nhận lại
trước khi ghi là quyết định hiện hành hoặc đưa vào yêu cầu nộp.

## Session đang làm gì

Đang rà soát lại logic Rewear theo từng câu hỏi để member có thể đọc và tiếp tục
hoàn thiện bộ hồ sơ nộp. Các quyết định trong [DECISIONS.md](DECISIONS.md) là kết
quả đối thoại với chủ dự án; các file hồ sơ khác hiện chưa được soạn.

Đã chốt trong buổi làm việc:

- Khảo sát người ở TP.HCM, gồm người mua và người bán; không bắt buộc đã từng
  giao dịch; mục tiêu tối thiểu 30 phản hồi tổng cộng, chủ yếu câu hỏi chọn đáp án,
  thời gian khoảng 5 phút.
- Checkout nhiều người bán: online/ví thanh toán một lần; COD trả riêng khi nhận
  từng order/kiện. Phí giao tính theo từng nguồn bán rồi cộng tổng dự kiến.
- Giữ món 10 phút khi checkout; món không khả dụng bị loại riêng, món còn lại
  tiếp tục. Một checkout dùng chung địa chỉ giao hàng như cách các sàn phổ biến.
- Seller có 24 giờ xác nhận: online/ví tính từ thanh toán thành công, COD tính
  từ đặt thành công. Từ chối/quá hạn thì hủy riêng order đó; order khác tiếp tục.
- Refund của order bị hủy vào ví tiền Rewear, gồm cả phần xu đã dùng. Ví không
  nạp/rút, chỉ dùng mua trên Rewear; nếu ví đủ thì buyer chọn trả toàn checkout
  bằng ví hoặc thanh toán online. Không ghép ví một phần với online.
- Xu giảm tối đa 10% tiền hàng, không gồm ship; 1 xu = 1đ. Giữ xu riêng cho
  giao dịch, chỉ trừ khi thanh toán thành công (COD phải xác minh buyer đã trả).
  Xu thưởng mua hàng không hết hạn;
  xu chương trình có thể có hạn công bố trước. Quy tắc cũ đã được làm rõ trong
  DECISIONS.md.

## Cập nhật hội thoại 04–06/11/2026

Đã lưu phần hỏi đáp tiếp nối vào [DECISIONS.md](DECISIONS.md), mục “Bổ sung từ
hội thoại ngày 04–06/11/2026”. Đây là các quyết định nghiệp vụ, không xác nhận
code đã triển khai. Đọc cả ID thay thế/làm rõ và mục câu còn treo trước khi hỏi.

- Seller cá nhân cần admin duyệt trước khi tạo cả bản nháp; đủ 18 tuổi, một người
  một tài khoản seller đã duyệt; định danh bằng căn cước/hộ chiếu. Đã chốt cập
  nhật giấy tờ, gia hạn, hạn chế bán và xác minh nghi giả mạo; chưa chốt xử lý
  order cũ sau kết luận giả mạo (câu 29 còn treo).
- Xác nhận lại chờ quyết toán 72 giờ từ giao thành công đã xác minh. Tranh chấp
  khóa toàn bộ tiền seller của order liên quan; có SLA, bằng chứng, quyền xét lại
  và xử lý nhiều vấn đề. SLA 3 ngày làm việc, gia hạn tối đa 5; vi phạm thì chuyển
  cấp thêm tối đa 1 ngày. Không suy ra toàn bộ vòng đời tranh chấp/giữ tiền chỉ
  kéo dài 5 ngày: còn bước xét lại và điều kiện trả hàng/refund.
- Giữ hàng hoàn một phần cần hai bên xác nhận trong hồ sơ. Seller chịu toàn bộ
  khoản hoàn đã đồng ý; hoa hồng giảm tương ứng. Điều kiện miễn trả còn phải hỏi.
- Hoa hồng ban đầu: cá nhân 5%, shop 3%, không tính ship; thay đổi tăng/giảm đều
  báo trước ít nhất 7 ngày, không hồi tố tỷ lệ đã snapshot khi checkout giữ hàng.
- Sàn tài trợ xu và chịu phí thanh toán. Thưởng mua hàng 0,5% trên tiền hàng sau
  trừ xu/refund, không gồm ship; cấp theo order, làm tròn xuống một lần. Có thêm
  nguồn xu admin cấp theo chương trình; đã chốt thứ tự dùng và giữ xu có hạn.
- Tra soát thanh toán trước khi hết giữ hàng 10 phút. Hết hạn chưa xác nhận thành
  công thì nhả hàng. Đã nhả hàng mà xác nhận thu tiền đến muộn thì hoàn về phương
  thức thanh toán ban đầu qua cổng, không khôi phục checkout hoặc trừ xu. Bắt đầu
  tra soát sau 60 giây từ tạo giao dịch hoặc khi checkout còn 2 phút, mốc nào đến
  trước; bỏ qua nếu đã có kết quả hợp lệ. Tra soát mỗi 60 giây, chuyển sang mỗi
  15 giây trong 2 phút cuối; phải kiểm chứng khả năng/giới hạn provider. Đã chọn
  **MoMo Sandbox** ngày 05/11/2026 (PAYMENT-PROVIDER-01), không chọn SePay.
  Sau góp ý của người dùng, các mốc tra soát là phương án dự kiến cần kiểm chứng
  theo provider; hoàn về nguồn ban đầu chưa đồng nghĩa có API refund tự động.
  Đã đối chiếu tài liệu create/IPN/query/refund chính thức, chưa chạy API sandbox.
  Query cần timeout tối thiểu 30 giây; nhịp 15 giây không được tạo request chồng.
  Phạm vi phương thức, giới hạn số tiền và kết quả thử còn phải xác định.
- Người dùng bổ sung **COD (trả tiền khi nhận hàng)** cho đồ án, thay phạm vi cũ
  chỉ online sandbox. Đã chọn tích hợp tạo/tra cứu vận đơn COD và nhận trạng thái
  GHN Sandbox; nếu chưa thử được chuyển tiền thì mô phỏng riêng đối soát, ghi rõ
  giới hạn (SHIPPING-COD-01). Seller xác nhận trong 24 giờ từ đặt COD thành công,
  hàng khóa theo order. Đã chốt quyền hủy trước/sau xác nhận, phản hồi hủy 12 giờ,
  hủy vận đơn chưa rõ thì giữ khóa/tra cứu và chuyển admin sau 30 phút.
  Phí hủy phải thực tế, xác minh và công bố trước; buyer đổi ý chịu phí, có quyền
  phản đối. Quá hạn thanh toán phí thì chặn COD mới, không chặn mua trả trước;
  phí thu nhầm hoàn đúng nguồn. Chi tiết và ngoại lệ xem nhóm COD trong DECISIONS.
  COD thu riêng từng kiện, gồm tiền hàng sau giảm xu và ship. Giữ xu từ lúc đặt,
  trừ khi xác minh buyer trả COD; xu hết hạn trong lúc chờ vẫn dùng cho đúng order.
  Hủy trước thu tiền: xu còn hạn được nhả; xu hết hạn phục hồi 7 ngày theo nguyên
  nhân, riêng buyer đổi ý chỉ một lần mỗi khoản. Lỗi buyer làm giao thất bại thì
  không phục hồi xu hết hạn; chưa đủ căn cứ quy lỗi thì phục hồi 7 ngày sau xét.
  Không coi delivered là đã thu hoặc chuyển COD.
- Người dùng muốn hỏi từng câu có quyết định liên quan, nguồn, tình huống cụ thể,
  lựa chọn và tác động. Quy ước mới: lưu mỗi 5 câu trả lời nghiệp vụ, khi chuyển
  chủ đề hoặc khi được yêu cầu; README cập nhật khi đổi tổng quan/chuyển chủ đề.
  Mốc 5 câu chỉ để lưu file, không phải mốc chuyển chủ đề; tiếp tục cùng chủ đề
  đến khi làm rõ các logic liên quan hoặc người dùng yêu cầu chuyển.
  Phân biệt ghi nhận trong hội thoại với đã lưu file. Số câu không cố định 500.
  Độ uy tín seller/shop và chống spam checkout online/blacklist còn phải rà.
  COD đã có giới hạn 3 lượt/20 món chờ xác nhận, 5 lượt chưa kết thúc giao nhận;
  tự hủy đổi ý 5 lượt trong 24 giờ trượt thì lần đầu chặn COD mới 24 giờ, lần hai
  trong 30 ngày chặn 72 giờ. Hết hạn tự gỡ riêng hạn chế; hủy đơn cũ không kéo
  dài đợt chặn. Lần ba chuyển admin xét không SLA cố định; buyer giải trình một
  lần, admin được chặn COD không thời hạn khi xác minh cố ý lạm dụng. MVP không
  có bước buyer yêu cầu xét lại quyết định chặn không thời hạn; admin sửa khi tự
  phát hiện sai sót. Chỉ hạn chế COD, không tự khóa toàn bộ tài khoản.
- Giao COD thất bại do lỗi buyer đã được admin xác minh có bộ đếm riêng theo
  order: lần đầu 2 order/30 ngày trượt thì chặn COD mới 7 ngày. Sau mở lại, thêm
  1 order thất bại mới trong cửa sổ tái diễn 30 ngày thì chặn và chuyển admin xét,
  không SLA cố định, dùng chung quy trình giải trình/xử lý COD nghiêm trọng.
  Không đếm lặp cùng order hoặc xóa vi phạm chỉ vì đã thanh toán cước.
- COD bàn giao trong 48 giờ sau seller xác nhận. Quá hạn chuyển admin xét trong
  2 ngày làm việc; giao trễ cần buyer đồng ý, phản hồi trong 12 giờ, chỉ chờ thêm
  một lần tối đa 24 giờ. Từ chối/im lặng/quá hạn bổ sung thì hủy an toàn, không
  tự nhả hàng khi vận đơn chưa an toàn. Seller chủ động tạo vận đơn khi sẵn sàng.
- Ship COD là giá cố định công bố trước: dữ liệu đúng thì sàn chịu tăng/hưởng
  giảm cước; seller khai sai chịu phần tăng đã xác minh. Lưu riêng thông số kiện
  thực giao, không xóa snapshot lúc đặt hoặc tự đổi số tiền buyer đã xác nhận.
- Mở tiền seller COD cần đủ 72 giờ, không tranh chấp và sàn nhận đủ tiền theo
  đối soát. Buyer đủ điều kiện nhận thưởng xu không phải chờ tiền hãng về sàn.
  Lỗi carrier không thu cước buyer/seller; bồi thường chỉ mở khả dụng theo giá
  trị sàn xác minh nhận, không tự ứng hoặc bù phần hãng không duyệt.
- Refund buyer đủ điều kiện được sàn ứng dù COD chưa về; refund ví thực hiện tự
  động theo từng vấn đề đã chốt trong 5 phút, không chờ vấn đề khác của order.
  Seller còn tiền vẫn khóa theo hồ sơ. Quá SLA cảnh báo/thông báo, admin cập nhật
  hướng xử lý trong 4 giờ liên tục.
- Cấp thừa xu thưởng sau điều chỉnh refund thì thu hồi; phần thiếu bù thưởng mua
  hàng sau, không tạo số âm. Tiền ví cộng thừa phải admin xác minh; phần đã dùng
  ghi phải hoàn trả riêng và bù refund sau. Buyer phản đối trong 7 ngày một lần
  có căn cứ, admin xét 2 ngày làm việc; khi xét không giữ/bù refund mới.

Điểm tiếp tục: câu buyer có được chủ động trả khoản tiền ví cộng thừa qua MoMo
**chưa được trả lời**. Câu 29 về order cũ khi seller bị kết luận giả mạo vẫn còn
treo. Các điểm còn mở khác xem cuối DECISIONS.md, không suy ra từ đề xuất của AI.

## Các hồ sơ còn lại

`PROGRESS_LOG.MD`, `AI_LOG.MD`, `AI_REVIEW.MD`, `TEST_PLAN_AND_CASES.MD`,
`UAT_USABILITY_REPORT.MD`, `REPORT.PDF`, `PLAGIARISM_REPORT.PDF`, `VIDEO.TXT`,
các JSON minh chứng và các thư mục `database/`, `quality_reports/`,
`project_history/`, `achievements/` là khung chờ điền. Không đánh dấu hoàn thành
chỉ vì file đã tồn tại.

## Handoff cho member

1. Đọc DECISIONS.md trước; giữ rõ nhãn “đã chốt”, “đã xác nhận giữ nguyên” và
   “còn mở”. Nội dung archive của BE chưa tự động được xem là chủ dự án đã review.
2. Tiếp tục hỏi từng câu nghiệp vụ còn mở; lưu DECISIONS.md mỗi 5 câu trả lời,
   khi chuyển chủ đề hoặc được yêu cầu. Mốc lưu không phải mốc đổi chủ đề.
3. Chỉ sau khi chốt phạm vi, hoàn thiện survey, phân công hai thành viên,
   SRS/SDD và cam kết Bước 3. KPI minh họa của rubric không phải số liệu Rewear.
4. Dùng Git/PR/CI/test làm bằng chứng thật; phân biệt code đã merge, PR đang mở,
   code đã triển khai và luồng mới chỉ được thiết kế.

## Trạng thái

Tài liệu đang ở dạng working draft. Các mục tiêu khảo sát và quy tắc giao dịch đã
được ghi nhận trong DECISIONS.md; KPI, phạm vi cuối cùng, bảng chia task có tên/
đóng góp, và các xác nhận GVHD vẫn cần hoàn thiện. Cập nhật trạng thái sau khi có
bằng chứng hoặc quyết định mới.
