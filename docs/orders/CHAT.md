# Chat Buyer–Shop

Theo CHAT-SESSION-01..03 trong [DECISIONS](../submission_docs/DECISIONS.md). Mỗi cặp buyer/Shop chỉ có một hội thoại chung, không tạo thread riêng cho từng sản phẩm hoặc đơn hàng. API REST hỗ trợ polling theo sequence; PR này chưa có giao diện chat hoặc WebSocket.

## API

| API | Nội dung |
|---|---|
| `POST /chat/conversations` | `{shopId}`: buyer mở/lấy lại hội thoại duy nhất. |
| `GET /chat/conversations?limit=50&offset=0` | Danh sách hội thoại hiện được phép đọc, kèm số tin chưa đọc. |
| `GET /chat/conversations/:id` | Thông tin, cursor đọc của hai phía và số chưa đọc. |
| `GET /chat/conversations/:id/messages` | Mặc định lấy 50 tin mới nhất; kết quả sắp sequence tăng dần. |
| `GET .../messages?after=123` | Lấy tin mới sau cursor; dùng `hasMore` để tiếp tục. |
| `GET .../messages?before=123` | Lấy trang lịch sử trước cursor; không kết hợp after/before. |
| `POST .../messages` | `{clientMessageId, text?, mediaIds?, card?:{type,id}}`. |
| `POST .../read` | `{throughSequence}`: đánh dấu phía hiện tại đã đọc đến sequence đã chọn. |
| `POST /media/upload-ticket` | `{mimeType,sizeBytes,visibility:"private"}`: lấy URL PUT và media ID. |
| `GET /chat/media/:id/download` | URL ký ngắn hạn cho media đã thực sự gửi và người hiện còn quyền. |
| `POST /chat/media/:id/dispute-evidence` | `{orderId,tags}`: nhập media đã gửi thành bằng chứng khiếu nại, lưu provenance. |

Các mutation trả HTTP 200. `clientMessageId` là UUID client giữ lại khi retry; cùng sender/thread/id chỉ tạo một tin. Đổi payload với id đã dùng bị từ chối. Không có sửa/xóa tin trong phạm vi này. Mỗi tin có sequence duy nhất được cấp trong transaction khóa hội thoại; không dùng timestamp làm cursor.

## Quyền và riêng tư

Buyer chỉ đọc/gửi trong thread của mình. Owner hoặc thành viên được cấp `chat.manage` được đại diện Shop; Staff/Manager không tự có quyền này. Admin không được đọc chat riêng chỉ vì có vai trò Admin. Quyền và trạng thái active của tài khoản được kiểm tra tại service khi đọc, gửi, ký download và nhập bằng chứng. Mất quyền thì không tiếp tục truy cập qua API. URL ký đã cấp chỉ có hiệu lực ngắn hạn, không thể thu hồi tức thì bằng API chat.

Không mở thread mới với Shop inactive hoặc với chính Shop đang là thành viên. Hội thoại cũ vẫn hoạt động khi Shop ngừng nhận giao dịch mới để tiếp tục hỗ trợ đơn hàng. Phía Shop có một cursor đọc chung; một thành viên có quyền đánh dấu đọc thay Shop. Cursor chỉ tăng và không vượt sequence hiện có. Đây là xác nhận đọc do client gửi, không phải bằng chứng con người đã xem nội dung. Đọc thông báo chuông không tự đánh dấu đã đọc chat.

Response không trả sender user id nội bộ của nhân viên, fingerprint, storage key, email hoặc địa chỉ giao hàng. `senderSide` là BUYER hoặc SHOP, do server quyết định; client không được khai báo phía gửi. Tên buyer và Shop chỉ dành cho người tham gia được phép đọc.

## Nội dung và media

Tin hỗ trợ text tối đa 4.000 ký tự, tối đa 6 ảnh/video và một thẻ ngữ cảnh. Ảnh JPEG/PNG/WebP tối đa 10 MiB; video MP4/WebM tối đa 50 MiB. Client xin URL upload media private, PUT file rồi gửi media ID trong tin nhắn. Server kiểm tra chủ sở hữu, loại và kích thước khi gắn; media chưa gắn không có API tải về. Upload bỏ dở được dọn định kỳ.

Thẻ PRODUCT chỉ lấy dữ liệu listing đang ACTIVE, đã duyệt và thuộc đúng Shop. Thẻ ORDER phải thuộc cả buyer lẫn Shop của thread; chỉ trả id/trạng thái, không chia sẻ địa chỉ/điện thoại hoặc thông tin thanh toán. Snapshot đã gửi không thay đổi khi tài nguyên gốc được sửa; thao tác ở tài nguyên đích vẫn kiểm tra quyền và trạng thái hiện tại.

Nhập bằng chứng yêu cầu media đã gắn vào tin, order đúng cặp buyer/Shop, và quyền/cửa sổ bằng chứng của DisputeAccess hiện hữu. Không mở quyền phân xử cho Staff chỉ nhờ có quyền chat. Lần nhập đầu tạo bằng chứng tham chiếu cùng media gốc, người nhập và order. Retry cùng tags trả evidence đã có; đổi tags bị từ chối. Media của phía đối thoại được dùng nếu người nhập có quyền xem nó và quyền hồ sơ khiếu nại. Không tự gắn vào issue hoặc tự chấp thuận khiếu nại.

Tin mới tạo thông báo chung cùng transaction, đích CHAT với sourceId là conversation id. Chỉ phía còn lại nhận thông báo; không sao chép nội dung text/media vào inbox chung và không gửi email mỗi tin. Thông báo Shop dùng `chat.manage`, nên bị ẩn khi quyền bị thu hồi.

## Kiểm thử và tích hợp

PostgreSQL test chạy tuần tự trên rewear_test. Storage được fake; không upload/download object thật. Cần private bucket và frontend thực hiện PUT theo ticket rồi gửi media ID trong tin nhắn. Chưa có kiểm chứng storage thật trong PR này.
