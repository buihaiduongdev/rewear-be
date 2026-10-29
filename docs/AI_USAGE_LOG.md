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

### 2026-10-19 — Chuẩn hóa OpenAPI cho phản hồi đã serialize

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Mục đích và phạm vi:** Đồng bộ contract phản hồi runtime với tài liệu OpenAPI để frontend có thể sinh client có kiểu từ `/api/docs-json`, đồng thời tiếp tục dùng Zod để loại các trường không thuộc response công khai.
- **Prompt chính:** Thiết kế và triển khai khai báo OpenAPI cho các success response đang dùng cơ chế serialize, bảo đảm envelope, HTTP status và trường thời gian phản ánh đúng dữ liệu thực tế.
- **Đầu ra AI được sử dụng:** Hỗ trợ mở rộng decorator `Serialize` để đăng ký `ApiResponse`, tạo success-envelope schema dùng chung, chuẩn hóa giá trị thời gian thành chuỗi ISO 8601, khai báo HTTP 201 cho các endpoint tạo mới và bổ sung unit test cho serialization cùng JSON Schema. Sau khi rà soát tài liệu sinh ra, khóa `statusCode` theo đúng HTTP status của từng endpoint và chuẩn hóa phản hồi logout thành success envelope có schema.
- **Phần tự làm hoặc đã chỉnh sửa:** Chốt Orval thuộc phía frontend còn backend cung cấp OpenAPI; giữ error response ngoài phạm vi sinh client hiện tại; rà soát để schema tiếp tục loại field nhạy cảm, status trong OpenAPI khớp với status Nest trả về và mọi success endpoint đều có contract rõ ràng.
- **Cách kiểm chứng:** `pnpm check` pass, gồm Oxlint, Prettier check, TypeScript typecheck và Nest build. `pnpm exec jest --runInBand` pass 11 test suites với 77 tests. `git diff --check` pass. Khởi động Nest và tạo Swagger document thành công, không còn lỗi `Date cannot be represented in JSON Schema`; kiểm tra `/api/docs-json` xác nhận `statusCode` được giới hạn theo từng response (`200` hoặc `201`) và logout có success schema đầy đủ. Chưa chạy Orval ở frontend trong phạm vi thay đổi này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** `z.coerce.date()` trả về `Date`, nhưng Zod v4 không thể biểu diễn kiểu này trong JSON Schema nên ứng dụng lỗi khi tạo Swagger document. Đã thay các trường ngày giờ trong response schema bằng schema dùng chung, nhận `Date` ở runtime và xuất chuỗi ISO 8601 có định dạng `date-time` trong OpenAPI.
- **Minh chứng:** Branch `codex/openapi-response-schemas`; các thay đổi tại `src/common/decorators`, `src/common/interceptors`, `src/common/schemas`, các response schema/controller liên quan, `test/unit/common` và mục nhật ký này.

### 2026-10-20 — Lập kế hoạch triển khai nghiệp vụ backend

- **Công cụ:** Codex.
- **Mục đích và phạm vi:** Chuyển kết quả đối chiếu báo cáo, diagram và backend thành kế hoạch triển khai theo phụ thuộc, danh sách quyết định còn mở và tiêu chí nghiệm thu cho từng nhóm chức năng.
- **Prompt chính:** Xây dựng kế hoạch phát triển backend và danh sách công việc cần thiết dựa trên các sai khác đã phát hiện giữa yêu cầu, sơ đồ và implementation hiện tại.
- **Đầu ra AI được sử dụng:** Tạo `docs/IMPLEMENTATION_PLAN.md`; bổ sung nhóm công việc `PLAN-01` đến `PLAN-12`, quyết định `DEC-01` đến `DEC-08` và kịch bản kiểm chứng vào `docs/TODO.md`. Không sinh hoặc thay đổi mã nguồn ứng dụng.
- **Phần tự làm hoặc đã chỉnh sửa:** Người dùng yêu cầu lập kế hoạch; các lựa chọn nghiệp vụ còn mở được giữ ở trạng thái đề xuất. Chưa ghi nhận xác nhận của người thực hiện về các lựa chọn này; chưa chỉnh Docs, diagram hoặc tạo migration trong task lập kế hoạch.
- **Cách kiểm chứng:** Đối chiếu kế hoạch với bản rà soát ngày 20/10/2026, module hiện có, scripts kiểm tra và TODO hiện tại; kiểm tra whitespace, liên kết tài liệu local và tính nhất quán của mã công việc/quyết định. Chưa chạy test ứng dụng, database hoặc Sandbox vì thay đổi chỉ gồm tài liệu kế hoạch.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Không ghi nhận lỗi mới trong task lập kế hoạch. Kế hoạch giữ riêng bước xác minh khả năng đối tác và không coi các chức năng mới là đã triển khai.
- **Minh chứng:** `docs/IMPLEMENTATION_PLAN.md`, `docs/TODO.md` và mục nhật ký này; chưa có commit hoặc PR cho task này.

### 2026-10-20 — Refactor request validation sang Standard Schema

- **Công cụ:** Codex.
- **Mục đích và phạm vi:** Chuyển các request DTO của Rewear BE sang Zod schema/type suy ra và native `StandardSchemaValidationPipe`, tham khảo cách đăng ký pipe tại `be-marty-demo-2`; giữ nghiệp vụ, entity và response serialization hiện tại.
- **Prompt chính:** Triển khai refactor từ DTO class sang Standard Schema theo công việc đã ghi trong TODO, đồng bộ runtime validation, kiểu TypeScript và tài liệu OpenAPI.
- **Đầu ra AI được sử dụng:** Schema request cho Auth, User, Category, Shop, Product, User Address và Media; metadata body/query/param; factory cấu hình native validation; kiểm tra login trước strategy; xóa DTO class, custom ZodValidationPipe, Trim và nhánh itemsDto không có caller trong pagination. Nâng NestJS 12, TypeScript 6, cập nhật Node 24 LTS tối thiểu 24.9, cấu hình Jest/CI; bổ sung unit test, HTTP contract test và tài liệu.
- **Phần tự làm hoặc đã chỉnh sửa:** Người dùng yêu cầu triển khai refactor đã được mô tả. Chưa ghi nhận bước review thủ công của người thực hiện. Các giới hạn nghiệp vụ đang mở không được chốt hoặc triển khai trong task này; các chỉnh sửa tài liệu có từ trước được giữ lại. Ngày 21/10/2026, người dùng yêu cầu commit, push và tạo PR riêng cho phần refactor.
- **Cách kiểm chứng:** Kiểm chứng lại ngày 21/10/2026 trên Node 24.19.0: `pnpm check` pass; `pnpm test --runInBand` pass 12 suites/89 tests; `pnpm test:e2e --runInBand` pass 1 suite/18 tests với controller thật và persistence mock. HTTP kiểm chứng strict input, số/boolean, PATCH/null, query/defaults, UUID, thứ tự login, response envelope, 201/204, ISO date và GET `/api/docs-json`. Orval 8.43.0 sinh fetch client từ snapshot OpenAPI; TypeScript strict kiểm tra client pass. `pnpm peers check` không có lỗi peer; `git diff --check` pass. Chưa kiểm thử persistence PostgreSQL hoặc dịch vụ ngoài, không tạo/chạy migration.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Bản chuyển đổi đầu cần bổ sung wrapper optional để type PATCH không yêu cầu field bị bỏ qua; đã sửa và thêm test. TypeScript 6 cần khai báo lại các mặc định/rootDir/types của dự án. NestJS 12 ESM không chạy được với cấu hình Jest CommonJS cũ; phương án transpile framework gây lỗi import.meta nên đã bỏ, dùng Node 24 cùng VM modules native. ApiBody không nhận standardSchema ở phiên bản hiện tại, nên login khai báo schema ngay trên Body. Fixture ban đầu dùng tên enum provider viết hoa khác giá trị wire-format hiện có; đã sửa sang enum của dự án.
- **Minh chứng:** Branch `refactor/standard-schema-validation`; `src/common/validation.ts`, request schema/controller/service liên quan, `test/unit/common/schemas/request-input.schema.spec.ts`, `test/request-validation.e2e-spec.ts`, README và TODO. Lỗi validation giữ message dạng mảng, thêm errors có path; query thay chuỗi chung trước đây bằng mảng chi tiết. Login từ chối input không hợp lệ trước strategy, user ID nhận UUID validation; các thay đổi này được ghi rõ trong README.

