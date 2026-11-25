# Backlog

## Đơn giản hóa duyệt hồ sơ shop

- [ ] Ở PR riêng, bỏ snapshot và revision snapshot của hồ sơ KYC/duyệt shop; duyệt dựa trên thông tin hiện tại.
- [ ] Không cho sửa thông tin shop liên quan trong lúc hồ sơ đang chờ duyệt; cho sửa khi cần bổ sung hoặc bị từ chối. Kiểm tra trạng thái đồng thời trong transaction khi nộp, sửa và duyệt.
- [ ] Rà soát luồng gia hạn, dữ liệu định danh, tài liệu và API lịch sử trước khi bỏ snapshot; cập nhật FE, seed và kiểm thử liên quan.
- [ ] Sau khi bỏ tham chiếu snapshot, cho cleanup logo cũ không còn được dùng.

Phạm vi chỉ áp dụng cho hồ sơ duyệt shop/KYC; không thay đổi snapshot của đơn hàng hay cơ chế chống gửi trùng.
