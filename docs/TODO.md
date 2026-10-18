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
