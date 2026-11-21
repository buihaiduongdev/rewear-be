# Thông báo tập trung

Theo NOTIF-SESSION-01 trong [DECISIONS](../submission_docs/DECISIONS.md). Backend cung cấp inbox bền vững, đọc/chưa đọc và hàng đợi email cho sự kiện quan trọng. Chưa có giao diện chuông thông báo hoặc WebSocket; frontend gọi API theo chu kỳ.

## API

| API | Nội dung |
|---|---|
| `GET /notifications?limit=50&offset=0&unreadOnly=true` | Trang thông báo của người đang đăng nhập; tối đa 100 mục. |
| `GET /notifications/unread-count` | Số chưa đọc trong phạm vi hiện còn quyền. |
| `PATCH /notifications/:id/read` | Đánh dấu đọc một mục; gọi lại giữ nguyên thời điểm đọc đầu tiên. |
| `PATCH /notifications/read-all` | Đánh dấu các mục hiện có và hiện được phép đọc; không tác động inbox người khác. |

Mỗi mục trả `id`, `kind`, `targetType`, `sourceId`, `shopId`, `title`, `body`, `mode`, `readAt`, `createdAt`. Không trả email, recipient id, event key, quyền nội bộ, đường dẫn storage hoặc bằng chứng. `createdAt` giữ thời điểm của sự kiện gốc khi backfill. `mode=SIMULATION` phải hiển thị nhãn mô phỏng; `null` nghĩa sự kiện chưa xác định nguồn tiền hoặc không liên quan tiền.

`targetType` xác định cách frontend mở đích: ORDER → đơn hàng và mục khiếu nại của đơn; DISPUTE_CASE → hồ sơ Admin; FEE → khoản phí; RATING → đánh giá trong Shop; COIN_HISTORY → lịch sử xu của đơn; SHOP_INVITATION → lời mời; PRODUCT → quản lý tin đăng; INBOX → hộp thông báo. `sourceId` là id tương ứng, không phải URL. API nghiệp vụ ở đích vẫn tự kiểm tra quyền.

## Nguồn nghiệp vụ và quyền

Projector đọc các bản ghi đã commit của đơn hàng, sự kiện vòng đời đơn, lời mời Shop, dispute notices, fee notices, fulfillment notices, điều chỉnh xu và sửa đánh giá. Mỗi nguồn có event key riêng, chống tạo trùng qua khởi động lại hoặc nhiều worker. Lỗi một nguồn không chặn vĩnh viễn các nguồn về sau; quét theo batch/cursor và quay vòng để thử lại. Notice nghiệp vụ cũ vẫn giữ nguyên và vẫn là căn cứ thời hạn xử lý, không đợi projector mới bắt đầu deadline.

Tin duyệt sản phẩm được xuất bản ngay trong transaction xét duyệt để giữ cả các quyết định trung gian. Inbox và ý định email cùng commit hoặc rollback. Bản ghi domain notice khác được đưa vào inbox bất đồng bộ theo worker 10 giây, có thể chậm thêm khi backlog lớn.

Thông báo Shop chỉ gửi đến thành viên có quyền thích hợp: đơn hàng `order.view`, khiếu nại/phí `shop.owner`, sửa đánh giá `rating.reply`, duyệt tin `product.view`. Danh sách, số chưa đọc, đánh dấu đọc và bước claim email đều kiểm tra tài khoản đang active và quyền hiện tại. Người đã rời Shop hoặc bị thu hồi quyền không tiếp tục xem thông báo Shop qua API chung. Thông báo Admin yêu cầu vai trò Admin hiện tại. Inbox cá nhân vẫn được lưu khi tài khoản inactive, chỉ đọc lại được khi active.

## Email và vận hành

Email dành cho đơn hàng mới, lời mời Shop và quyết định duyệt tin đăng. Email là văn bản an toàn, có nhãn mô phỏng nếu biết nguồn và chỉ dẫn vào `/notifications` sau đăng nhập; không nhúng bằng chứng/giấy tờ/ảnh riêng tư hoặc lý do tranh chấp.

Checkpoint khởi tạo khi bật module lần đầu: backfill đơn/lời mời cũ chỉ tạo inbox, không gửi email hàng loạt cho lịch sử. Không backfill lịch sử duyệt tin vì bảng hiện tại không giữ đủ các quyết định cũ. Chưa có nguồn xét đơn tạo Shop nên chưa thể phát sinh email duyệt Shop; cần nối publisher khi luồng đó được triển khai.

Outbox có PENDING/SENDING/SENT/FAILED/CANCELLED, claim `SKIP LOCKED`, lease 2 phút, tối đa 5 lần thử và backoff tăng dần 1 phút/lần. Timeout SMTP ngắn hơn lease. Quyền bị mất trước khi claim thì hủy gửi. Worker crash được xử lý qua lease; job hết lần thử được giữ FAILED để vận hành kiểm tra. Message-ID ổn định theo job. SMTP không bảo đảm exactly-once: nếu SMTP nhận thư nhưng tiến trình chết trước ghi SENT, lần thử lại có thể tạo thư trùng. Inbox vẫn chỉ có một mục.

Worker tự chạy ngoài môi trường test. Test gọi projector/sender trực tiếp với fake SMTP; không gửi email thật trong kiểm thử. Cấu hình SMTP hiện dùng chung MailModule. Triển khai cần SMTP hoạt động và frontend có trang `/notifications`; chưa có kết quả gửi SMTP thật trong PR này.
