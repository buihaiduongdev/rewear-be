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

### 2026-10-08 — Thiết lập Swagger, common HTTP layer và rate limiting

- **Công cụ:** Codex
- **Mục đích và phạm vi:** Thiết lập Swagger, validation toàn cục, chuẩn hoá response, exception filter, request ID, HTTP logging và rate limiting cho Rewear BE.
- **Prompt chính:** Hướng dẫn cách thiết lập Swagger, common HTTP layer và rate limiting.
- **Đầu ra AI được sử dụng:** Hỗ trợ triển khai cấu hình Swagger, `AllExceptionsFilter`, logging/transform interceptor, middleware request ID/logging, rate limiting toàn cục và các kiểu response dùng chung.
- **Phần tự làm hoặc đã chỉnh sửa:** Chốt phạm vi task, cấu hình giới hạn mặc định và biến môi trường; không đưa CORS, authentication hoặc Sentry vào task này; cài đặt dependency và rà soát lại kết quả build.
- **Cách kiểm chứng:** `pnpm check` pass, bao gồm lint, format check, typecheck và build. Rà soát lỗi strict type của interceptor và đã bổ sung kiểu `CallHandler<T>`/`data: T`, đồng thời dùng ngưỡng status code dạng số để lint pass. Kiểm tra cấu hình rate limiting được nạp từ biến môi trường.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Không phát hiện sau khi rà soát lint, typecheck và build.
- **Minh chứng:** Commit và PR của task này.

### 2026-10-12 — Thiết lập xác thực, quản lý người dùng và gửi email

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Thiết lập nền tảng xác thực và quản lý người dùng trên branch `feat/auth-user-module` theo kiến trúc module của NestJS, tách riêng xác thực, người dùng, gửi email và các thành phần dùng chung; giới hạn quyền hệ thống ở `USER`/`ADMIN` khi nghiệp vụ Rewear chưa chốt.
- **Prompt chính (tóm tắt):** Tham khảo mã nguồn backend NestJS có sẵn để triển khai quản lý người dùng, đăng nhập bằng mật khẩu/Google, JWT và refresh token, xác minh email đăng ký, đặt lại mật khẩu, gửi email bằng Nodemailer, phân quyền quản trị và chuẩn hóa dữ liệu phản hồi. Tổ chức controller, service, DTO, entity, schema, guard và strategy theo từng module; dùng alias `@` và đặt schema xác thực trong thư mục `schemas/` tương tự module người dùng.
- **Đầu ra AI được sử dụng:** Hỗ trợ triển khai `src/common/decorators`, `src/common/entities`, `SerializeInterceptor`; `src/modules/user` với DTO, entity, schema, profile và CRUD quản trị; `src/modules/auth` với đăng nhập bằng credentials/Google ID token, JWT, refresh token rotation/revocation, token xác minh email/đặt lại mật khẩu và guards; `src/modules/mail` với Nodemailer và email templates. Bổ sung cấu hình/schema auth và mail, đăng ký module, dependency, `.env.example`, README, data source và alias `@/*`; chuyển schema auth vào `src/modules/auth/schemas/auth.schema.ts` kèm barrel export. Hỗ trợ đề xuất tên branch/commit và cách bỏ qua Husky khi commit; không tự thực hiện commit.
- **Phần tự làm hoặc đã chỉnh sửa:** Người thực hiện chốt phạm vi xác thực cơ bản, yêu cầu thống nhất cách tổ chức controller, service, DTO, entity và schema trong từng module, review cách tổ chức module/import, phản hồi lỗi TypeORM lúc chạy ứng dụng và tự chia/commit thay đổi theo common, user, mail, auth, setup. Tạm thời comment các lệnh format/check trong `.husky/pre-commit` theo yêu cầu do thời gian chạy lâu.
- **Cách kiểm chứng:** Chạy lại `pnpm check` trên HEAD `09a1784`: lint, Prettier, typecheck và Nest build đều pass. Sau khi chuyển folder schema auth, `pnpm typecheck` và Prettier trên các file liên quan cũng pass. Review mã nguồn cho các route auth, guards quản lý user, strategy xác minh Google ID token và mail templates. Chưa kiểm thử E2E với PostgreSQL, SMTP và Google trong lần ghi log này; các kết quả kiểm tra tĩnh/build không xác nhận toàn bộ luồng xác thực hoạt động thực tế.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Phát sinh `DataTypeNotSupportedError: Data type "Object" in "User.password" is not supported by "postgres" database.` khi khai báo kiểu nullable union mà thiếu kiểu cột TypeORM cụ thể; đã khai báo rõ `varchar` cho chuỗi nullable và `timestamptz` cho thời gian nullable. Schema auth ban đầu đặt ở `auth.schemas.ts` tại root module, chưa đồng nhất với user; đã chuyển vào `schemas/` và cập nhật import theo yêu cầu review.
- **Minh chứng:** Branch `feat/auth-user-module`; commits `2202538` (common), `6418ff0` (user), `71cc8fd` (mail), `2095de2` (auth), `09a1784` (setup). Nhật ký này được bổ sung sau các commit trên.
