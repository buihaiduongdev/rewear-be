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

### 2026-10-18 — Triển khai API danh mục

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Triển khai module Category theo đề xuất cơ sở dữ liệu đang dùng cho MVP, gồm entity, DTO, schema phản hồi, service, controller và unit test; chưa mở rộng sang cây danh mục hoặc quan hệ với sản phẩm.
- **Prompt chính:** Dựa trên tài liệu nghiệp vụ và đề xuất cơ sở dữ liệu hiện tại để nhóm A triển khai API Category trong Rewear BE.
- **Đầu ra AI được sử dụng:** Hỗ trợ tạo `src/modules/category` và đăng ký `CategoryModule` trong ứng dụng. API gồm đọc danh sách/chi tiết danh mục đang hoạt động; tạo, cập nhật và vô hiệu hóa danh mục dành cho ADMIN; sinh slug chuẩn hóa từ tên tiếng Việt, kiểm tra slug trùng và serialize phản hồi bằng Zod. Bổ sung unit test cho các hành vi chính của service.
- **Phần tự làm hoặc đã chỉnh sửa:** Chốt phạm vi Category phẳng cho MVP; giữ slug ổn định khi chỉ đổi tên; dùng `isActive = false` để xóa mềm; giới hạn thao tác ghi bằng `JwtAuthGuard`, `RolesGuard` và vai trò `ADMIN`.
- **Cách kiểm chứng:** `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` và `pnpm check` đều pass. `pnpm test --runInBand` pass 3 test suites với 36 tests, trong đó có unit test của `CategoryService`. Chưa kiểm thử HTTP E2E với PostgreSQL trong lần ghi log này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Không phát hiện sau khi review mã và chạy các kiểm tra trên.
- **Minh chứng:** Các thay đổi hiện có trong working tree tại `src/modules/category`, `test/unit/modules/category/category.service.spec.ts` và `src/app.module.ts`;

### 2026-10-18 — Chuyển công cụ lint từ ESLint sang Oxlint

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Thay ESLint bằng Oxlint cho mã nguồn và unit test của Rewear BE, đồng thời giữ Prettier và TypeScript typecheck là các bước kiểm tra độc lập.
- **Prompt chính:** “Chuyển sang oxlint thay cho eslint.”
- **Đầu ra AI được sử dụng:** Hỗ trợ thay script `lint`/`lint:fix` bằng Oxlint, thêm `.oxlintrc.json`, cài `oxlint`, gỡ các dependency ESLint trực tiếp, xóa `eslint.config.mjs` và cập nhật lockfile.
- **Phần tự làm hoặc đã chỉnh sửa:** Chọn lint `src` và `test`; bật các plugin TypeScript, Unicorn, Oxc và Jest; đặt nhóm luật correctness ở mức error; giữ `tsc --noEmit` trong quy trình `check` để kiểm tra kiểu dữ liệu.
- **Cách kiểm chứng:** `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm test --runInBand` và `pnpm check` đều pass.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Thử nghiệm chế độ type-aware qua `oxlint-tsgolint` không tương thích với `tsconfig.json` hiện tại vì cấu hình đang dùng `baseUrl` và alias `paths` không tương đối. Đã không thay đổi alias/import của dự án chỉ để phục vụ lint, loại dependency type-aware trực tiếp và tiếp tục dùng `tsc --noEmit` để kiểm tra kiểu.
- **Minh chứng:** Các thay đổi hiện có trong working tree tại `.oxlintrc.json`, `package.json`, `pnpm-lock.yaml` và việc xóa `eslint.config.mjs`;.

