# ERD dự thảo

Hai source PlantUML ở đây là các góc nhìn rút gọn để đọc trong Báo cáo:
checkout/order/return và payment/vendor balance/withdrawal. ERD đầy đủ và ràng buộc
nằm tại [database-proposal.md](../../archive/database-proposal.md#3-quan-hệ-tổng-quát).

Các bảng mới là thiết kế đề xuất, chưa phải entity hay API đã triển khai. Một quan hệ
lịch sử nhiều bản ghi không có nghĩa nhiều reservation hiệu lực hoặc nhiều dispute
đang mở. Các điều kiện một nguồn bán, cùng order, chống refund/rút trùng và snapshot
phải được kiểm tra riêng; xem phần chữ DB draft. Chưa tạo migration trong giai đoạn dev.
