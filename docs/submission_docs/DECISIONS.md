# Nhật ký quyết định khi tổng hợp hồ sơ nộp

Mục đích: ghi lại điều người dùng đã xác nhận trong phiên brainstorm để dùng khi
soạn hồ sơ nộp. Đây là ghi nhận trao đổi, không tự thay thế quyết định nghiệp vụ
đã có trong tài liệu backend và không khẳng định tính năng đã triển khai.

## Khảo sát người dùng

| ID | Trạng thái | Quyết định |
| --- | --- | --- |
| SURVEY-01 | Đã chốt | Khảo sát cả người mua và người bán quần áo secondhand. |
| SURVEY-02 | Đã chốt | Không yêu cầu người tham gia phải từng mua hoặc bán; bao gồm cả người chưa từng giao dịch. |
| SURVEY-03 | Đã chốt | Địa bàn khảo sát là TP. Hồ Chí Minh. |
| SURVEY-04 | Đã chốt | Thu thông tin cơ bản gồm nhóm tuổi và nghề nghiệp; không thu tên hoặc số điện thoại. |
| SURVEY-05 | Đã chốt | Mục tiêu khảo sát là xác nhận nhu cầu/vấn đề người dùng để làm căn cứ xác định phạm vi Rewear. |
| SURVEY-06 | Đã chốt | Phiếu chủ yếu dùng câu hỏi chọn đáp án, thời lượng mục tiêu khoảng 5 phút. |
| SURVEY-07 | Đã chốt | Mục tiêu tối thiểu 30 phản hồi tổng cộng và có người thuộc cả nhóm mua lẫn nhóm bán; chưa đặt hạn ngạch riêng cho từng nhóm. |
| SURVEY-08 | Đã chốt | Trọng tâm gồm độ tin cậy thông tin sản phẩm, an toàn giao dịch và khó khăn khi tìm người mua/người bán. |
| SURVEY-09 | Đã chốt | Hỏi kênh người tham gia thường dùng để tìm hoặc đăng bán quần áo secondhand; cho phép chọn nhiều đáp án. |
| SURVEY-10 | Đã chốt | Hỏi ý định mua hoặc bán quần áo secondhand trong 12 tháng tới, kể cả người chưa có trải nghiệm. |
| SURVEY-11 | Đã chốt | Hỏi các yếu tố ảnh hưởng quyết định mua và rào cản đăng bán; câu hỏi về ưu tiên/khó khăn cho chọn tối đa 3 đáp án. |
| SURVEY-12 | Đã chốt | Phân nhóm trải nghiệm: chỉ từng mua, chỉ từng bán, từng mua và bán, chưa từng mua hoặc bán. |

## Thanh toán và giao hàng