### 2026-10-20 — Ghi nhận cải thiện hạ tầng từ Marty demo

- **Công cụ:** Codex.
- **Mục đích và phạm vi:** Ghi nhận các cải thiện có thể áp dụng từ `be-marty-demo-2` vào backlog kỹ thuật Rewear.
- **Prompt chính:** Cập nhật TODO theo kết quả đối chiếu hai backend, phân chia ưu tiên triển khai và các hạng mục cần đánh giá sau.
- **Đầu ra AI được sử dụng:** Bổ sung checklist HTTP/response, cấu hình database dùng chung, lint có thông tin kiểu, shutdown hooks, CI concurrency và đánh giá Observe; liên kết công việc database với PLAN-02, gộp mục bỏ qua envelope vào nhóm HTTP.
- **Phần tự làm hoặc đã chỉnh sửa:** Người dùng yêu cầu ghi nhận vào TODO; chưa triển khai các đề xuất hoặc ghi nhận review mã nguồn thủ công của người thực hiện. Chuyển Better Auth/Vitest nằm ngoài phạm vi.
- **Cách kiểm chứng:** Rà soát checklist với đánh giá đã thực hiện và PLAN-02; kiểm tra định dạng hai tài liệu và whitespace của diff. Không chạy test ứng dụng vì chỉ cập nhật tài liệu.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Không ghi nhận lỗi mới; các hạng mục được ghi rõ là chưa triển khai, việc tắt synchronize phụ thuộc kiểm chứng baseline/migration.
- **Minh chứng:** `docs/TODO.md` và mục nhật ký này.

### 2026-10-21 — Ghi nhận quyết định giỏ hàng và checkout

- **Công cụ:** Codex.
- **Mục đích và phạm vi:** Chuẩn hóa các quyết định đã được xác nhận trong trao đổi thành tài liệu nghiệp vụ để tiếp tục thiết kế và triển khai.
- **Prompt chính:** Ghi các quyết định đã chốt vào tài liệu riêng, cập nhật implementation plan và tài liệu liên quan trước khi tiếp tục làm rõ nghiệp vụ.
- **Đầu ra AI được sử dụng:** Tạo `docs/CHECKOUT_DECISIONS.md`; cập nhật plan, TODO và phần chữ của database proposal theo các quyết định về giỏ, nhóm thanh toán, bỏ món hết khả dụng, giữ hàng 10 phút, địa chỉ, phí vận chuyển và phạm vi database dev.
- **Phần tự làm hoặc đã chỉnh sửa:** Người thực hiện chốt không giữ hàng khi thêm giỏ, không quantity, chia đơn theo nguồn bán nhưng thanh toán chung, loại món hết khả dụng để tiếp tục checkout, deadline chung 10 phút không gia hạn, chặn sửa món HELD/tự mua, địa chỉ chung và phí vận chuyển riêng từng nguồn bán. Xác nhận DB dev trống, chưa cần migration; không thêm hộp xác nhận riêng khi giá thay đổi trước lúc giữ hàng. Tiếp tục chốt MVP chỉ thanh toán online sandbox, COD để sau (PAY-02). Chốt phạm vi đồ án chỉ cần demo authorize/capture/cancel, không yêu cầu hold đủ 72 giờ (PAY-03); tiếp tục chọn MoMo Sandbox làm provider thử nghiệm (PAY-04), chưa xác nhận API sandbox hoạt động. Chốt seller có 24 giờ xác nhận đơn, demo có thể cấu hình ngắn hơn (SELLER-01); mốc bắt đầu và hành vi quá hạn còn mở. Chốt tài khoản GHN chung của sàn, tạo kho theo nguồn bán và sàn ứng/trả cước; vendor không nhận khoản bù ship, hybrid nằm ngoài MVP (SHIPPING-02). Người thực hiện bổ sung giới hạn đồ án: GHN sandbox một tài khoản, chưa có hợp đồng riêng và chưa kiểm chứng số shop/kho, tốc độ API, đối soát cước quy mô sàn; cần làm việc với GHN trước triển khai thật.
- **Cách kiểm chứng:** Đối chiếu quyết định với trao đổi; rà soát các mốc thời gian và câu hỏi cũ trong plan/TODO/DB draft, kiểm tra liên kết local, định dạng Markdown và whitespace. Không chạy test ứng dụng vì chỉ cập nhật tài liệu; Google Docs, PlantUML và ảnh diagram chưa được đồng bộ trong task này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Đề xuất trước đó rollback toàn bộ khi một món hết khả dụng, giữ 15 phút và làm migration dev không phù hợp lựa chọn của người thực hiện; tài liệu được sửa theo quyết định mới. Đã chốt online sandbox qua MoMo; chính sách dòng tiền, hoa hồng/rút tiền, hoàn phí ship buyer và các deadline khác còn để mở.
- **Quyết định bổ sung:** PAY-05: người thực hiện chốt capture chung sau authorize, phân bổ theo order/vendor; seller từ chối/quá hạn hủy và refund riêng order, các order khác tiếp tục. Capture chưa mở quyền rút tiền vendor; chính sách quyết toán/rút tiền còn mở.
- **Quyết định bổ sung về quyết toán:** SETTLEMENT-01: người thực hiện giữ đủ 72 giờ sau giao thành công và không có tranh chấp để mở số dư; buyer xác nhận sớm chỉ đổi trạng thái đơn, không mở tiền/mất quyền khiếu nại. Tách thời hạn này khỏi authorize MoMo và chưa điều chỉnh mốc đặc tả khi chưa triển khai.
- **Quyết định bổ sung về cấu hình:** SETTINGS-01: người thực hiện xác nhận admin có thể cấu hình tham số hệ thống. Tài liệu ghi hoa hồng cấu hình được, mức khởi tạo còn mở; hướng triển khai gồm validation/quyền/audit và snapshot để cấu hình mới không hồi tố giao dịch cũ.
- **Quyết định bổ sung về rút tiền:** WITHDRAW-01: người thực hiện chốt vendor chủ động yêu cầu rút số dư tích lũy và chọn tài khoản nhận; tiếp tục chọn admin chuyển tiền bên ngoài, ghi nhận kết quả kèm mã giao dịch/chứng từ (WITHDRAW-02), chưa tích hợp API chi tiền MoMo trong MVP. Hướng thiết kế giữ tiền chờ rút, chống trùng và không tự suy ra chính sách trừ ví do khiếu nại muộn/cước phát sinh.
- **Quyết định bổ sung về hủy rút:** WITHDRAW-03: vendor chỉ hủy yêu cầu Chờ xử lý; khi admin nhận xử lý thì khóa hủy. Thiết kế cập nhật nguyên tử và hoàn số dư đúng một lần để tránh race giữa hai thao tác.
- **Minh chứng:** `docs/CHECKOUT_DECISIONS.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/TODO.md`, `docs/database-proposal.md`; chưa triển khai code hoặc đưa các tài liệu này vào PR Standard Schema.

