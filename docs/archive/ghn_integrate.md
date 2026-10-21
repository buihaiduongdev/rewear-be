# GHN Sandbox — Integration Testing & Implementation Notes

**Project:** Re.wear

**Backend:** NestJS, TypeScript, TypeORM, PostgreSQL

**Test date:** 2026-10-21

**Status:** Đã ghi nhận một phần luồng GHN Sandbox bằng công cụ thử nghiệm; chưa tích hợp ShippingModule trong backend

## 1. Mục tiêu

Tài liệu ghi lại kết quả kiểm thử tích hợp Giao Hàng Nhanh (GHN) trên môi trường Sandbox trước khi triển khai Backend.

Theo kết quả thử nghiệm được người thực hiện ghi lại, các nghiệp vụ đã kiểm tra gồm:

- Xác thực API Token và ShopId.
- Truy vấn danh mục địa chỉ.
- Tạo vận đơn thử nghiệm.
- Tra cứu chi tiết vận đơn.
- Cấu hình và nhận webhook.
- Mô phỏng thay đổi trạng thái vận chuyển.
- Nhận webhook khi giao hàng thành công.

**Lưu ý:** Đây là kết quả kiểm thử Sandbox, không phải xác nhận toàn bộ nghiệp vụ GHN đã sẵn sàng cho Production.

## 2. Môi trường kiểm thử

| Thành phần      | Địa chỉ                           | Mục đích                  |
| --------------- | --------------------------------- | ------------------------- |
| GHN Developer   | https://developer.ghn.dev         | Quản lý Token, webhook    |
| GHN API Sandbox | https://dev-online-gateway.ghn.vn | Gọi API thử nghiệm        |
| GHN Operations  | https://5sao.ghn.dev/ops-live     | Quản lý vận đơn Staging   |
| GHN Support     | https://hotro.ghn.dev/order       | Mô phỏng trạng thái đơn   |
| Webhook.site    | https://webhook.site              | Nhận và kiểm tra callback |

### Phân biệt thử nghiệm và cấu hình MVP

Payload và response ở mục 3–4 là lịch sử test COD (`cod_amount = 150000`, `payment_type_id = 2`), không phải mẫu cấu hình triển khai Rewear. Giữ nguyên giá trị test để không làm sai bằng chứng. MVP đã chốt buyer thanh toán online toàn bộ checkout, GHN không thu lại tiền hàng hoặc phí giao từ buyer; sàn trả cước qua tài khoản GHN chung và kho theo nguồn bán.

Khi triển khai, dùng `cod_amount = 0` và xác minh cấu hình người gửi/sàn chịu cước trên tài khoản Sandbox thực tế. Chưa ghi mã `payment_type_id` cho MVP là đã kiểm chứng chỉ từ test COD này. Thanh toán thành công và số dư vendor do Rewear quản lý; webhook giao hàng không chứng minh đã thu tiền hoặc đã chi vendor.

### Postman Environment

```env
GHN_BASE_URL=https://dev-online-gateway.ghn.vn
GHN_TOKEN=<STAGING_TOKEN>
GHN_SHOP_ID=<STAGING_SHOP_ID>
GHN_ORDER_CODE=<ORDER_CODE>
```

Token và thông tin đăng nhập không được commit vào Git.

### Test identifiers

```text
ShopId: 231898
ClientOrderCode: REWEAR-TEST-001
GHN OrderCode: L8MWYA
```

Các mã trên chỉ dùng làm dữ liệu tham chiếu cho quá trình test đã thực hiện.

## 3. API đã kiểm thử

### 3.1. Kiểm tra Token

**Endpoint:**

```http
GET /shiip/public-api/master-data/province
```

Headers:

```http
Token: {{GHN_TOKEN}}
ShopId: {{GHN_SHOP_ID}}
```

**Kết quả:** PASS.

API phản hồi thành công, xác nhận Token có thể truy cập dịch vụ GHN Sandbox.

### 3.2. Danh mục địa chỉ

Đã kiểm tra việc truy vấn danh mục tỉnh/thành và phường/xã của GHN.

Kết quả: PASS.

Hệ thống sử dụng địa chỉ hành chính mới theo mô hình hai cấp, không yêu cầu quận/huyện trong request tạo đơn khi dùng `is_new_from_address` và `is_new_to_address`.

Các trường tên địa chỉ phải khớp dữ liệu GHN.

### 3.3. Preview Order

**Endpoint:**

```http
POST /shiip/public-api/v2/shipping-order/preview
```

Preview được dùng để kiểm tra dữ liệu tạo vận đơn mà chưa tạo đơn thực tế.