### 2026-10-18 — Triển khai API sổ địa chỉ người dùng

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Triển khai và chuẩn hóa module User Address theo địa giới Việt Nam hai cấp, cho phép người dùng đã đăng nhập quản lý các địa chỉ của chính mình và chọn một địa chỉ mặc định; chưa tích hợp địa chỉ vào checkout hoặc đơn hàng.
- **Prompt chính:** Tiếp tục nhóm A và triển khai User Address trong Rewear BE.
- **Đầu ra AI được sử dụng:** Hỗ trợ tạo entity, DTO, schema phản hồi, service, controller và module tại `src/modules/user-address`; đăng ký `UserAddressModule` trong ứng dụng; bổ sung unit test cho truy vấn theo chủ sở hữu, tạo/cập nhật/xóa và đổi địa chỉ mặc định; refactor dữ liệu địa chỉ sang cặp mã/tên tỉnh, phường và các trường giao hàng rõ nghĩa.
- **Phần tự làm hoặc đã chỉnh sửa:** Chốt mọi truy vấn theo `userId` lấy từ JWT; không trả `userId` hoặc quan hệ user trong phản hồi; trả 404 khi địa chỉ không thuộc người gọi; dùng transaction khi đổi địa chỉ mặc định và partial unique index để bảo đảm mỗi người dùng có tối đa một địa chỉ mặc định. Không lưu mã địa bàn riêng của hãng vận chuyển trong `user_addresses`; giữ `countryCode` ở phạm vi `VN` và tách tích hợp hãng vận chuyển khỏi sổ địa chỉ.
- **Cách kiểm chứng:** `pnpm check` pass, gồm Oxlint, Prettier check, TypeScript typecheck và Nest build. `pnpm exec jest --runInBand` pass 4 test suites với 42 tests. `git diff --check` pass. Chưa kiểm thử HTTP E2E với PostgreSQL trong lần ghi log này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Lệnh kiểm thử đầu tiên dùng `pnpm test -- --runInBand`, khiến Jest hiểu `--runInBand` là mẫu tên file và báo không tìm thấy test; đã chạy lại đúng bằng `pnpm exec jest --runInBand`. Không phát hiện lỗi mã sau các bước kiểm chứng.
- **Minh chứng:** Các thay đổi hiện có trong working tree tại `src/modules/user-address`, `test/unit/modules/user-address/user-address.service.spec.ts`, `src/app.module.ts` và mục nhật ký này.

### 2026-10-18 — Tích hợp danh mục địa giới Việt Nam

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Tích hợp danh mục địa giới Việt Nam hai cấp vào backend, cung cấp API tỉnh/thành và xã/phường cho client, đồng thời chuẩn hóa dữ liệu khi tạo hoặc cập nhật địa chỉ người dùng. Chưa tích hợp mã địa bàn riêng của hãng vận chuyển hoặc cơ chế đồng bộ tự động.
- **Prompt chính:** Thiết kế và tích hợp danh mục địa giới hành chính Việt Nam hai cấp vào backend để cung cấp API tra cứu tỉnh/thành, xã/phường và chuẩn hóa dữ liệu trong sổ địa chỉ người dùng.
- **Đầu ra AI được sử dụng:** Hỗ trợ tạo `AdministrativeDivisionModule`, service và hai public endpoint đọc tỉnh/thành, xã/phường; tạo snapshot 34 tỉnh/thành và 3.321 xã/phường có metadata nguồn; nối danh mục vào `UserAddressService` để kiểm tra quan hệ tỉnh–xã và tự điền tên chuẩn từ mã; cập nhật DTO, README, unit test và ghi TODO nghiên cứu tách dataset sinh tự động khỏi TypeScript.
- **Phần tự làm hoặc đã chỉnh sửa:** Chọn snapshot có phiên bản để API không phụ thuộc dịch vụ công cộng ở runtime; đối chiếu danh mục với Cục Thống kê, Province Open API và bộ dữ liệu `open-admin-data`; áp dụng tên cấp tỉnh hiện hành tại ngày 2026-10-18 và mã xã Ba Chẽ đã hiệu chỉnh là `06970`. Chốt contract ghi địa chỉ chỉ nhận `provinceCode` và `wardCode`; backend chịu trách nhiệm lưu tên chuẩn.
- **Cách kiểm chứng:** `pnpm check` pass, gồm Oxlint, Prettier check, TypeScript typecheck và Nest build. `pnpm exec jest --runInBand` pass 5 test suites với 49 tests. `git diff --check` pass. Chưa kiểm thử HTTP E2E với PostgreSQL trong lần ghi log này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Mock `repository.save` ban đầu không khớp overload TypeORM trong TypeScript; đã giới hạn mock theo đúng lời gọi. Unit test ban đầu import qua barrel của module khiến Jest nạp Swagger ESM; đã đổi sang import trực tiếp service để giữ ranh giới test phù hợp. Hai nguồn dữ liệu phụ lệch mã Ba Chẽ giữa `06970` và `06978`; đã chọn `06970` theo bản hiệu chỉnh mới hơn và thêm test chống hồi quy.
- **Minh chứng:** Branch `feat/vietnam-administrative-divisions`; các thay đổi tại `src/modules/administrative-division`, `src/modules/user-address`, `test/unit/modules/administrative-division`, `test/unit/modules/user-address`, `README.md` và mục nhật ký này.