### 2026-10-21 — Chốt phạm vi trả và hoàn tiền theo món

- **Công cụ:** Codex.
- **Mục đích và phạm vi:** Đối chiếu tab Báo cáo và ghi nhận phần còn thiếu trước khi triển khai tranh chấp.
- **Prompt chính:** Đọc lại quy tắc sẵn có, chỉ hỏi phần chưa rõ; ghi quyết định trả/refund theo món trong đơn nhiều món.
- **Đầu ra AI được sử dụng:** Bổ sung RETURN-01 vào decisions, plan, TODO và DB draft; ghi rõ phí ship/hoa hồng, thời điểm mở phần tiền không tranh chấp còn mở.
- **Phần tự làm hoặc đã chỉnh sửa:** Người thực hiện đồng ý chỉ trả và hoàn món được chấp thuận, các món khác giữ nguyên; không mặc định hủy toàn bộ order.
- **Cách kiểm chứng:** Đọc trực tiếp tab Báo cáo, đối chiếu QĐ_QTV05, Quy tắc 11 và use case tranh chấp; kiểm tra định dạng/whitespace tài liệu. Chưa sửa Google Docs hoặc diagram trong lần ghi RETURN-01, chưa triển khai/test ứng dụng.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Báo cáo chưa phân định phạm vi hoàn trong đơn nhiều món; không suy ra chính sách phí hoặc mở tiền từng item từ quyết định này.
- **Quyết định bổ sung:** RETURN-02: người thực hiện chốt chỉ phong tỏa riêng khoản phí ship hai chiều vendor chịu khi có khiếu nại và xác định lỗi vendor. Tài liệu phân biệt khoản giữ với thu phí, khóa tiền hàng và các trường hợp thiếu số dư/phân bổ cước chưa chốt.
- **Quyết định bổ sung về số tiền hoàn:** RETURN-03: buyer nhận đủ tiền phần được trả/hoàn và phí giao đi đã trả khi vendor có lỗi, không chịu cước hai chiều; các món/order không trả giữ nguyên. Cước chung khi trả một phần còn cần chốt cách phân bổ.
- **Minh chứng:** RETURN-01/02/03 trong CHECKOUT_DECISIONS.md, diagram tranh chấp và các tài liệu liên quan.

### 2026-10-21 — Đồng bộ diagram checkout và luồng tiền MVP

- **Công cụ:** Codex, PlantUML 1.2026.9 và Graphviz cho render local.
- **Mục đích và phạm vi:** Cập nhật một phần diagram theo các quyết định đã chốt, tách luồng tiền thực khỏi số dư nội bộ, bổ sung quyết toán và rút tiền vendor.
- **Prompt chính:** Hoàn thiện phần diagram có đủ quy tắc, đánh dấu chính sách còn mở thay vì tiếp tục hỏi các chi tiết kỹ thuật nhỏ.
- **Đầu ra AI được sử dụng:** Cập nhật 8 diagram checkout/payment/order/shipping/dispute; thêm 3 diagram tại `docs/diagrams/finance`; tạo danh mục/trạng thái trong `docs/diagrams/README.md`, đồng bộ tiến độ trong decisions, plan và TODO. Xuất 11 cặp PNG/SVG vào thư mục output của workspace, không thêm dependency ứng dụng.
- **Phần tự làm hoặc đã chỉnh sửa:** Người thực hiện chốt các quyết định trong CHECKOUT_DECISIONS.md; yêu cầu cập nhật phần đã đủ thông tin. Chính sách tranh chấp/phí chưa chốt giữ nhãn còn mở, không suy diễn thời điểm SOLD hoặc quyền khấu trừ muộn.
- **Cách kiểm chứng:** Render 11 diagram PNG và SVG thành công; xem ảnh các luồng tiền, quyết toán, rút tiền và tranh chấp; rà soát thời hạn 10 phút/24 giờ/72 giờ, capture chung/refund theo order và tài khoản GHN chung. Kiểm tra định dạng Markdown, liên kết local và whitespace. Không chạy test ứng dụng vì chỉ đổi tài liệu; không kiểm thử API sandbox, chưa sửa Google Docs hoặc diagram domain/product/use case.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Sơ đồ cũ còn 15 phút, COD, nhập mã vận đơn thủ công và mở tiền khi buyer hoàn tất sớm; đã sửa trong phạm vi cập nhật. Khi sinh source, newline trong nhãn ban đầu cần chuyển sang escape PlantUML trước khi render; đã sửa và render lại.
- **Minh chứng:** `docs/diagrams/README.md`, source PlantUML liên quan; ảnh tại `output/diagrams/2026-10-21-money-flow` của workspace Rewear. Chưa commit/push các thay đổi tài liệu này.

### 2026-10-21 — Làm rõ hoàn ship và khiếu nại do lỗi buyer

- **Công cụ:** Codex.
- **Prompt chính:** Chuẩn hóa quyết định trả một phần, yêu cầu hoàn ship và nguyên tắc không hoàn tiền khi lỗi buyer.
- **Phần người thực hiện quyết định:** Trả một phần chỉ nhận tiền món; có lựa chọn yêu cầu hoàn ship để admin duyệt. Lỗi buyer được xem là đơn hoàn tất, không phải căn cứ trả/hoàn.
- **Đầu ra AI được sử dụng:** Cập nhật RETURN-03/04, plan/TODO/DB draft và diagram tranh chấp. Phân biệt hoàn tất đơn với mở tiền sau 72 giờ; không kết luận lỗi buyer chỉ vì thiếu video và không thu cước giao đi trùng khoản buyer đã trả.
- **Kiểm chứng:** Kiểm tra định dạng/whitespace tài liệu và render lại diagram tranh chấp PNG/SVG; chưa cập nhật Google Docs hoặc code ứng dụng.

### 2026-10-21 — Chốt thời hạn phản hồi và trả hàng