Trong quá trình kiểm thử đã xuất hiện lỗi:

```json
{
  "code": 400,
  "message": "Address convert from fail:",
  "data": null,
  "code_message": "FROM_ADDRESS_CONVERT_FAIL",
  "code_message_value": "Chuyển đổi địa chỉ gửi không thành công. Vui lòng thử lại hoặc nhập thông tin địa chỉ cũ"
}
```

Nguyên nhân được xác định ở phần xử lý địa chỉ người gửi (FROM).

Sau khi bổ sung địa chỉ người gửi phù hợp mô hình hai cấp, API Create Order đã chạy thành công. Không có response Preview thành công riêng được lưu trong cuộc hội thoại, nên không đánh dấu Preview là PASS độc lập.

### 3.4. Create Order

**Endpoint:**

```http
POST /shiip/public-api/v2/shipping-order/create
```

Headers:

```http
Content-Type: application/json
Token: {{GHN_TOKEN}}
ShopId: {{GHN_SHOP_ID}}
```

Body đã dùng để test, với dữ liệu địa chỉ minh họa:

```json
{
  "payment_type_id": 2,
  "required_note": "CHOXEMHANGKHONGTHU",
  "client_order_code": "REWEAR-TEST-001",
  "from_name": "Rewear Test Shop",
  "from_phone": "0332190444",
  "from_address": "72 Lê Thánh Tôn, Phường Sài Gòn, TP. Hồ Chí Minh",
  "from_ward_name": "Phường Sài Gòn",
  "from_province_name": "Hồ Chí Minh",
  "is_new_from_address": true,
  "to_name": "Nguyen Van Test",
  "to_phone": "0987654321",
  "to_address": "72 Lê Thánh Tôn, Phường Sài Gòn, TP. Hồ Chí Minh",
  "to_ward_name": "Phường Sài Gòn",
  "to_province_name": "Hồ Chí Minh",
  "is_new_to_address": true,
  "cod_amount": 150000,
  "insurance_value": 150000,
  "service_type_id": 2,
  "content": "Áo thun secondhand",
  "weight": 500,
  "length": 25,
  "width": 20,
  "height": 5,
  "items": [
    {
      "name": "Áo thun secondhand",
      "quantity": 1,
      "price": 150000,
      "weight": 500
    }
  ]
}
```

**Response thực tế — PASS:**

```json
{
  "code": 200,
  "code_message_value": "",
  "data": {
    "order_code": "L8MWYA",
    "sort_code": "GXT-M-11-00",
    "trans_type": "truck",
    "total_fee": 20900,
    "expected_delivery_time": "2026-10-22T16:59:59Z"
  },
  "message": "Success",
  "message_display": "Tạo đơn hàng thành công. Mã đơn hàng: L8MWYA"
}
```

Response đã được rút gọn, chỉ giữ các trường quan trọng.

**Thông tin xác minh:**

- GHN OrderCode: `L8MWYA`
- ClientOrderCode: `REWEAR-TEST-001`
- Tổng phí: 20.900 VND
- COD: 150.000 VND
- Phương thức vận chuyển: `truck`

### 3.5. Detail Order

**Endpoint đã test:**

```http
POST /shiip/public-api/v2/shipping-order/detail
```

Body:

```json
{
  "order_code": "L8MWYA"
}
```

**Kết quả:** PASS.

Response `code: 200` xác nhận vận đơn đã được lưu trên GHN.

Những trường đã kiểm chứng:

```json
{
  "order_code": "L8MWYA",
  "client_order_code": "REWEAR-TEST-001",
  "shop_id": 231898,
  "status": "ready_to_pick",
  "cod_amount": 150000,
  "payment_type_id": 2,
  "is_cod_transferred": false,
  "is_cod_collected": false,
  "is_new_from_address": true,
  "is_new_to_address": true,
  "from_ward_id_v2": 1003506,
  "from_province_id_v2": 1000001,
  "to_ward_id_v2": 1003506,
  "to_province_id_v2": 1000001
}
```

Dữ liệu trên được rút gọn từ response thực tế.

GHN lưu song song thông tin địa chỉ cũ và mới sau khi chuyển đổi thành công.

## 4. Webhook

### 4.1. Cấu hình

Webhook được cấu hình tại:

https://developer.ghn.dev/account/webhook

Endpoint tiếp nhận thử nghiệm:

```text
https://webhook.site/<UNIQUE_ID>
```

Đã nhận thành công sự kiện `create` và `switch_status` do GHN gửi.

