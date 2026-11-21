# Follow Shop

Theo WISHLIST-FOLLOW-SESSION-01 trong [DECISIONS](../submission_docs/DECISIONS.md). Follow Shop độc lập với Wishlist sản phẩm; không dùng số lượt theo dõi làm điểm uy tín và không công khai danh tính người theo dõi.

## API

Tất cả API yêu cầu đăng nhập và tài khoản đang ACTIVE. Người dùng được lấy từ JWT, không nhận `userId` trong body.

| API | Nội dung |
|---|---|
| `PUT /shop-follows/shops/:shopId` | Body rỗng `{}`; theo dõi hoặc trả lại quan hệ hiện có, giữ nguyên `followedAt` khi retry. |
| `DELETE /shop-follows/shops/:shopId` | Bỏ theo dõi của chính actor; gọi lại an toàn kể cả Shop/quan hệ đã không còn. |
| `GET /shop-follows/shops/:shopId` | Trạng thái `{shopId,following,followedAt}` của actor. |
| `GET /shop-follows?limit=50&offset=0` | Danh sách Shop đang theo dõi, tối đa 100 mục/trang, tổng `totalCount`. |
| `GET /shop-follows/products?limit=50&offset=0` | Hàng mới từ các Shop hiện đang theo dõi, phân trang và tổng `totalCount`. |

Danh sách Shop sắp theo thời điểm follow giảm dần rồi id giảm dần; chỉ trả Shop id/tên/trạng thái và thời điểm follow. Không có endpoint đọc danh sách follower của người khác hoặc của Shop. Các mutation được serialize theo cặp actor/Shop và có unique constraint ở DB để tránh trùng khi gọi đồng thời.

Follow mới chỉ áp dụng cho Shop ACTIVE. Nếu đã follow rồi Shop chuyển INACTIVE thì quan hệ vẫn nằm trong danh sách để người dùng biết trạng thái và bỏ theo dõi; retry PUT không tạo quan hệ mới hoặc đổi thời điểm cũ. GET trạng thái không mở quyền khám phá Shop inactive chưa từng theo dõi. Xóa cứng Shop/User sẽ cascade quan hệ follow; không lưu quan hệ mồ côi.

Feed chỉ đọc listing hiện ACTIVE, moderation APPROVED, Shop ACTIVE, danh mục ACTIVE, có tiêu đề/giá hợp lệ và `publishedAt` không nằm trong tương lai. Sắp theo thời điểm xuất bản giảm dần rồi product id giảm dần. Feed bao gồm cả hàng đã xuất bản trước lúc follow; không chỉ tính sản phẩm mới phát sinh sau follow. Bỏ follow thì các lần đọc mới không còn lấy hàng từ Shop đó. Giao dịch repeatable-read giữ tổng/trang và metadata cùng một snapshot.

Thẻ feed trả id, tiêu đề, giá, tình trạng, size, cover URL công khai, thời điểm xuất bản và Shop id/tên. Cover phải còn hoạt động và là ảnh; không trả storage key, snapshot giao hàng, thông tin người theo dõi hay dữ liệu riêng của người bán. Listing đang giữ/đã bán/ẩn/chờ duyệt, Shop hoặc danh mục ngừng hoạt động đều bị loại. Không phát email hoặc thông báo hàng loạt khi follow hay khi đăng hàng mới trong phạm vi này; frontend dùng feed/API danh mục.

## Kiểm chứng và phạm vi

PostgreSQL tests sử dụng rewear_test tuần tự: concurrent idempotency, actor isolation, inactive/deleted Shop, public visibility, cover nghỉ sử dụng, thời điểm tương lai và phân trang trùng timestamp. HTTP kiểm tra JWT, validation, response privacy, mutation/feed và OpenAPI. Không cần provider hoặc gọi mạng bên ngoài. PR này chỉ gồm backend; chưa có nút Follow hay trang feed trên frontend.