- **Công cụ:** Codex.
- **Prompt chính:** Ghi nhận các deadline mặc định xử lý khiếu nại/trả hàng đã được chấp thuận.
- **Phần người thực hiện quyết định:** Seller phản hồi 24 giờ; buyer gửi trả trong 3 ngày sau chấp thuận; vendor xác nhận trong 48 giờ từ GHN giao trả thành công. Quá hạn seller/vendor chuyển admin, không tự refund do im lặng; admin cấu hình các mốc.
- **Đầu ra AI được sử dụng:** RETURN-05, cập nhật plan/TODO/DB draft và diagram tranh chấp; lưu deadline theo cấu hình đã áp dụng, không hồi tố.
- **Kiểm chứng:** Kiểm tra định dạng/whitespace và render lại diagram PNG/SVG; chưa cập nhật Google Docs hoặc triển khai code. Nhánh buyer quá hạn và giao trả thất bại chưa được coi là đã chốt thêm.

### 2026-10-21 — Đồng bộ phần chữ Báo cáo Google Docs

- **Công cụ:** Codex và Google Docs connector.
- **Prompt chính:** Đồng bộ nhóm checkout/thanh toán/vận chuyển/trả-hoàn đã chốt vào tab Báo cáo, đối chiếu nội dung sẵn có và giữ cấu trúc tài liệu.
- **Đầu ra AI được sử dụng:** Sửa 60 đoạn quy tắc/use case hiện có trong tab t.0: deadline 10 phút, không COD trong MVP, MoMo authorize/capture chung, order độc lập, GHN tài khoản sàn, mở số dư sau 72 giờ, rút thủ công và RETURN-01 đến RETURN-05. Cập nhật tiến độ trong tài liệu local.
- **Phần người thực hiện quyết định:** Các quyết định trong CHECKOUT_DECISIONS.md và yêu cầu đồng bộ theo nhóm đã chốt. Chính sách chưa xác định được giữ ở trạng thái cần hoàn thiện, không tự chọn mức hoa hồng hoặc nguồn tiền khi vendor thiếu số dư.
- **Cách kiểm chứng:** Đọc tab Báo cáo trước ghi; batch có requiredRevisionId và phạm vi t.0, đọc lại xác nhận đủ 60 nội dung mới. Số paragraph/table/image của tab không đổi; các tab khác giữ nguyên sau khi loại URL ảnh tạm thời đổi theo lần đọc. Không thay ảnh diagram hoặc thêm bảng/use case wallet/withdrawal/settings riêng; không kiểm chứng bố cục PDF hoặc API sandbox trong task này.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Một đoạn thay theo text không khớp ở lần đầu; dùng range paragraph hiện tại trong batch có revision guard và đọc lại xác nhận. URL contentUri của một ảnh ở tab khác thay đổi do URL tạm, nội dung/ID ảnh không đổi; không coi là chỉnh sửa tab đó.
- **Minh chứng:** Google Docs document 1iSOPW66vllAYl5PjRUGdEqCqoB3ZvL_9gCXr2o7c9DQ, tab t.0; decisions, plan và TODO local. Mã nguồn ứng dụng chưa thay đổi trong task đồng bộ này.

### 2026-10-21 — Thay ảnh diagram trong Báo cáo Google Docs

- **Công cụ:** Codex, Google Docs connector, PlantUML 1.2026.9, Graphviz và công cụ xuất/đọc PDF.
- **Prompt chính:** Xuất diagram đã cập nhật thành ảnh và thay các hình tương ứng trong tab Báo cáo, kiểm tra nội dung và bố cục sau thay.
- **Đầu ra AI được sử dụng:** Tạo 8 bản bố cục A4 tại `docs/diagrams/report`, xuất PNG/SVG và thay 8 ảnh checkout/payment/order/shipping/dispute; căn ảnh, caption và sửa ngắt trang trong phạm vi các hình đã thay. Cập nhật danh mục, decisions, plan và TODO.
- **Phần người thực hiện quyết định:** Yêu cầu thay ảnh trực tiếp trong báo cáo; quy tắc nghiệp vụ theo CHECKOUT_DECISIONS.md. Chưa ghi nhận người thực hiện tự kiểm tra các ảnh mới.
- **Cách kiểm chứng:** Batch ghi có revision guard; đọc lại xác nhận đủ 8 ID ảnh mới, các ID cũ tương ứng đã được thay. Tab Báo cáo giữ 28 ảnh và 34 bảng, nội dung chữ giữ nguyên khi bỏ khác biệt khoảng trắng do xóa đoạn trống; 7 tab khác không đổi sau khi loại URL ảnh tạm. Xuất PDF và xem đủ 8 hình, kiểm tra caption/ngắt trang; kiểm tra định dạng Markdown và whitespace. Không chạy test ứng dụng hoặc API sandbox vì chỉ cập nhật tài liệu.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Bản xuất đầu còn ngắt trang thủ công làm tách caption và tạo trang trống; đã bỏ ngắt/đoạn trống liên quan, điều chỉnh kích thước ảnh checkout và xuất lại để kiểm tra.
- **Phần chưa hoàn tất:** Ảnh domain/ERD/product/use case chưa thay; 3 diagram finance mới chưa chèn vào báo cáo. Không coi toàn bộ PLAN-01 đã hoàn thành.
- **Minh chứng:** `docs/diagrams/report/README.md`; tab t.0 của Google Docs; ảnh và PDF kiểm tra tại `output/diagrams/docs-image-sync` trong workspace Rewear. Chưa commit/push thay đổi tài liệu này.

### 2026-10-21 — Đơn giản hóa thanh toán và giữ số dư vendor

- **Công cụ:** Codex, Google Docs connector, PlantUML và công cụ kiểm tra PDF.
- **Prompt chính:** Chuyển sang thanh toán thu tiền ngay, quản lý số dư chờ quyết toán tại Rewear và giảm phụ thuộc vào cơ chế hold của cổng.
- **Phần người thực hiện quyết định:** Buyer thanh toán một lần, sàn ghi nhận tiền ngay khi xác minh thanh toán thành công; Rewear giữ khoản phải trả vendor đến khi đủ điều kiện quyết toán. Không yêu cầu authorize/capture thủ công hoặc giữ tiền 72 giờ tại MoMo.
- **Đầu ra AI được sử dụng:** Thay thế PAY-03/04/05, cập nhật plan/TODO/DB draft và diagram chi tiết/bản báo cáo; sửa 8 đoạn trong tab Báo cáo và thay lại 4 ảnh liên quan. Adapter cổng phụ trách tạo thanh toán/xác minh/query/refund; quyết toán, khiếu nại và rút tiền là logic dùng chung. Phân biệt ghi nhận thanh toán với lịch tiền về ngân hàng merchant.
- **Kiểm chứng:** Render diagram thay đổi; đọc lại xác nhận 8 đoạn và 4 ảnh mới, các tab khác không đổi sau khi bỏ URL ảnh tạm; xuất PDF để kiểm tra các hình. Kiểm tra định dạng và whitespace tài liệu. Không thay code ứng dụng, không thử API MoMo; chế độ thanh toán thực tế trên tài khoản Sandbox còn cần xác minh.
- **Điều chỉnh đề xuất trước:** Loại yêu cầu demo hold và các trạng thái authorize/capturing khỏi thiết kế MVP; không xóa log lịch sử của quyết định cũ. Mốc giữ hàng 10 phút và chờ quyết toán 72 giờ giữ nguyên.
- **Minh chứng:** CHECKOUT_DECISIONS.md, IMPLEMENTATION_PLAN.md, TODO.md, database-proposal.md, source diagram và tab Báo cáo; bản xuất kiểm tra tại `output/diagrams/direct-payment` trong workspace Rewear. Chưa commit/push.