### 4.2. Webhook Create — PASS

Payload thực tế rút gọn:

```json
{
  "ShopID": 231898,
  "OrderCode": "L8MWYA",
  "ClientOrderCode": "REWEAR-TEST-001",
  "Type": "create",
  "Status": "ready_to_pick",
  "Description": "Tạo đơn hàng",
  "Time": "2026-10-21T06:31:35.651Z",
  "CODAmount": 150000,
  "TotalFee": 20900,
  "PaymentType": 2
}
```

GHN đã gửi event tạo vận đơn về webhook.site.

### 4.3. Mô phỏng chuyển trạng thái

Đã đăng nhập được vào:

https://hotro.ghn.dev/order
Thông tin đăng nhập Sandbox lưu ngoài repository; không ghi tài khoản/mật khẩu tại đây.

Cổng hỗ trợ Sandbox cho phép thao tác cập nhật trạng thái vận đơn thử nghiệm.

Các trạng thái quan sát được: (còn nhiều status trong giao diện chưa thử)

```text
ready_to_pick
    ↓
picking
    ↓
picked
    ↓
...
    ↓
delivered
```

**Lưu ý:** Những bước trung gian từ `picked` tới `delivered` chưa được ghi lại đầy đủ, không tự suy diễn toàn bộ state machine GHN từ chuỗi này.

### 4.4. Webhook Switch Status — PASS

Sau khi mô phỏng giao thành công, webhook.site đã nhận payload:

```json
{
  "ShopID": 231898,
  "OrderCode": "L8MWYA",
  "ClientOrderCode": "REWEAR-TEST-001",
  "Type": "switch_status",
  "Status": "delivered",
  "Description": "Cập nhật trạng thái đơn hàng",
  "Time": "2026-10-21T07:03:40.618Z",
  "CODAmount": 150000,
  "CODTransferDate": null,
  "TotalFee": 20900,
  "PaymentType": 1
}
```

Payload thực tế còn chứa trường `PodURL` là URL bằng chứng giao hàng, trong đó có tham số `hash`. Không công khai URL đầy đủ trên repository.

**Kết quả:** GHN đã chủ động phát webhook `switch_status` khi đơn chuyển sang `delivered`.

### 4.5. Những lưu ý từ webhook thực tế

**Tên trường:**

Webhook dùng PascalCase:

```text
OrderCode
ClientOrderCode
ShopID
Status
Type
Time
CODAmount
TotalFee
PaymentType
```

Trong khi API Detail dùng snake_case:

```text
order_code
client_order_code
shop_id
status
cod_amount
payment_type_id
```

Cần schema payload riêng và mapper sang mô hình nội bộ; không dùng schema response của Rewear để đọc trực tiếp webhook GHN.

Ngoài khác biệt cách đặt tên trường, create/detail ghi `payment_type_id: 2` nhưng webhook delivered ghi `PaymentType: 1`. Chưa xác định nguyên nhân chênh lệch giá trị này. Không tự động cập nhật người chịu phí dựa trên trường `PaymentType` của webhook trước khi xác minh.

**COD:**

Tại thời điểm giao thành công, GHN Operations hiển thị:

```text
Giao thành công
COD: 150.000 VND
Chờ chuyển COD
```

Đồng thời:

```json
{
  "Status": "delivered",
  "CODTransferDate": null
}
```

Vì vậy không được đồng nhất `delivered` với việc đã chuyển COD cho người bán.

## 5. Tổng kết kết quả kiểm thử

| Test case                          | Kết quả            |
| ---------------------------------- | ------------------ |
| API Token và ShopId                | PASS               |
| Danh mục địa chỉ                   | PASS               |
| Preview Order riêng biệt           | Chưa xác minh PASS |
| Create Order                       | PASS               |
| Detail Order                       | PASS               |
| Webhook `create`                   | PASS               |
| Mô phỏng cập nhật trạng thái       | PASS               |
| Webhook `switch_status: delivered` | PASS               |
| COD được chuyển về người bán       | Chưa test          |
| Hoàn hàng / giao thất bại          | Chưa test          |
| Webhook retry, trùng sự kiện       | Chưa test          |
| Xác thực webhook trong Backend     | Chưa triển khai    |

## 6. Định hướng triển khai Re.wear Backend

### Các thành phần đề xuất

```text
shipping/
├── controllers/
│   ├── shipping.controller.ts
│   └── ghn-webhook.controller.ts
├── services/
│   ├── shipping.service.ts
│   └── ghn.service.ts
├── schemas/
│   ├── shipping-input.schema.ts
│   ├── shipping.schema.ts
│   └── ghn-webhook.schema.ts
├── entities/
│   ├── shipment.entity.ts
│   └── shipment-event.entity.ts
└── enums/
    └── shipment-status.enum.ts
```