### 2026-10-18 — Triển khai API quản lý cửa hàng và thành viên

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Triển khai module Shop cho MVP, gồm hồ sơ cửa hàng, quan hệ thành viên và các thao tác quản lý nhân viên cơ bản; chưa mở rộng sang phân quyền sản phẩm/đơn hàng, chuyển quyền sở hữu, tài sản hình ảnh hoặc địa chỉ cửa hàng.
- **Prompt chính:** Tiếp tục nhóm API nghiệp vụ trên một branch riêng và triển khai module quản lý cửa hàng theo tài liệu thiết kế cơ sở dữ liệu đang ở trạng thái draft.
- **Đầu ra AI được sử dụng:** Hỗ trợ tạo entity `Shop`/`ShopMember`, enum, DTO, schema phản hồi, service, controller và module; đăng ký `ShopModule` trong ứng dụng; bổ sung public API đọc cửa hàng đang hoạt động, API tạo/cập nhật cửa hàng, xem các cửa hàng của người dùng và quản lý danh sách nhân viên; bổ sung unit test cho các ràng buộc chính.
- **Phần tự làm hoặc đã chỉnh sửa:** Chốt phạm vi MVP với hai vai trò `OWNER`/`STAFF`; người tạo trở thành chủ sở hữu đang hoạt động trong cùng transaction; chỉ chủ sở hữu đang hoạt động được sửa cửa hàng hoặc quản lý nhân viên; dùng trạng thái `ACTIVE`/`INACTIVE` thay cho xóa membership; giữ các quyết định chưa chốt trong `docs/TODO.md`.
- **Cách kiểm chứng:** `pnpm check` pass, gồm Oxlint, Prettier check, TypeScript typecheck và Nest build. `pnpm exec jest --runInBand` pass 6 test suites với 56 tests. `git diff --check` pass. Chưa kiểm thử HTTP E2E với PostgreSQL trong lần ghi log này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Phản hồi ban đầu của thao tác thêm/cập nhật nhân viên chưa nạp quan hệ `user` mà schema yêu cầu; đã reload membership kèm quan hệ trước khi trả về. Mock TypeORM trong test ban đầu bị TypeScript suy luận theo overload dành cho mảng; đã giới hạn mock theo đúng lời gọi được kiểm thử.
- **Minh chứng:** Branch `feat/shop-module`; các thay đổi tại `src/modules/shop`, `test/unit/modules/shop/shop.service.spec.ts`, `src/app.module.ts`, `docs/TODO.md` và mục nhật ký này.

### 2026-10-18 — Triển khai API sản phẩm

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Triển khai module Product cho MVP, hỗ trợ sản phẩm do cá nhân hoặc cửa hàng đăng bán, danh mục công khai, quản lý sản phẩm của người bán và vòng đời cơ bản; chưa triển khai hình ảnh, giữ hàng, đơn hàng hoặc kiểm duyệt nội dung.
- **Prompt chính:** Tiếp tục nhóm API nghiệp vụ trên một branch riêng và triển khai module Product dựa trên tài liệu cùng đề xuất cơ sở dữ liệu đang ở trạng thái draft, đồng thời giữ các quyết định checkout chưa chốt ngoài phạm vi.
- **Đầu ra AI được sử dụng:** Hỗ trợ tạo entity, enum, DTO, schema truy vấn/phản hồi, service, controller và module tại `src/modules/product`; đăng ký `ProductModule` trong ứng dụng; bổ sung API công khai để tìm kiếm/xem sản phẩm đang bán, API người bán để tạo/cập nhật/xem sản phẩm và thay đổi trạng thái; bổ sung unit test và cập nhật danh sách công việc còn lại.
- **Phần tự làm hoặc đã chỉnh sửa:** Chốt mỗi sản phẩm thuộc đúng một nguồn bán là người dùng hoặc cửa hàng; chỉ chủ sở hữu đang hoạt động của cửa hàng được quản lý sản phẩm cửa hàng; sản phẩm mới luôn ở trạng thái `DRAFT`; tách cập nhật nội dung khỏi chuyển trạng thái; giới hạn chuyển trạng thái theo vòng đời `DRAFT`, `ACTIVE`, `HIDDEN`, `SOLD`, giữ `HELD` cho luồng giữ hàng nội bộ sau này; kiểm tra danh mục và cửa hàng đang hoạt động trước khi đăng bán; chưa cung cấp thao tác xóa khi chính sách lưu trữ chưa chốt.
- **Cách kiểm chứng:** `pnpm check` pass, gồm Oxlint, Prettier check, TypeScript typecheck và Nest build. `pnpm exec jest --runInBand` pass 7 test suites với 61 tests. `git diff --check` pass. Chưa kiểm thử HTTP E2E với PostgreSQL trong lần ghi log này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** TypeScript ban đầu báo lỗi do kiểu query dùng với decorator chưa được import bằng `import type` và mock `repository.save` bị suy luận sai overload; đã sửa theo đúng ngữ cảnh. Khi rà soát contract truy vấn, phát hiện bộ lọc service đã hỗ trợ tìm kiếm nhưng schema đầu vào chưa khai báo `search`; đã bổ sung trước khi chạy kiểm chứng cuối.
- **Minh chứng:** Branch `feat/product-module`; các thay đổi tại `src/modules/product`, `test/unit/modules/product/product.service.spec.ts`, `src/app.module.ts`, `docs/TODO.md` và mục nhật ký này.