### 2026-10-21 — Hoàn thiện domain, ERD và sơ đồ tài chính trong Báo cáo

- **Công cụ:** Codex, Google Docs connector, PlantUML, Graphviz và công cụ kiểm tra PDF.
- **Prompt chính:** Hoàn thiện phần đồng bộ thiết kế còn thiếu: domain, ERD, product state, use case và ba sơ đồ luồng tiền/quyết toán/rút tiền.
- **Phần người thực hiện quyết định:** Đồng ý tiếp tục đồng bộ theo các quyết định đã chốt; chỉ rõ source domain cần xem xét. Mốc SOLD lấy từ Quy tắc 1 đã có trong Báo cáo, không tự coi là quyết định nghiệp vụ mới. Các quyền và chính sách còn mở giữ nhãn dự thảo.
- **Đầu ra AI được sử dụng:** Sửa quan hệ nhiều giỏ cùng lưu sản phẩm, checkout nhiều order, order nhiều item, thanh toán chung và vận đơn giao/trả. Bổ sung ERD phân bổ/refund theo món, sổ số dư và yêu cầu rút; giữ thiết kế bảng mới ở Draft. Cập nhật product state và 6 use case bị ảnh hưởng. Lưu bản báo cáo rút gọn riêng, thay 8 ảnh và thêm 5 ảnh (3 finance, 2 ERD); bổ sung UC-FIN-01..04, sửa số mục trùng và caption chương 3. Cập nhật danh mục/plan/TODO/decisions.
- **Cách kiểm chứng:** Render PNG/SVG source thay đổi; đọc lại xác nhận 13 ảnh mới và không còn marker chèn ảnh. Tab Báo cáo tăng từ 28 lên 33 ảnh, giữ 34 bảng; 7 tab khác không đổi sau loại URL ảnh tạm. Xuất PDF, xem 13 hình và sửa heading bị tách khỏi ảnh/caption; kiểm tra định dạng Markdown, liên kết local và whitespace. Không thay mã ứng dụng, không chạy migration/test API đối tác.
- **Lỗi hoặc đề xuất sai của AI đã phát hiện:** Source sinh ban đầu có newline nhãn PlantUML và alias entity chưa đặt dấu ngoặc kép, đã sửa và render lại. Diagram chi tiết rộng nên lưu riêng bản báo cáo rút gọn có ánh xạ; không tuyên bố hai bản chứa cùng mọi chi tiết. Danh mục cũ còn ghi toàn bộ ảnh chưa chèn và SOLD chưa có quy tắc; đã đối chiếu và sửa trạng thái.
- **Giới hạn:** PLAN-01 vẫn mở: hoa hồng, ngưỡng/phí rút, quyền tiền shop/staff, thiếu số dư, deadline bàn giao và thử nghiệm đối tác chưa được chốt hoặc xác minh đầy đủ. Các mô tả UC-FIN chưa thay thế acceptance criteria cuối. Không tuyên bố code/entity hiện tại đã khớp mô hình đích.
- **Minh chứng:** `docs/diagrams/README.md`, `docs/diagrams/report/README.md`, `docs/diagrams/data-model/README.md`, DB draft và tab t.0 của Google Docs; bản xuất tại `output/diagrams/remaining-sync` trong workspace Rewear. Chưa commit/push.

### 2026-10-21 — Cập nhật sequence đăng tin và ghi chú GHN

- **Công cụ:** Codex, Google Docs connector, PlantUML và công cụ kiểm tra PDF.
- **Prompt chính:** Sửa các tài liệu còn cũ sau đợt đồng bộ thiết kế: sequence đăng sản phẩm và ghi chú thử nghiệm GHN.
- **Phần người thực hiện quyết định:** Đồng ý cập nhật hai nhóm tài liệu theo quy tắc đã chốt; không bổ sung tính năng ứng dụng trong đợt sửa tài liệu này.
- **Đầu ra AI được sử dụng:** Sequence mô tả tạo DRAFT, xin presigned PUT, upload trực tiếp lên storage, confirm object rồi workflow gửi/duyệt revision. Phân biệt upload hiện có với submit/review và khóa HELD chưa triển khai đầy đủ. Thay ảnh tại mục 3.7.2 Báo cáo. GHN notes giữ nguyên payload COD làm bằng chứng test, tách rõ MVP online/COD bằng 0/sàn trả cước, đổi cấu trúc đề xuất sang schema, bỏ thông tin đăng nhập và thêm checklist kho vendor/quote/hủy/trả/bảo vệ webhook. Ghi nhận kết quả test bằng công cụ trong plan/TODO, không coi là E2E backend.
- **Kiểm chứng:** Đọc product/media service hiện tại, render sequence và xem ảnh; đọc lại ID ảnh mới, các tab khác không đổi khi loại URL ảnh tạm; xuất PDF và xem trang chứa sequence mới. Kiểm tra Markdown/whitespace và xác nhận file GHN không còn thông tin đăng nhập hoặc cấu trúc dto. Không chạy test ứng dụng, không thử API GHN/MoMo và không chỉnh mã backend.
- **Điều chỉnh khi kiểm tra:** Sửa escape newline và bố cục legend để ảnh đọc được trong trang báo cáo. Không đổi dữ liệu test COD thành cấu hình MVP rồi gắn nhãn PASS.
- **Minh chứng:** `docs/ghn_integrate.md`, source sequence chi tiết/bản báo cáo, plan/TODO và Google Docs tab t.0; PDF/ảnh kiểm tra tại `output/diagrams/docs-cleanup` trong workspace Rewear. Chưa commit/push.

### 2026-10-21 — Gộp source diagram theo loại

- **Công cụ:** Codex.
- **Prompt chính:** Tổ chức lại thư mục diagram theo loại, bỏ việc duy trì riêng bản báo cáo trùng source.
- **Phần người thực hiện quyết định:** Đồng ý bỏ cách chia `report/` và dùng một source cho mỗi diagram.
- **Đầu ra AI được sử dụng:** Bỏ 19 bản rút gọn trùng trong `report/`, giữ các source chi tiết tương ứng. Chuyển quyết toán sang `state-machine/`, rút tiền sang `activity/`, luồng tiền sang `data-flow/`; bỏ thư mục `finance/` rỗng. Gom ánh xạ vị trí báo cáo vào `docs/diagrams/README.md`, sửa liên kết hiện hành trong plan/TODO/decisions. Giữ log lịch sử nguyên nội dung cũ.
- **Kiểm chứng:** Xác nhận từng bản trùng có source chi tiết trước khi bỏ; kiểm tra liên kết Markdown local, thư mục và whitespace. Không thay nội dung source chi tiết, ảnh đã chèn trên Google Docs hoặc mã ứng dụng; không cần chạy test ứng dụng/render lại cho việc đổi đường dẫn.
- **Giới hạn:** Ảnh hiện có trên Docs vẫn là bản xuất trước đợt gộp thư mục; lần cập nhật ảnh tiếp theo dùng source duy nhất và tối ưu bố cục tại source đó.
- **Minh chứng:** `docs/diagrams/README.md` và các thư mục theo loại; chưa commit/push.

