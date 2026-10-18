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
3. Tách module media để quản lý ảnh, thứ tự hiển thị, ảnh bìa và vòng đời file trên
   object storage.
4. Chốt chính sách xóa và lưu giữ dữ liệu cho sản phẩm đã bán, bị ẩn hoặc gắn với
   đơn hàng có lịch sử giao dịch.
5. Bổ sung migration chính thức và rà soát index truy vấn trước khi tắt
   `synchronize` ở môi trường production.

API hiện tại phải giữ `HELD` là trạng thái nội bộ cho luồng checkout; client quản lý
sản phẩm chỉ được chuyển sang `ACTIVE`, `HIDDEN` hoặc `SOLD`.