### 2026-10-19 — Triển khai quản lý hình ảnh sản phẩm

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Triển khai module Media cho ảnh sản phẩm và chuyển luồng upload sang client tải trực tiếp lên Cloudflare R2; backend cấp quyền ngắn hạn, xác nhận object và quản lý metadata trong PostgreSQL.
- **Prompt chính:** Thiết kế lại luồng upload ảnh theo mô hình client tải trực tiếp lên R2 bằng presigned URL; backend chỉ cấp quyền ngắn hạn, xác nhận object và lưu metadata.
- **Đầu ra AI được sử dụng:** Hỗ trợ bổ sung provider storage qua DI token, presigned `PUT`, bước kiểm tra object bằng `HEAD`, DTO và schema cho ticket/xác nhận, service, controller, unit test, biến môi trường mẫu và tài liệu contract. API tiếp tục hỗ trợ đọc danh sách ảnh, đổi thứ tự, chọn ảnh bìa và xoá ảnh theo quyền quản lý sản phẩm.
- **Phần tự làm hoặc đã chỉnh sửa:** Chốt binary không đi qua API server; ticket chỉ được cấp sau khi kiểm tra quyền, MIME, kích thước và giới hạn sơ bộ. Bước xác nhận kiểm tra storage key thuộc đúng sản phẩm, MIME và kích thước trên R2 trước khi ghi database trong transaction. Giữ giới hạn tối đa 10 ảnh mỗi sản phẩm, 10 MB mỗi ảnh và dọn object khi xác nhận không hợp lệ hoặc không thể lưu metadata. Việc kiểm tra nội dung thực, tạo thumbnail và dọn ticket không được xác nhận được ghi nhận để nâng cấp sau.
- **Cách kiểm chứng:** `pnpm check` pass, gồm Oxlint, Prettier check, TypeScript typecheck và Nest build. `pnpm exec jest --runInBand` pass 8 test suites với 71 tests; riêng `MediaService` có 10 tests cho ticket, xác nhận object, giới hạn ảnh, sắp xếp, ảnh bìa và xoá. `git diff --check` pass. Chưa kiểm thử HTTP E2E với PostgreSQL và Cloudflare R2 thật trong lần ghi log này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Contract multipart ban đầu khiến file đi qua backend và tạo tải bộ nhớ/băng thông không cần thiết; đã thay bằng ba bước cấp ticket, client `PUT` trực tiếp và backend xác nhận object. Không ký `Content-Length` để tránh phụ thuộc header bị trình duyệt kiểm soát; kích thước được đối chiếu bằng `HEAD` ở bước xác nhận.
- **Minh chứng:** Branch `feat/media-module`; các thay đổi tại `src/modules/media`, `src/infrastructure/storage`, `src/modules/config`, `test/unit/modules/media/media.service.spec.ts`, `.env.example`, `docs/TODO.md` và mục nhật ký này.