### 2026-10-21 — Khôi phục source ảnh báo cáo sau khi xóa nhầm

- **Công cụ:** Codex, PlantUML metadata và so sánh ảnh render.
- **Prompt chính:** Tìm nguồn khôi phục các file trong report đã bị xóa khi yêu cầu thực tế chỉ là chuyển thư mục.
- **Sai sót:** AI tự coi 19 bản rút gọn là trùng và xóa bằng unlink; file không đi vào Trash. Hành động xóa vượt yêu cầu chuyển thư mục của người thực hiện.
- **Khắc phục:** Trích nguyên source @startuml..@enduml nhúng trong 19 PNG còn lưu; đặt file theo loại diagram với hậu tố .report.puml để tránh ghi đè bản chi tiết. Khôi phục 4 sequence vào sequences, cùng các activity/state/usecase/domain/data-flow còn lại. Sửa ánh xạ README tới đúng source đã dùng xuất ảnh Docs. Không dựng lại nội dung bằng phỏng đoán.
- **Kiểm chứng:** Render lại đủ 19 source đã khôi phục; cả 19 ảnh khớp ảnh gốc từng pixel. Xác nhận đủ 19 file .report.puml, liên kết local hợp lệ và kiểm tra whitespace. Giữ nguyên bản chi tiết và ảnh trên Google Docs.
- **Minh chứng:** docs/diagrams/README.md; output/diagrams/recovery/manifest.json và verification.json trong workspace Rewear. Source được khôi phục từ PNG metadata, không phải Trash hay Git. Chưa commit/push.

### 2026-10-21 — Dùng source đã xuất ảnh Docs làm bản chính

- **Prompt chính:** Mỗi hình Docs và source phải tương ứng 1:1; không giữ hậu tố .report hoặc bản cũ đã bị thay thế.
- **Phần người thực hiện quyết định:** Giữ đúng source của ảnh đang có trong Docs và bỏ các bản cũ không còn dùng cho cùng hình.
- **Đầu ra AI được sử dụng:** Đưa 19 source đã khôi phục về tên chuẩn tại thư mục theo loại, thay các bản chi tiết cũ tương ứng. Bổ sung danh mục đủ 27 source hiện giữ trong repository; không còn thư mục report hoặc file .report.puml.
- **Kiểm chứng:** SHA-256 xác nhận cả 19 source giữ nguyên byte so với bản khôi phục từ PNG, chỉ đổi đường dẫn/tên. Các bản khôi phục đã được render đối chiếu khớp 19/19 ảnh gốc ở bước trước. Xác nhận mọi source .puml đều có trong ánh xạ README; kiểm tra liên kết local và whitespace. Không thay ảnh Google Docs, không thay code ứng dụng.
- **Minh chứng:** docs/diagrams/README.md và source theo loại; chưa commit/push.

### 2026-10-21 — Điều chỉnh phạm vi tích hợp và giảm nội dung giao diện

- **Công cụ:** Codex, Google Docs connector và Figma MCP bridge.
- **Prompt chính:** Rà soát phạm vi nhà cung cấp thanh toán/vận chuyển và đơn giản hóa giao diện theo nghiệp vụ đã thống nhất.
- **Phần người thực hiện quyết định:** Không giới hạn hệ thống vào GHN/MoMo; tracking lượt xem chưa thuộc scope; giảm chữ, kiểu chữ và màu trang trí trong từng khu vực.
- **Đầu ra AI:** Cập nhật quyết định PAY-04/SHIPPING-02, plan, TODO, DB draft và hướng dẫn phạm vi/UI; sửa 19 đoạn trong tab Báo cáo. Giữ nguyên bằng chứng thử nghiệm GHN. Trên Figma bỏ Traffic, trạng thái nhận đơn/kết nối API trên header seller, rút gọn footer và nhãn, áp dụng hệ chữ DM Sans với Regular/SemiBold và giảm nền trang trí.
- **Kiểm chứng:** Đọc lại đủ 19/19 đoạn thay đổi trên Google Docs; kiểm tra ảnh mẫu quản lý sản phẩm, checkout, chat, ví và quản trị; kiểm tra định dạng tài liệu và whitespace. Không thay mã ứng dụng hoặc chạy test API.
- **Giới hạn:** Chưa cập nhật ảnh/source diagram để đổi nhãn provider; giữ ánh xạ 1:1 hiện tại và ghi TODO riêng. Chưa nghiệm thu toàn bộ prototype hoặc xác nhận các provider mới đã được tích hợp. Các phần người thực hiện tự kiểm tra/chỉnh sửa thêm chưa được xác nhận.

### 2026-10-21 — Đồng bộ nhãn nhà cung cấp trong diagram và ảnh Báo cáo

- **Công cụ:** Codex, PlantUML/Graphviz, Google Docs connector và Poppler.
- **Prompt chính:** Chuẩn hóa diagram nghiệp vụ bằng tên chung cho cổng thanh toán và đơn vị vận chuyển; cập nhật đồng thời source và ảnh báo cáo.
- **Phần người thực hiện quyết định:** Đổi các nhãn GHN/MoMo trên diagram thành tên chung; ưu tiên hoàn tất đồng bộ ảnh trước khi tiếp tục thiết kế UI/UX.
- **Đầu ra AI:** Sửa 12 source PlantUML, render PNG/SVG và thay đúng 12 ảnh ở các use case, activity, state, sequence và luồng tiền trong tab Báo cáo. Giữ đường dẫn source, caption và các quy tắc nghiệp vụ. Cập nhật danh mục/plan/TODO/phạm vi tích hợp.
- **Kiểm chứng:** Render 12/12 source thành công; không còn GHN/MoMo trong source .puml. Đọc lại Docs xác nhận vẫn 33 inline image, đủ 12 ảnh cũ được thay, chữ không đổi và các tab khác giữ nguyên sau loại URI ảnh tạm. Xuất PDF và xem 12 trang có ảnh cập nhật: tiêu đề/caption đi cùng ảnh, không bị cắt. Kiểm tra định dạng và whitespace.
- **Giới hạn:** Không thay mã ứng dụng hoặc bằng chứng thử nghiệm GHN; thay nhãn diagram không xác nhận nhiều provider đã tích hợp. Chưa commit/push.
- **Minh chứng:** docs/diagrams/README.md; output/diagrams/provider-neutral/manifest.json và docs-verification.json trong workspace Rewear.