| ID | Trạng thái | Quyết định |
| --- | --- | --- |
| PAY-SESSION-01 | Đã chốt trong phiên | Buyer thanh toán online một lần cho toàn bộ checkout, kể cả khi có sản phẩm từ nhiều người bán. |
| SHIPPING-SESSION-01 | Đã chốt trong phiên | Phí giao hàng tính riêng theo từng người bán/nguồn bán, sau đó cộng vào tổng thanh toán một lần của checkout. |
| ORDER-SESSION-01 | Đã chốt trong phiên | Nếu một người bán không thể giao, chỉ hủy order của người bán đó; các order khác trong cùng checkout vẫn tiếp tục. |
| REFUND-SESSION-01 | Đã chốt trong phiên; cập nhật theo REFUND-SESSION-02 | Khi hủy order vì người bán không thể giao, hoàn cả tiền hàng và phí giao hàng tương ứng vào ví tiền của buyer. Quyết định cũ hoàn bằng xu đã được thay thế. |
| COIN-SESSION-01 | Đã chốt | Số xu tối đa được áp dụng cho một checkout là 10% tổng checkout; mức sử dụng không vượt số dư xu buyer có. Xu hoàn không hết hạn. |
| COIN-SESSION-02 | Đã chốt trong phiên; cách xử lý hủy order được thay thế bởi REFUND-SESSION-02 | Khi dùng xu cho checkout nhiều order, phân bổ phần giảm giá theo tỷ trọng giá trị từng order để tính phần xu áp dụng cho từng order. Nếu order bị hủy, toàn bộ giá trị order trước giảm (phần tiền đã trả cộng phần xu đã dùng) được hoàn vào ví tiền buyer, không trả xu lại thành xu. |
| COIN-SESSION-03 | Đã chốt | Chỉ trừ xu khỏi số dư buyer khi thanh toán checkout thành công. |
| SELLER-SESSION-01 | Đã chốt trong phiên | Thời hạn 24 giờ để người bán xác nhận order bắt đầu khi checkout được thanh toán thành công, bằng online hoặc toàn bộ bằng ví. Nếu người bán từ chối hoặc quá hạn, chỉ hủy order của người bán đó; refund theo REFUND-SESSION-02; các order khác tiếp tục. |
| SELLER-SESSION-02 | Đã chốt trong phiên | Nếu người bán không phản hồi trong 24 giờ kể từ khi checkout được thanh toán thành công, bằng online hoặc toàn bộ bằng ví, hệ thống tự động hủy riêng order đó; refund theo REFUND-SESSION-02; các order khác trong checkout tiếp tục. |
| REFUND-SESSION-02 | Đã chốt trong phiên; thay thế cách hoàn xu trước đó | Khi order bị hủy, toàn bộ giá trị order trước giảm, gồm phần tiền buyer đã trả và phần xu đã dùng, được hoàn vào ví tiền của buyer. Không trả lại thành xu; buyer có thể dùng toàn bộ số dư ví cho lần mua sau mà không bị giới hạn dùng xu 10% mỗi checkout. |
| WALLET-SESSION-01 | Đã chốt trong phiên | Buyer chỉ được chọn ví tiền để trả checkout nếu số dư ví đủ toàn bộ tổng checkout; không hỗ trợ kết hợp ví trả một phần và thanh toán online cho phần còn thiếu. Nếu ví đủ, buyer tự chọn trả toàn bộ checkout bằng ví hoặc thanh toán online. Số dư ví không chịu giới hạn 10% áp dụng cho xu. |
| WALLET-SESSION-02 | Đã chốt trong phiên | Thanh toán toàn bộ checkout bằng ví được xem là thanh toán thành công và bắt đầu thời hạn 24 giờ để người bán xác nhận. |
| WALLET-SESSION-03 | Đã chốt trong phiên | Trong MVP, buyer không thể nạp tiền vào ví; số dư ví chỉ phát sinh từ khoản refund order bị hủy. |
| WALLET-SESSION-04 | Đã chốt trong phiên | Buyer không thể rút số dư ví ra ngoài Rewear; số dư chỉ dùng thanh toán checkout trên Rewear. |
| SELLER-SESSION-03 | Đã chốt một phần | MVP chưa ghi nhận vi phạm/blacklist khi seller từ chối order. Có thể lưu log đơn giản các order seller từ chối/hủy như tính năng phụ; blacklist shop nếu hành vi lặp lại thường xuyên là hướng mở rộng, chưa cần chốt ngưỡng trong phạm vi hiện tại. |
| HOLD-REVIEW-01 | Đã xác nhận giữ nguyên | Giữ hàng 10 phút từ lúc checkout giữ hàng thành công; thêm vào giỏ không giữ hàng. Gửi lại cùng checkout không gia hạn deadline. |
| CHECKOUT-REVIEW-01 | Đã xác nhận giữ nguyên | Nếu một số món không còn khả dụng lúc checkout thì loại riêng món đó khỏi checkout và giỏ; các món còn khả dụng tiếp tục. Nếu tất cả món không khả dụng thì không tạo thanh toán. |
| CHECKOUT-REVIEW-02 | Đã xác nhận giữ nguyên trong phiên | Checkout dùng một địa chỉ giao hàng chung cho mọi order trong checkout và lưu snapshot; muốn giao đến địa chỉ khác thì tạo checkout riêng. Người dùng xác nhận đây là cách hoạt động mong muốn như Shopee và các sàn phổ biến. |

## Còn cần tổng hợp

- Soạn bộ câu hỏi khảo sát hoàn chỉnh, lựa chọn đáp án và nhánh câu hỏi theo vai trò.
- Rà lịch sử PR để lập bảng module/task cho hai thành viên; người dùng yêu cầu ghi tên mình ở các feature đã hoàn tất. Cần đối chiếu tên/đóng góp với bằng chứng PR trước khi xuất bản phân công.
- Tiếp tục hỏi và chốt các quy tắc nghiệp vụ còn lại trước khi soạn các hồ sơ yêu cầu nộp.
- Các ví dụ KPI, thời lượng giữ hàng, ngưỡng kỹ thuật và tiêu chí mẫu trên trang checklist không được xem là quyết định Rewear nếu chưa được xác nhận.
