# Technical TODO

## Nâng cấp module danh mục địa giới Việt Nam

**Trạng thái:** Cần nghiên cứu trước khi module được dùng lâu dài trong production.

Snapshot hiện tại giúp backend hoạt động độc lập với dịch vụ bên ngoài, nhưng file
`vietnam-administrative-divisions.ts` chứa gần 6.000 dòng dữ liệu sinh tự động. Cách
này làm source code và diff khó đọc, tăng kích thước bundle và dễ khiến dữ liệu bị
chỉnh sửa thủ công ngoài quy trình cập nhật.

### Hướng cần đánh giá

1. Tách snapshot khỏi TypeScript thành JSON có version, chỉ load và lập index một lần
   khi ứng dụng khởi động.
2. Đánh giá chuyển danh mục sang hai bảng `administrative_provinces` và
   `administrative_wards`, được cập nhật bằng script import hoặc seed có version.
3. Chỉ cân nhắc gọi nguồn bên ngoài ở runtime khi có SLA phù hợp; nếu áp dụng cần cache,
   timeout và snapshot dự phòng.
4. Xây dựng script đồng bộ để chuẩn hóa dữ liệu nguồn, tạo checksum và xuất báo cáo
   thay đổi trước khi cập nhật.

### Điều kiện hoàn thành

- Giữ nguyên contract của API tỉnh/thành và xã/phường hiện tại.
- Lưu được nguồn, ngày hiệu lực, phiên bản và checksum của dataset.
- Tự động kiểm tra số lượng, mã trùng, quan hệ tỉnh–xã và các bản ghi hiệu chỉnh.
- Không cần sửa thủ công hàng nghìn dòng dữ liệu khi danh mục hành chính thay đổi.
- Có hướng rollback về snapshot gần nhất nếu lần đồng bộ mới không hợp lệ.

Ưu tiên nghiên cứu phương án JSON có version trước vì thay đổi nhỏ và vẫn giữ được
đặc tính không phụ thuộc mạng ở runtime. Phương án database phù hợp hơn khi cần tìm
kiếm nâng cao, lịch sử phiên bản hoặc đồng bộ thường xuyên.

## Hoàn thiện quyền và vòng đời cửa hàng

**Trạng thái:** Chờ chốt nghiệp vụ sau phạm vi Shop MVP.

Module hiện hỗ trợ hồ sơ cửa hàng, chủ sở hữu và nhân viên ở hai trạng thái
`ACTIVE`/`INACTIVE`. Trước khi nối Shop với sản phẩm, đơn hàng và vận hành thực tế,
cần chốt thêm các quy tắc sau:

1. Luồng chuyển quyền sở hữu, chủ shop rời cửa hàng và cách xử lý khi tài khoản chủ
   shop bị khóa.
2. Ma trận quyền chi tiết của nhân viên đối với sản phẩm, tồn kho, đơn hàng và báo
   cáo; xác định có cần thêm vai trò ngoài `OWNER`/`STAFF` hay không.
3. Vòng đời vô hiệu hóa hoặc xóa cửa hàng và ảnh hưởng tới sản phẩm, đơn hàng đang
   xử lý, lịch sử giao dịch và dữ liệu cần lưu giữ.
4. Quy tắc quản lý địa chỉ cửa hàng, logo/banner, kiểm duyệt và trạng thái công khai.
5. Bổ sung migration chính thức cho `shops` và `shop_members` trước khi tắt
   `synchronize` ở môi trường production.

Các thay đổi sau phải giữ tương thích cho API hồ sơ Shop hiện tại hoặc có kế hoạch
version/migration rõ ràng.

## Hoàn thiện vòng đời sản phẩm

**Trạng thái:** Chờ chốt nghiệp vụ sau phạm vi Product MVP.

Module hiện hỗ trợ sản phẩm cá nhân hoặc sản phẩm thuộc cửa hàng, tạo bản nháp,
đăng bán, ẩn và đánh dấu đã bán. Trước khi nối với giỏ hàng và checkout, cần hoàn
thiện các phần sau:

1. Thiết kế cơ chế giữ hàng với trạng thái `HELD`, thời hạn hết giữ và xử lý đồng
   thời để một sản phẩm không được đặt bởi nhiều người.
2. Chốt quy trình kiểm duyệt, lý do từ chối và quyền xử lý khi sản phẩm vi phạm.
3. Chốt chính sách xóa và lưu giữ dữ liệu cho sản phẩm đã bán, bị ẩn hoặc gắn với
   đơn hàng có lịch sử giao dịch.
4. Bổ sung migration chính thức và rà soát index truy vấn trước khi tắt
   `synchronize` ở môi trường production.

API hiện tại phải giữ `HELD` là trạng thái nội bộ cho luồng checkout; client quản lý
sản phẩm chỉ được chuyển sang `ACTIVE`, `HIDDEN` hoặc `SOLD`.

## Nâng cấp quản lý media

**Trạng thái:** Media MVP đã hỗ trợ ảnh sản phẩm và tải trực tiếp lên object storage
bằng presigned URL; các mục dưới đây thuộc giai đoạn tối ưu vận hành production.

Luồng hiện tại:

1. Client gửi MIME và kích thước để backend kiểm tra quyền, giới hạn và cấp URL
   `PUT` có thời hạn ngắn.
2. Client tải file trực tiếp lên dịch vụ S3-compatible với đúng header do backend
   trả về. Binary không đi qua API server.
3. Client gửi `storageKey`, MIME và kích thước để xác nhận. Backend dùng `HEAD`
   kiểm tra object thực tế trước khi lưu metadata, thứ tự và ảnh bìa trong database.

Các nâng cấp cần nghiên cứu tiếp:

1. Bổ sung job hoặc lifecycle rule để dọn object của ticket đã hết hạn nhưng client
   không gọi bước xác nhận.
2. Kiểm tra chữ ký thực của file thay vì chỉ dựa vào MIME header; chuẩn hóa ảnh,
   loại metadata nhạy cảm và tạo thumbnail theo kích thước hiển thị.
3. Dùng outbox hoặc hàng đợi để đồng bộ vòng đời bản ghi và object; bổ sung job đối
   soát, dọn file mồ côi và retry khi object storage tạm thời lỗi.
4. Chốt quota theo tài khoản/cửa hàng, chính sách lưu giữ và cơ chế kiểm duyệt nội
   dung trước khi mở upload cho quy mô lớn.
5. Bổ sung migration chính thức cho `media` và `media_links`, cùng index phục vụ các
   owner type mới nếu module được mở rộng ngoài sản phẩm.

Client phải hoàn tất đủ ba bước `upload-ticket` → `PUT` trực tiếp → xác nhận. Sau
khi xác nhận, client quản lý ảnh theo product và media ID; `storageKey` chỉ dùng
trong quá trình upload.