### 2026-10-22 — Tổ chức tài liệu nguồn và liên kết giao diện

- **Công cụ:** Codex, Google Docs connector và Figma MCP bridge.
- **Prompt chính:** Tạo điểm vào ngắn gọn cho tài liệu repository, tổng hợp nhóm tính năng và liên kết Figma; chuyển sáu tài liệu quyết định, đề xuất, kế hoạch và ghi chú vào archive, giữ nội dung để tra cứu.
- **Phần người thực hiện quyết định:** Đặt liên kết Figma trong Markdown của repository; chương 4 của báo cáo đảm nhiệm trình bày giao diện.
- **Đầu ra AI:** Tạo docs/README.md, liên kết từ README dự án; chuyển sáu file vào docs/archive và sửa đường dẫn tương đối trong tài liệu liên quan. Giữ backlog và phân biệt phạm vi thiết kế với tính năng đã triển khai. Gỡ phần liên kết thêm nhầm vào báo cáo và ẩn các nút liên kết ngược vừa thêm trong Figma.
- **Kiểm chứng:** Đối chiếu sáu file lưu trữ với nội dung Git trước khi chuyển: chỉ đổi đường dẫn diagram tương đối; 84 đường dẫn Markdown nội bộ hợp lệ. Prettier kiểm tra README dự án và trang tổng quan đạt; git diff --check đạt. Đọc lại báo cáo xác nhận văn bản gốc được khôi phục, giữ 34 bảng và 33 ảnh, các thuộc tính liên kết/kiểu đoạn đã chỉnh được phục hồi.
- **Giới hạn:** Thay đổi chỉ gồm tài liệu; không xác nhận hoàn thiện các luồng nghiệp vụ hoặc tích hợp bên ngoài. Không ghi nhận người thực hiện tự kiểm tra toàn bộ diff.
- **Kiểm tra trước amend:** pnpm check đạt trên Node 24.19.0 (Oxlint, Prettier, typecheck và build); không chạy lại test ứng dụng vì chỉ thay đổi tài liệu.
- **Minh chứng:** docs/README.md, docs/archive, README.md, các README diagram và PR #16.

### 2026-10-27 — Rà soát và chuẩn bị PR contract đăng nhập cho Orval

- **Công cụ:** Codex, Git và GitHub CLI.
- **Prompt chính:** Kiểm tra lịch sử PR backend và tạo PR cho phần auth cleanup đang có trong working tree.
- **Phần người thực hiện quyết định:** Yêu cầu đưa diff auth hiện có lên PR riêng trước khi tiếp tục các hạng mục backend trong kế hoạch; frontend đã chuyển sang các endpoint credentials/OAuth riêng.
- **Đầu ra AI được sử dụng:** Rà soát diff tách `POST /auth/login` với `{ email, password }` và `POST /auth/oauth` với `{ provider, token }`; credentials gọi strategy trực tiếp, OAuth chọn strategy qua factory riêng, bỏ login guard và factory chung cũ. Đối chiếu schema/OpenAPI, trim tên trước validation, giới hạn email 255 ký tự, README và các test liên quan; chuẩn bị commit và mô tả PR. Không thay đổi payment, checkout, database schema hoặc chạy migration.
- **Kiểm chứng:** Trên Node 24.19.0, `pnpm check` pass (Oxlint, Prettier, TypeScript và Nest build); `pnpm test --runInBand` pass 12 suites/99 tests; `pnpm test:e2e --runInBand` pass 1 suite/29 tests. Prettier kiểm tra README/AI Usage Log và `git diff --check` đều pass.
- **Giới hạn:** HTTP contract test dùng controller thật nhưng mock strategy/service, không chứng minh đăng nhập với PostgreSQL hoặc xác minh Google token thật. Chưa kiểm chứng SMTP và E2E frontend/backend; không xác nhận người thực hiện đã tự review toàn bộ diff.
- **Minh chứng:** Branch `refactor/auth-orval-cleanup`; mục này được liên kết trong phần AI assistance của PR tương ứng.

### 2026-10-27 — Marketplace seed và factory dùng cho dev/E2E

- **Người thực hiện:** Hải Dương
- **Công cụ:** Codex
- **Prompt chính:** Tạo seed/factory cho dữ liệu để frontend gọi API thật thay cho mock; người thực hiện xác nhận giữ phần seed trong worktree product sau khi agent product hoàn tất.
- **Đầu ra AI được sử dụng:** `src/modules/database/seeds/` với factory thuần có override và UUID ổn định theo namespace; seed transaction cho 7 tài khoản, 6 danh mục, 3 shop, 36 sản phẩm, 108 ảnh, revision kiểm duyệt và liên kết giữ bằng chứng. Thêm `pnpm seed`, `pnpm test:seed`, cấu hình mẫu và `docs/SEEDING.md`. Chạy lại chỉ thêm bản ghi còn thiếu, không ghi đè chỉnh sửa hoặc truncate bảng. Không thêm dependency, gọi R2 hoặc gửi email.
- **Kiểm chứng:** Node 24.19.0: lint, format, typecheck và Nest build pass; 104 unit test pass; 4 test seed với PostgreSQL thật pass, kiểm tra public ProductService/response schema, duyệt pending, hash mật khẩu, chạy lặp đồng thời, giữ dữ liệu khác và rollback toàn bộ khi xung đột ownership. CLI seed đã chạy hai lần trên DB local riêng `rewear_seed_test`; kiểm đếm vẫn là 7 user, 36 product, 108 media, 35 revision. `git diff --check` pass.
- **Giới hạn:** Ảnh fixture dùng sáu URL Unsplash đã kiểm tra HTTP/MIME; ba slot góc ảnh dùng lại ảnh danh mục, không chứng minh tình trạng hàng thật. Chưa chạy luồng upload/delete R2 hoặc E2E trình duyệt với dataset này. Chưa seed DB dev đang dùng của ứng dụng, commit hoặc tạo PR.
- **Điều chỉnh trong quá trình làm:** Phần seed ban đầu được tạo trong worktree `rewear-be-product`, gây lẫn diff với agent product; không sửa product/media/category/storage của agent đó. Người thực hiện xác nhận không cần tách worktree sau khi agent product đã hoàn tất. Nhánh `feat/database-seeds` ở BE gốc chưa có code riêng. Do node_modules là symlink sang checkout gốc, kiểm tra dùng Node 24 và tắt bước tự kiểm tra/cài lại dependency của pnpm bằng biến môi trường trong phiên chạy; không thay cấu hình repo.
- **Minh chứng:** Worktree `rewear-be-product`, branch `feat/product-completion`; `docs/SEEDING.md` và các test seed mới. Các thay đổi vẫn chưa commit.

### 2026-10-27 — Hoàn thiện vòng đời product và chuẩn bị PR product/seed

