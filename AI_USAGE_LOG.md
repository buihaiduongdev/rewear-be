# Nhật ký sử dụng AI

## Mẫu ghi nhận

### [Ngày] — [Tên task]

- **Người thực hiện:** [Tên thành viên]
- **Công cụ:** [Ví dụ: ChatGPT, Codex; ghi phiên bản nếu biết]
- **Mục đích và phạm vi:** [AI hỗ trợ việc gì, ở phần nào của dự án]
- **Prompt chính:** [Tóm tắt yêu cầu đã đưa cho AI, đủ để hiểu AI được giao việc gì]
- **Đầu ra AI được sử dụng:** [Tài liệu, ý tưởng, test hoặc đường dẫn file/hàm/đoạn mã; ghi "không dùng mã AI sinh" nếu phù hợp]
- **Phần tự làm hoặc đã chỉnh sửa:** [Các quyết định nghiệp vụ, sửa mã, bổ sung kiểm thử... do thành viên thực hiện]
- **Cách kiểm chứng:** [Review, tài liệu chính thức đã đối chiếu, lệnh/test đã chạy và kết quả; kiểm tra giấy phép nguồn tham khảo nếu có]
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** [Mô tả lỗi, nguyên nhân và cách sửa; ghi "không phát hiện" nếu không có]
- **Minh chứng:** [Link PR, commit liên quan, commit sửa lỗi, issue hoặc tài liệu]

<!-- Sao chép mục trên cho task tiếp theo. Không ghi nhận lỗi/kiểm thử chưa xảy ra. -->

### 2026-10-08 — Thiết lập ConfigModule nền tảng

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Thiết lập module cấu hình ứng dụng NestJS, đọc biến môi trường và validate `NODE_ENV`/`PORT`; Codex hỗ trợ review cấu trúc.
- **Prompt chính:** “Hỗ trợ setup ConfigModule”; sau review, yêu cầu đặt module tại `src/modules/config`.
- **Đầu ra AI được sử dụng:** Hỗ trợ áp dụng/copy pattern ConfigModule có sẵn từ dự án cũ sang Rewear BE, gồm `ConfigModule`, `ConfigService`, schema Zod, `.env.example`, bootstrap và dependency cần thiết; không đề xuất kiến trúc mới.
- **Phần tự làm hoặc đã chỉnh sửa:** Thiết lập module, quyết định chỉ cấu hình nền tảng khi business chưa chốt, review cấu trúc và yêu cầu chuyển từ `src/config` sang `src/modules/config`.
- **Cách kiểm chứng:** `pnpm lint`, `pnpm format:check`, `pnpm typecheck` và `pnpm build` đều pass. Người thực hiện đã review lại vị trí module và phạm vi cấu hình.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Draft đầu tiên đặt ConfigModule ở `src/config`, không theo convention module-first của dự án; đã chuyển sang `src/modules/config` sau review.
- **Minh chứng:** Commit và PR của task này.

### 2026-10-08 — Thiết lập DatabaseModule

- **Công cụ:** Codex
- **Mục đích và phạm vi:** Thiết lập kết nối PostgreSQL/TypeORM và cấu trúc module database cho Rewear BE.
- **Prompt chính:** Hỗ trợ triển khai `DatabaseModule`; rà soát cấu hình PostgreSQL, `DATABASE_URL` và cơ chế tự đồng bộ entity/schema cho môi trường đồ án.
- **Đầu ra AI được sử dụng:** Hỗ trợ triển khai cấu trúc `DatabaseModule`, data source, cấu hình/schema database, scripts migration và dependency cần thiết.
- **Phần tự làm hoặc đã chỉnh sửa:** Chốt cấu trúc ConfigModule theo `configs/` và `schemas/`; quyết định PostgreSQL, `synchronize: true`, `autoLoadEntities: true`; review và sửa cách khai báo URL kết nối database.
- **Cách kiểm chứng:** `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` pass; khởi động NestJS và kết nối PostgreSQL thành công.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Đề xuất ban đầu tương thích ngược khi `DB_HOST` chứa connection URL; đã loại bỏ, chuẩn hóa dùng `DATABASE_URL`.
- **Minh chứng:** Commit và PR của task này.