Đây là cấu trúc đề xuất, chưa phải module đã triển khai. Dùng Zod/Standard Schema, suy ra type từ schema; input validation và response serialization/OpenAPI theo convention hiện tại. Adapter GHN tách khỏi nghiệp vụ order và quyết toán; không đưa Token hoặc ShopId do client tự chọn vào luồng được tin cậy.

### Yêu cầu kiến trúc

1. Gọi GHN API từ NestJS, không gọi trực tiếp từ Next.js bằng Token bí mật.
2. Lưu GHN `OrderCode` liên kết với mã đơn Re.wear.
3. Tách `Order.status`, `Shipment.status` và `Payment.status`.
4. Lưu webhook event để phục vụ truy vết.
5. Xử lý idempotency, webhook trùng và sự kiện đến sai thứ tự.
6. Xác thực nguồn webhook bằng phương án được GHN hỗ trợ và cấu hình.
7. Trả phản hồi webhook nhanh, tránh xử lý nghiệp vụ dài ngay trong controller.
8. Có thể đồng bộ lại trạng thái bằng API Detail trong trường hợp bỏ lỡ sự kiện.
9. Bảo vệ thông tin cá nhân, Token và URL POD có chứa hash.
10. Không coi `delivered` là bằng chứng COD đã được chuyển cho người bán.

### State mapping

Chỉ những trạng thái thực tế đã quan sát hoặc nhận được mới được coi là đã xác minh:

| GHN Status      | Ý nghĩa         |
| --------------- | --------------- |
| `ready_to_pick` | Chờ lấy hàng    |
| `picking`       | Đang lấy hàng   |
| `picked`        | Đã lấy hàng     |
| `delivered`     | Giao thành công |

Các trạng thái còn lại cần tham khảo tài liệu GHN và bổ sung test trước khi chốt mapping.

## 7. Checklist triển khai và kiểm chứng còn lại

Các hạng mục dưới đây chưa được coi là PASS từ kết quả thử nghiệm hiện có:

- [ ] Tạo shop/kho cho từng nguồn bán dưới tài khoản chung của sàn; phân quyền ánh xạ kho và snapshot trên shipment.
- [ ] Tính cước checkout theo kho/kiện và đối chiếu phí khi tạo đơn.
- [ ] Tạo vận đơn `cod_amount = 0`, sàn chịu cước; xác minh bằng create, detail và webhook, làm rõ chênh lệch PaymentType.
- [ ] Test hủy đơn, giao thất bại, chuyển hoàn và vận đơn gửi trả.
- [ ] Test webhook trùng/sai thứ tự/retry và đồng bộ lại bằng Detail.
- [ ] Xác minh phương án bảo vệ webhook thực tế GHN hỗ trợ; chưa tin callback chỉ vì đúng OrderCode.
- Kiểm tra kiến trúc, entity, module và convention hiện tại của Re.wear trước khi viết code.
- Không tự giả định một webhook `delivered` đồng nghĩa với thanh toán thành công.
- Không hardcode Token, ShopId hoặc các mã vận đơn test trong business logic.
- Phân biệt dữ liệu thực tế của GHN với các quy tắc nghiệp vụ do Re.wear tự định nghĩa.
- Đối chiếu lại GHN Developer Documentation khi bổ sung những API chưa được kiểm thử.
- Thiết kế cơ chế an toàn cho retry, xử lý trùng, xác thực webhook và thứ tự sự kiện.

## 8. Tài liệu tham khảo

- GHN Developer: https://developer.ghn.dev/
- GHN Webhook: https://developer.ghn.dev/account/webhook
- GHN Sandbox Gateway: https://dev-online-gateway.ghn.vn/
- GHN Support Operations: https://hotro.ghn.dev/order
- GHN Staging Operations: https://5sao.ghn.dev/ops-live
- Webhook Testing: https://webhook.site/

---

**Kết luận:** Tài liệu ghi nhận test COD trên Sandbox từ tạo/tra cứu vận đơn đến webhook `delivered`; đây là kết quả thử bằng công cụ, chưa phải E2E trong Rewear. Chưa xác minh đủ cấu hình MVP online, sàn trả cước, kho vendor, quote, hủy/trả và bảo vệ webhook. Tiếp tục kiểm chứng theo checklist trước phần tích hợp tương ứng; COD settlement không thuộc MVP.