- **Công cụ:** Codex, Git/GitHub CLI, Node 24, Jest, PostgreSQL 16 và Orval.
- **Prompt chính:** Hoàn thiện module product, tránh ghi đè công việc agent khác; sau đó đẩy một PR BE gồm product và seed, tách commit theo phần việc.
- **Phần người thực hiện quyết định:** Chọn tối thiểu ba ảnh khi gửi duyệt, khai báo góc chụp và gắn ảnh khuyết điểm; sửa nội dung/ảnh đưa tin về nháp để duyệt lại, đổi riêng giá giữ approval. Đồng ý đưa cả product và seed lên PR; chưa xác nhận tự review toàn bộ mã.
- **Đầu ra AI được sử dụng:** Theo định hướng đó, bổ sung draft thiếu thông tin, ảnh nháp theo quyền, workflow submit/approve/reject/suspend có revision và lịch sử, số đo bắt buộc theo danh mục, khóa HELD/SOLD và transaction cho sửa/duyệt/ảnh. Thêm coverUrl/mediaCount và bộ lọc, giữ bằng chứng ảnh, ký conditional PUT và retirement marker cho media. Viết kiểm thử PostgreSQL/HTTP, tài liệu contract; chuẩn bị hai commit và PR theo template. Phần seed do phiên Codex khác hỗ trợ được ghi riêng ở mục Marketplace seed.
- **Kiểm chứng:** Kiểm tra lại diff product và seed trên Node 24.19.0; Oxlint, Prettier, typecheck và Nest build pass; 14 unit suites/104 tests và 3 HTTP/PostgreSQL suites/51 tests pass, với cả PRODUCT_TEST_DATABASE_URL và SEED_TEST_DATABASE_URL trỏ tới hai database test local riêng. Trước khi gộp seed, product đã pass 100 unit test, 47 HTTP/PostgreSQL test, lint/format/typecheck/build; Orval sinh Axios, React Query v5, Zod và TypeScript check client tại thư mục tạm đạt. Các bộ HTTP dùng controller/role check thật, thay JWT bằng test identity guard; network storage được mock.
- **Giới hạn:** Chưa kiểm chứng R2 PUT/delete/CORS thực tế, luồng trình duyệt FE–BE, Google/SMTP hoặc triển khai. Ảnh fixture không phải bằng chứng tình trạng hàng; chưa seed database dev ứng dụng. Giữ synchronize theo chính sách dev hiện tại, không chạy migration/reset dev DB. Cần regenerate Orval cho FE và cấu hình CORS cho header If-None-Match. PR nối tiếp auth PR #17; không coi auth đã merge.
- **Minh chứng:** docs/PRODUCT_LIFECYCLE.md, docs/SEEDING.md, test/product-lifecycle.e2e-spec.ts, test/marketplace-seed.e2e-spec.ts và kết quả kiểm tra trong PR.

### 2026-10-28 — Cart backend và bàn giao contract cho Home

- **Công cụ:** Codex, Node 24, PostgreSQL 16, Jest và Orval.
- **Prompt chính:** Phân công cart BE cho phiên hiện tại, Home FE cho task FE-agent; hoàn thiện module cart và kiểm thử, sau đó tạo hai PR riêng theo yêu cầu người thực hiện.
- **Phần người thực hiện quyết định:** Triển khai cart theo CART-01/BUYER-01 và phạm vi PLAN-05 đã chốt; hai task trao đổi trực tiếp, tách worktree và database test để tránh ghi đè. Chưa xác nhận tác giả tự review toàn bộ diff.
- **Đầu ra AI được sử dụng:** Bổ sung CartModule, carts/cart_items với unique user/cart-product, JWT-scoped GET/PUT/DELETE, nhóm giỏ theo nguồn bán, current price/subtotal và availability. Không quantity hoặc giữ hàng; chặn món của cá nhân/shop owner, bảo vệ bản chưa duyệt khi listing đổi trạng thái, giữ món lỗi để xóa và kiểm tra lại khi checkout. Kiểm thử concurrency/ownership với module Nest và PostgreSQL thật; bổ sung CI/test DB, tài liệu API và OpenAPI cho FE-agent. Không chỉnh source frontend hay worktree product/seed.
- **Kiểm chứng:** Node 24.19.0; lint/format/typecheck/build đạt, 104 unit test và 75 HTTP/PostgreSQL test đạt, bao gồm 24 ca cart. Cart suite chạy trên database riêng rewear_cart_test ở cổng 55439; regression product/seed dùng hai database riêng cùng cluster. Các bài test dùng test identity guard thay JWT, còn controller/module/TypeORM/validation/serialization thực thi thật. Orval sinh Axios functions, React Query v5 và Zod từ cart OpenAPI; TypeScript check client sinh trong thư mục tạm đạt.
- **Giới hạn:** Chưa có checkout/reservation/payment, chưa kiểm chứng trình duyệt FE–BE hoặc JWT end-to-end. Chưa chạy migration/reset hay seed database dev. PR cart nối tiếp product/seed #18; Home FE có PR riêng. Staff policy giữ phạm vi hiện tại; không tự mở rộng quy tắc mua của staff.
- **Minh chứng:** Worktree rewear-be-cart, branch feat/cart từ 422401a; docs/CART.md, test/cart.e2e-spec.ts; OpenAPI tạm /tmp/rewear-cart-openapi.json. Kiểm tra trước PR chạy lại format/lint/typecheck/build, 104 unit test và 75 HTTP/PostgreSQL test trên ba database test riêng.

### 2026-10-28 — Làm rõ nguồn đặc tả cho session tiếp theo

- **Công cụ:** Codex.
- **Yêu cầu:** Lưu link Báo cáo Google Docs trong docs để session khác không cần người dùng gửi lại URL.
- **Phần AI hỗ trợ:** Đưa liên kết đã có trong docs/README.md thành mục Nguồn đặc tả riêng, ghi rõ tab t.0 và cách đối chiếu quyết định/code. Không sửa nội dung Google Docs hoặc nghiệp vụ ứng dụng.
- **Kiểm chứng:** Kiểm tra nguyên URL theo yêu cầu, Prettier và git diff --check; không chạy lại test ứng dụng vì chỉ thay đổi Markdown.

### 2026-10-29 — Checkout reservation foundation

- **Yêu cầu:** Triển khai BE/FE checkout, viết test và kiểm tra trên Chrome, tạo PR rồi tự review.
- **Đầu ra:** Checkout JWT-scoped; kiểm tra món trong giỏ và địa chỉ thuộc buyer; snapshot giá/địa chỉ; nhóm đơn tạm theo nguồn bán; deadline chung 600 giây; idempotency theo buyer/request; hủy và thu hồi giữ hàng hết hạn; client API cho FE.
- **Kiểm chứng:** 104 unit tests, 85 HTTP/PostgreSQL tests (10 checkout); typecheck, Oxlint và Nest build đạt. Các test DB dùng schema riêng trên PostgreSQL local; test HTTP thay JWT bằng fixture guard. Chrome FE–BE dùng JWT thật qua tài khoản seed trên database disposable.
- **Giới hạn:** Chưa có quote vận chuyển, thu tiền, đơn đã thanh toán hay fulfillment. Bảng checkout_orders lưu đơn tạm. Chưa có admin settings; 600 giây được snapshot ở checkout. Lifecycle dùng advisory lock chung và sweep chưa phân trang; xem CHECKOUT.md.
