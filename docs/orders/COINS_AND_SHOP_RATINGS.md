# Xu thưởng và đánh giá Shop

Quy tắc nghiệp vụ theo [DECISIONS.md](../submission_docs/DECISIONS.md), nhóm COIN và RATING. Các chức năng dưới đây là backend; chưa bao gồm giao diện frontend hoặc vận hành provider thật.

## Xu thưởng

- `GET /coins/balance`, `GET /coins/history`: số dư và lịch sử riêng của buyer, tách EVIDENCE/SIMULATION.
- `POST /checkouts/:id/coins`: `{requestId, amount, mode}` chọn xu rõ ràng. Giới hạn 10% tổng tiền hàng; không giảm phí vận chuyển. Chia xu bằng số nguyên và phần dư lớn nhất theo thứ tự ổn định. Thay đổi lựa chọn không kéo dài TTL checkout.
- MoMo Sandbox chỉ dùng nguồn SIMULATION; ví phải cùng nguồn với xu. Giữ xu khi checkout; trừ khi capture online. COD tiếp tục giữ và chỉ trừ khi xác minh thu đủ tiền khách.
- `Order.subtotal` và giá item là giá gốc; `coinDiscount` là giảm do sàn tài trợ; `Order.total = subtotal + shippingFee - coinDiscount` là tiền mặt thực thu. Shop nhận giá hàng gốc trừ hoa hồng. Giảm bằng xu phải có debit, allocation và reservation đã tiêu thụ hợp lệ; trường discount đơn lẻ không chứng minh nguồn tài trợ.
- Hủy đơn online đã trả tiền hoàn giá hàng gốc cộng ship vào ví đúng mode; xu đã tiêu không hoàn lại. Tranh chấp hoàn theo quyền lợi item đã quyết định.
- COD hủy trước thanh toán giải phóng xu chưa tiêu. Xu hết hạn được xử lý theo nguyên nhân: người bán/đơn vị giao hàng/không kết luận được phục hồi 7 ngày; buyer đổi ý chỉ được phục hồi một lần theo lô gốc; lỗi buyer khác không phục hồi. Chưa rõ nguyên nhân giữ phần hết hạn chờ phân loại. `POST /coins/admin/orders/:id/release` yêu cầu Admin, chứng cứ không còn giao/không thu tiền, request id và nguyên nhân được lưu audit.
- Thưởng mua hàng `floor(max(0, subtotal - coinDiscount - tiền hàng đã hoàn)/200)`, sau giao hàng đã xác minh đủ 72 giờ, không còn vấn đề đang xử lý. COD không chờ carrier chuyển tiền về sàn. Mỗi đơn cấp thưởng một lần; thưởng mua hàng không hết hạn.
- Hoàn tiền bổ sung điều chỉnh thưởng ngay trong transaction hoàn tiền. Thu hồi từ lô thưởng gốc và dòng phục hồi liên quan; phần thiếu chỉ bù bằng thưởng mua hàng tương lai cùng mode. Không trừ ví, không lấy xu chương trình khác. `GET /coins/reward-notices` trả thông báo điều chỉnh cho đúng buyer.
- `/coins/admin/programs`: tạo/kích hoạt/dừng chương trình, ngân sách, cấp theo batch, sửa cấp nhầm và báo cáo. Ngân sách tính tổng đã cấp; thu hồi/hết hạn không tự bổ sung ngân sách. Không cấp trùng một recipient trong chương trình. Dừng chỉ ngăn cấp mới.

## Đánh giá Shop

- `GET /ratings/shops/:shopId`: danh sách, trung bình sao, phân bố sao và thông tin giao dịch xác minh. Mặc định EVIDENCE; SIMULATION tách riêng. Không tự đặt công thức điểm uy tín tổng hợp.
- `POST /ratings`: `{orderId, stars, comment?, mediaIds?}`. Một buyer/Shop một đánh giá, chỉ dựa trên giao hàng đã xác minh; sửa được và có lịch sử. Tranh chấp/hoàn hàng về sau không tự tước quyền đánh giá.
- `GET /ratings/mine`, `GET /ratings/:id/history`: dữ liệu riêng của buyer; không có API buyer xóa đánh giá.
- `POST /ratings/:id/reply`: một phản hồi Shop có thể sửa; quyền `rating.reply` riêng, Owner mặc định có, Staff/Manager cần được cấp. Lịch sử phản hồi và thông báo sửa đánh giá chỉ dành cho Shop có quyền.
- Admin moderation có audit. Ẩn nội dung/media/phản hồi vi phạm vẫn giữ sao hợp lệ; loại cả đánh giá chỉ với căn cứ gian lận/không đủ điều kiện. Sửa nội dung không tự làm hiện lại nội dung đang bị ẩn; khôi phục cần đúng revision đã duyệt.
- Media dùng ticket upload riêng, HEAD xác nhận kích thước/MIME/ETag, không nhận URL tự do hoặc bằng chứng tranh chấp. Link đọc ký chỉ cho media hiện đang gắn vào đánh giá hiển thị và đúng mode.

## Kiểm chứng và triển khai

Các integration test sử dụng PostgreSQL `rewear_test`, không reset database phát triển. Không có gọi MoMo/GHN/storage thật trong test. Main mới yêu cầu `xstate`; nếu chưa có, chạy `pnpm install` trước build/typecheck/full test. CI phải xác nhận toàn bộ cây tích hợp trước merge. Không tự triển khai schema vào database vận hành.
