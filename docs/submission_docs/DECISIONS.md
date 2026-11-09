# Nhật ký quyết định khi tổng hợp hồ sơ nộp

Mục đích: ghi lại điều người dùng đã xác nhận trong phiên brainstorm để dùng khi
soạn hồ sơ nộp. Đây là ghi nhận trao đổi, không tự thay thế quyết định nghiệp vụ
đã có trong tài liệu backend và không khẳng định tính năng đã triển khai.

## Khảo sát người dùng

| ID | Trạng thái | Quyết định |
| --- | --- | --- |
| SURVEY-01 | Đã chốt | Khảo sát cả người mua và người bán quần áo secondhand. |
| SURVEY-02 | Đã chốt | Không yêu cầu người tham gia phải từng mua hoặc bán; bao gồm cả người chưa từng giao dịch. |
| SURVEY-03 | Đã chốt | Địa bàn khảo sát là TP. Hồ Chí Minh. |
| SURVEY-04 | Đã chốt | Thu thông tin cơ bản gồm nhóm tuổi và nghề nghiệp; không thu tên hoặc số điện thoại. |
| SURVEY-05 | Đã chốt | Mục tiêu khảo sát là xác nhận nhu cầu/vấn đề người dùng để làm căn cứ xác định phạm vi Rewear. |
| SURVEY-06 | Đã chốt | Phiếu chủ yếu dùng câu hỏi chọn đáp án, thời lượng mục tiêu khoảng 5 phút. |
| SURVEY-07 | Đã chốt | Mục tiêu tối thiểu 30 phản hồi tổng cộng và có người thuộc cả nhóm mua lẫn nhóm bán; chưa đặt hạn ngạch riêng cho từng nhóm. |
| SURVEY-08 | Đã chốt | Trọng tâm gồm độ tin cậy thông tin sản phẩm, an toàn giao dịch và khó khăn khi tìm người mua/người bán. |
| SURVEY-09 | Đã chốt | Hỏi kênh người tham gia thường dùng để tìm hoặc đăng bán quần áo secondhand; cho phép chọn nhiều đáp án. |
| SURVEY-10 | Đã chốt | Hỏi ý định mua hoặc bán quần áo secondhand trong 12 tháng tới, kể cả người chưa có trải nghiệm. |
| SURVEY-11 | Đã chốt | Hỏi các yếu tố ảnh hưởng quyết định mua và rào cản đăng bán; câu hỏi về ưu tiên/khó khăn cho chọn tối đa 3 đáp án. |
| SURVEY-12 | Đã chốt | Phân nhóm trải nghiệm: chỉ từng mua, chỉ từng bán, từng mua và bán, chưa từng mua hoặc bán. |

## Thanh toán và giao hàng

| ID | Trạng thái | Quyết định |
| --- | --- | --- |
| PAY-SESSION-01 | Đã chốt trong phiên | Buyer thanh toán online một lần cho toàn bộ checkout, kể cả khi có sản phẩm từ nhiều người bán. |
| SHIPPING-SESSION-01 | Đã chốt trong phiên | Phí giao hàng tính riêng theo từng người bán/nguồn bán, sau đó cộng vào tổng thanh toán một lần của checkout. |
| ORDER-SESSION-01 | Đã chốt trong phiên | Nếu một người bán không thể giao, chỉ hủy order của người bán đó; các order khác trong cùng checkout vẫn tiếp tục. |
| REFUND-SESSION-01 | Đã chốt trong phiên; cập nhật theo REFUND-SESSION-02 | Khi hủy order vì người bán không thể giao, hoàn cả tiền hàng và phí giao hàng tương ứng vào ví tiền của buyer. Quyết định cũ hoàn bằng xu đã được thay thế. |
| COIN-SESSION-01 | Đã chốt trong phiên cũ; được làm rõ/thay thế bởi COIN-LIMIT-01 và COIN-EXPIRY-01 | Cách ghi cũ là tối đa 10% tổng checkout và xu không hết hạn. Quy tắc hiện hành: tối đa 10% tiền hàng, không gồm ship, không vượt số dư khả dụng; xu thưởng mua hàng không hết hạn, xu chương trình có thể có hạn được công bố trước. Refund bằng ví theo REFUND-SESSION-02, không phát sinh loại xu hoàn mới. |
| COIN-SESSION-02 | Đã chốt trong phiên; cách xử lý hủy order được thay thế bởi REFUND-SESSION-02 | Khi dùng xu cho checkout nhiều order, phân bổ phần giảm giá theo tỷ trọng giá trị từng order để tính phần xu áp dụng cho từng order. Nếu order bị hủy, toàn bộ giá trị order trước giảm (phần tiền đã trả cộng phần xu đã dùng) được hoàn vào ví tiền buyer, không trả xu lại thành xu. |
| COIN-SESSION-03 | Đã chốt | Chỉ trừ xu khỏi số dư buyer khi thanh toán checkout thành công. |
| SELLER-SESSION-01 | Đã chốt trong phiên | Thời hạn 24 giờ để người bán xác nhận order bắt đầu khi checkout được thanh toán thành công, bằng online hoặc toàn bộ bằng ví. Nếu người bán từ chối hoặc quá hạn, chỉ hủy order của người bán đó; refund theo REFUND-SESSION-02; các order khác tiếp tục. |
| SELLER-SESSION-02 | Đã chốt trong phiên | Nếu người bán không phản hồi trong 24 giờ kể từ khi checkout được thanh toán thành công, bằng online hoặc toàn bộ bằng ví, hệ thống tự động hủy riêng order đó; refund theo REFUND-SESSION-02; các order khác trong checkout tiếp tục. |
| REFUND-SESSION-02 | Đã chốt trong phiên; thay thế cách hoàn xu trước đó | Khi order bị hủy, toàn bộ giá trị order trước giảm, gồm phần tiền buyer đã trả và phần xu đã dùng, được hoàn vào ví tiền của buyer. Không trả lại thành xu; buyer có thể dùng toàn bộ số dư ví cho lần mua sau mà không bị giới hạn dùng xu 10% mỗi checkout. |
| WALLET-SESSION-01 | Đã chốt trong phiên | Buyer chỉ được chọn ví tiền để trả checkout nếu số dư ví đủ toàn bộ tổng checkout; không hỗ trợ kết hợp ví trả một phần và thanh toán online cho phần còn thiếu. Nếu ví đủ, buyer tự chọn trả toàn bộ checkout bằng ví hoặc thanh toán online. Số dư ví không chịu giới hạn 10% áp dụng cho xu. |
| WALLET-SESSION-02 | Đã chốt trong phiên | Thanh toán toàn bộ checkout bằng ví được xem là thanh toán thành công và bắt đầu thời hạn 24 giờ để người bán xác nhận. |
| WALLET-SESSION-03 | Đã chốt trong phiên cũ; bổ sung bởi nhóm RETURN-PARTIAL và WALLET-REFUND | Buyer không thể nạp tiền vào ví. Ngoài refund order bị hủy của phiên cũ, đã chốt refund giữ hàng một phần và refund theo quyết định từng vấn đề; điều chỉnh bút toán sai theo nhóm WALLET-EXCESS. Không coi các khoản này là mở chức năng nạp tiền. |
| WALLET-SESSION-04 | Đã chốt trong phiên | Buyer không thể rút số dư ví ra ngoài Rewear; số dư chỉ dùng thanh toán checkout trên Rewear. |
| SELLER-SESSION-03 | Đã chốt một phần | MVP chưa ghi nhận vi phạm/blacklist khi seller từ chối order. Có thể lưu log đơn giản các order seller từ chối/hủy như tính năng phụ; blacklist shop nếu hành vi lặp lại thường xuyên là hướng mở rộng, chưa cần chốt ngưỡng trong phạm vi hiện tại. |
| HOLD-REVIEW-01 | Đã xác nhận giữ nguyên | Giữ hàng 10 phút từ lúc checkout giữ hàng thành công; thêm vào giỏ không giữ hàng. Gửi lại cùng checkout không gia hạn deadline. |
| CHECKOUT-REVIEW-01 | Đã xác nhận giữ nguyên | Nếu một số món không còn khả dụng lúc checkout thì loại riêng món đó khỏi checkout và giỏ; các món còn khả dụng tiếp tục. Nếu tất cả món không khả dụng thì không tạo thanh toán. |
| CHECKOUT-REVIEW-02 | Đã xác nhận giữ nguyên trong phiên | Checkout dùng một địa chỉ giao hàng chung cho mọi order trong checkout và lưu snapshot; muốn giao đến địa chỉ khác thì tạo checkout riêng. Người dùng xác nhận đây là cách hoạt động mong muốn như Shopee và các sàn phổ biến. |

## Luồng ứng dụng

| ID | Trạng thái | Quyết định |
| --- | --- | --- |
| GUEST-SESSION-01 | Đã chốt trong phiên | Khách chưa đăng nhập được duyệt/tìm và xem chi tiết sản phẩm; cần đăng nhập để thêm sản phẩm vào giỏ và checkout. |
| CHAT-SESSION-01 | Đã chốt trong phiên | MVP có chat giữa người mua và shop. |
| CHAT-SESSION-02 | Đã chốt trong phiên | Mỗi cặp buyer–shop có một hội thoại chung; có thể gửi kèm thẻ sản phẩm hoặc đơn hàng làm ngữ cảnh, không tách hội thoại riêng theo từng sản phẩm/đơn hàng. |
| CHAT-SESSION-03 | Đã sửa theo xác nhận của người dùng | Chat MVP hỗ trợ văn bản, ảnh, video và thẻ sản phẩm/đơn hàng. Video cũng có thể dùng làm bằng chứng khiếu nại; không giới hạn video chỉ ở luồng khiếu nại. |
| RATING-SESSION-01 | Đã chốt trong phiên | MVP có đánh giá shop; không đánh giá riêng từng sản phẩm. |
| RATING-SESSION-02 | Đã chốt trong phiên | Mỗi buyer chỉ có một đánh giá cho mỗi shop; có thể cập nhật đánh giá khi mua lại. |
| RATING-SESSION-03 | Đã chốt trong phiên | Đánh giá shop gồm điểm 1–5 sao; bình luận và ảnh/video là tùy chọn. |
| PRODUCT-SESSION-01 | Đã chốt trong phiên | Mọi thay đổi trên tin đã duyệt, kể cả đổi giá, phải được admin duyệt lại trước khi nội dung mới hiển thị. |
| PRODUCT-SESSION-02 | Đã chốt trong phiên | Khi seller gửi duyệt bản sửa của tin đã duyệt, ẩn tin trong thời gian chờ; chỉ hiển thị lại sau khi bản sửa được admin duyệt. |
| SHOP-RBAC-SESSION-01 | Đã chốt một phần trong phiên | MVP có RBAC cho phép cấu hình linh hoạt quyền nhân viên shop; người được cấu hình quyền và ma trận quyền cụ thể sẽ được chốt riêng. |
| SHOP-RBAC-SESSION-02 | Đã chốt trong phiên | Chủ shop được cấu hình quyền nhân viên trong phạm vi shop của mình. |
| SHOP-RBAC-SESSION-03 | Đã chốt trong phiên | Giữ role `OWNER`; có role dựng sẵn `STAFF` với các quyền quản lý cơ bản. Chủ shop có thể tạo thêm role và chọn permission linh hoạt từ danh mục hệ thống. |
| SHOP-RBAC-SESSION-04 | Đã cập nhật; đơn giản hóa phân quyền | Chỉ Owner được mời/gỡ thành viên, tạo/sửa role, chọn permission và gán/đổi role. Manager và Staff chỉ vận hành theo permission được cấp, không thay đổi role/quyền của bất kỳ ai. Vẫn hỗ trợ role tùy chỉnh và nhiều role mỗi thành viên. Thay thế quyết định ủy quyền quản lý thành viên/role cho Manager trước đó. |
| SHOP-RBAC-SESSION-05 | Đã chốt trong phiên | Một thành viên có thể được gán nhiều role cùng lúc; quyền hiệu lực là phép hợp các tập permission của các role đã gán (`Set(permissions)`). |
| SHOP-RBAC-SESSION-06 | Đã chốt trong phiên | Sửa permission của role có hiệu lực ngay với tất cả thành viên đang được gán role đó. |
| SHOP-RBAC-SESSION-07 | Đã chốt trong phiên | Owner được chỉnh permission của role `STAFF` dựng sẵn như các role tùy chỉnh khác. |
| SHOP-RBAC-SESSION-08 | Không còn áp dụng; thay thế bởi SHOP-RBAC-SESSION-04 | Quy tắc trước đây giới hạn Manager cấp permission trong phạm vi quyền của mình không còn cần thiết vì Manager không được quản lý role/quyền. |
| SHOP-INVITE-SESSION-01 | Đã chốt trong phiên | Thêm nhân viên bằng lời mời; thành viên chỉ được kích hoạt sau khi chấp nhận lời mời. |
| SHOP-INVITE-SESSION-02 | Đã chốt trong phiên | Chỉ gửi lời mời cho người đã có tài khoản Rewear. |
| SHOP-INVITE-SESSION-03 | Đã chốt trong phiên | Lời mời nhân viên hết hạn sau 3 ngày nếu chưa được chấp nhận. |
| SHOP-INVITE-SESSION-04 | Đã chốt trong phiên | Owner có thể thu hồi lời mời chưa được chấp nhận. |
| SHOP-INVITE-SESSION-05 | Đã chốt trong phiên | Khi chấp nhận lời mời, nhân viên nhận các role owner đã chọn khi gửi lời mời. |
| SHOP-INVITE-SESSION-06 | Đã cập nhật theo SHOP-RBAC-SESSION-04 | Chỉ Owner được mời thành viên; không ủy quyền thao tác này cho Manager hoặc Staff. |
| SHOP-MEMBER-SESSION-01 | Đã chốt trong phiên | Nhân viên được tự rời shop bất kỳ lúc nào, không cần owner đồng ý. |
| SHOP-MEMBER-SESSION-02 | Đã chốt trong phiên | Một tài khoản chỉ được làm nhân viên tại một shop ở một thời điểm. |
| SHOP-MEMBER-SESSION-03 | Đã chốt trong phiên; mở rộng giới hạn SHOP-MEMBER-SESSION-02 | Mỗi tài khoản chỉ được tham gia một shop tại một thời điểm, dù là owner hay nhân viên. |
| SHOP-MEMBER-SESSION-04 | Được thay thế bởi SHOP-MODEL-SESSION-01 | Cách hiểu trước đó tách bán cá nhân với bán qua shop và coi tài khoản tạo shop là tài khoản doanh nghiệp không còn áp dụng. |
| SHOP-MODEL-SESSION-01 | Đã chốt trong phiên | Mọi người bán, dù cá nhân hay doanh nghiệp/shop lớn, đều phải tạo shop và dùng chung mô hình code. Khác biệt tên gọi nghiệp vụ không tạo hai nguồn bán riêng; shop có thể chỉ có owner hoặc mời thêm staff tùy nhu cầu. Thay thế cách hiểu trước đó rằng tạo shop đồng nghĩa tài khoản doanh nghiệp. |
| SHOP-VERIFY-SESSION-01 | Đã chốt trong phiên; làm rõ đối tượng xét duyệt | Admin xét duyệt đơn tạo shop; shop được duyệt mới được đăng bán. Không có bước admin duyệt riêng từng owner hoặc staff. |
| SHOP-BANK-SESSION-01 | Đã chốt trong phiên | Bắt buộc khai báo tài khoản ngân hàng nhận tiền của Owner ngay trong đơn tạo shop. Không đợi đến lần rút tiền đầu tiên mới khai báo. |
| SHOP-BANK-SESSION-02 | Đã chốt trong phiên | Shop có thể lưu nhiều tài khoản ngân hàng nhận tiền; thêm tài khoản mới bằng kiểm tra tự động qua API, không cần admin duyệt riêng. Chưa xác minh nhà cung cấp/API và mức kiểm tra số tài khoản, tên hoặc quyền sở hữu; không coi tích hợp này đã có trong code. |
| SHOP-BANK-SESSION-03 | Đã chốt trong phiên | Cho phép tài khoản ngân hàng nhận tiền khác tên Owner, miễn kiểm tra hợp lệ và Owner xác nhận sử dụng. Owner chịu trách nhiệm chọn đúng người nhận. |
| SHOP-ROLE-SESSION-01 | Đã cập nhật; thay tên Shop Admin | Dùng các role dựng sẵn `OWNER`, `MANAGER`, `STAFF`. Owner là chủ sở hữu, đứng hồ sơ định danh/tài khoản nhận tiền và có toàn quyền trong shop. Manager và Staff hoạt động theo permission; Manager có thêm các permission quản lý shop so với Staff. Tiếp tục hỗ trợ role tùy chỉnh theo SHOP-RBAC-SESSION-03. |
| SHOP-OWNER-SESSION-01 | Đã cập nhật; thay thế quyết định nhiều owner | Mỗi shop có một Owner duy nhất; có thể có nhiều Manager và Staff. |
| SHOP-OWNER-SESSION-02 | Không còn áp dụng | Quyết định trước đây cho nhiều owner quyền ngang nhau và thêm/gỡ lẫn nhau được thay thế bởi SHOP-OWNER-SESSION-01. |
| SHOP-OWNER-SESSION-03 | Đã cập nhật theo mô hình một owner | Shop không được còn 0 owner; owner phải chuyển quyền sở hữu trước khi rời shop. |
| NOTIF-SESSION-01 | Đã chốt trong phiên | Hệ thống thông báo MVP hỗ trợ 2 kênh: chuông thông báo trong ứng dụng (In-app notification) và gửi Email cho các sự kiện quan trọng (đơn hàng mới, admin xét duyệt đơn tạo shop / duyệt tin đăng, lời mời thành viên tham gia shop). |
| WISHLIST-FOLLOW-SESSION-01 | Đã chốt trong phiên | MVP hỗ trợ cả hai tính năng Lưu sản phẩm yêu thích (Wishlist) và Theo dõi Shop (Follow Shop). Buyer có trang xem danh sách sản phẩm đã lưu và danh sách các shop đang theo dõi để cập nhật hàng mới. |
| CATEGORY-SESSION-01 | Đã chốt trong phiên | Danh mục sản phẩm tổ chức theo mô hình phẳng 1 cấp (Flat categories) gồm các nhóm đồ chính (Áo, Quần, Đầm/Váy, Áo khoác, Giày dép, Phụ kiện/Túi xách...); không phân nhánh cây đa cấp trong MVP để tinh gọn việc đăng bán và tìm kiếm đồ secondhand. |
| FILTER-SESSION-01 | Đã chốt trong phiên | Bộ lọc tìm kiếm và khám phá sản phẩm MVP hỗ trợ: Danh mục (Category), Khoảng giá min–max, Độ mới/Tình trạng (Condition), Kích cỡ (Size), Khu vực/Tỉnh thành của shop và Sắp xếp (Mới nhất, Giá tăng dần, Giá giảm dần). |
| REPORT-SESSION-01 | Đã chốt trong phiên | MVP hỗ trợ tính năng Báo cáo vi phạm (Report) trên trang chi tiết sản phẩm và trang Shop. Người dùng có thể gửi báo cáo kèm phân loại lý do (hàng giả/nhái, hàng cấm, sai sự thật, phản cảm, lừa đảo...) cùng mô tả/ảnh bằng chứng để Admin xử lý vi phạm. |
| ADDRESS-SESSION-01 | Đã chốt trong phiên | Buyer có sổ địa chỉ (Address Book) cho phép lưu nhiều địa chỉ nhận hàng, chọn theo 3 cấp hành chính (Tỉnh/Thành, Quận/Huyện, Phường/Xã) và đặt 1 địa chỉ Mặc định. Khi checkout tự động chọn địa chỉ mặc định hoặc cho phép đổi sang địa chỉ khác trong sổ. |
| PROMO-SESSION-01 | Đã chốt trong phiên | Mô hình chợ thời trang secondhand mang đặc thù mỗi món là hàng độc bản (unique item, tồn kho = 1) nên MVP không hỗ trợ mã coupon/voucher giảm giá của Shop; giảm giá thanh toán duy nhất thông qua cơ chế Xu thưởng do sàn tài trợ (tối đa 10% tiền hàng theo COIN-SESSION-01..03). |
| DASHBOARD-SESSION-01 | Đã chốt trong phiên | Cả trang quản lý Shop và trang quản trị Admin đều có Dashboard trực quan với các biểu đồ (Charts): biểu đồ đường/cột thể hiện biến động doanh thu theo tuần/tháng, số lượng đơn hàng theo trạng thái, và top sản phẩm được quan tâm/lượt xem nhiều nhất. |
| ORDER-STATE-SESSION-01 | Đã xác nhận giữ nguyên theo diagram | Vòng đời đơn hàng chuẩn hóa theo đúng file sơ đồ `order_state_machine.puml` gồm 9 trạng thái: `waiting` (Chờ thanh toán) -> `pending` (Chờ xác nhận 24h) -> `preparing` (Đang chuẩn bị) -> `shipping` (Đang giao) -> `delivered` (Đã giao, chờ 72h) -> `completed` (Hoàn tất). Các nhánh rẽ gồm `dispute` (Đang khiếu nại), `returns` (Chờ trả/hoàn) và `cancelled` (Đã hủy). Hoàn tất không mở tiền ngay mà phải đủ 72h và không tranh chấp. |
| AI-FEATURE-SESSION-01 | Đã chốt trong phiên | Tính năng AI tích hợp trong ứng dụng hỗ trợ người bán viết mô tả sản phẩm (AI Description Suggestion): không xử lý nhận diện hình ảnh, hệ thống gọi Google Gemini API dựa trên các trường thông tin cơ bản người bán đã nhập ở form trước (tên món đồ, thương hiệu, chất liệu, độ mới/khuyết điểm...) để sinh văn bản mô tả chỉn chu, rõ ràng; người bán được xem trước và tùy ý chỉnh sửa trước khi gửi duyệt tin. |
| PAYOUT-SESSION-01 | Đã chốt trong phiên | Quy trình rút tiền của Shop (Shop Payout) trong MVP áp dụng duyệt thủ công: Owner tạo lệnh rút tiền từ số dư khả dụng về tài khoản ngân hàng đã đăng ký; hệ thống khóa số tiền vào trạng thái chờ rút; Admin tiếp nhận yêu cầu trên Admin Portal, chuyển khoản ngân hàng thủ công ngoài sàn và xác nhận đã chi tiền (kèm mã giao dịch/biên lai). Tự động chi tiền qua API ngân hàng là hướng nghiên cứu mở rộng sau này cho các shop uy tín. |

## Còn cần tổng hợp

- Soạn bộ câu hỏi khảo sát hoàn chỉnh, lựa chọn đáp án và nhánh câu hỏi theo vai trò.
- Rà lịch sử PR để lập bảng module/task cho hai thành viên; người dùng yêu cầu ghi tên mình ở các feature đã hoàn tất. Cần đối chiếu tên/đóng góp với bằng chứng PR trước khi xuất bản phân công.
- Tiếp tục hỏi và chốt các quy tắc nghiệp vụ còn lại trước khi soạn các hồ sơ yêu cầu nộp.
- Các ví dụ KPI, thời lượng giữ hàng, ngưỡng kỹ thuật và tiêu chí mẫu trên trang checklist không được xem là quyết định Rewear nếu chưa được xác nhận.

## Bổ sung từ hội thoại ngày 04–06/11/2026

Nguồn: các câu trả lời lựa chọn và yêu cầu bổ sung trực tiếp trong hội thoại tiếp
nối handoff PR #24. Ngày 05/11/2026, người dùng yêu cầu đọc lại README và lưu
toàn bộ phần đã chốt. Các ID dưới đây giữ theo nhãn đã dùng trong hội thoại.
Mọi dòng trong các bảng dưới có trạng thái **đã chốt nghiệp vụ trong hội thoại**;
không phải xác nhận code/API/DB đã triển khai hoặc đã nghiệm thu. Phạm vi câu hỏi
được giữ nguyên; không tự áp dụng quy tắc seller cá nhân sang shop.

### Tài khoản và đăng ký seller cá nhân

| ID | Quyết định |
| --- | --- |
| ACCOUNT-01 | Người dùng phải đăng ký seller và được admin duyệt trước khi được đăng bán cá nhân. |
| ACCOUNT-02 | Chưa được duyệt seller thì chưa được tạo sản phẩm, kể cả bản nháp. |
| SELLER-REG-01 | Đăng ký seller cá nhân bắt buộc cung cấp giấy tờ định danh để admin xét duyệt. |
| SELLER-REG-02 | Chấp nhận CCCD/thẻ căn cước Việt Nam hoặc hộ chiếu. |
| SELLER-REG-03 | Hồ sơ thông thường không bắt buộc selfie cầm giấy tờ, chỉ cần ảnh giấy tờ; ngoại lệ hồ sơ đáng ngờ theo SELLER-REG-21. |
| SELLER-REG-04 | Với CCCD/thẻ căn cước, bắt buộc ảnh cả mặt trước và mặt sau. |
| SELLER-REG-05 | Với hộ chiếu, chỉ cần ảnh trang thông tin cá nhân có ảnh chân dung, họ tên, số hộ chiếu và thời hạn. |
| SELLER-REG-06 | Giấy tờ phải còn hạn tại thời điểm gửi hồ sơ đăng ký; không chấp nhận giấy tờ hết hạn. |
| SELLER-REG-07 | Seller cá nhân phải đủ 18 tuổi tại thời điểm gửi hồ sơ. |
| SELLER-REG-08 | Mỗi người chỉ có một tài khoản seller cá nhân đã duyệt. Dùng căn cước và hộ chiếu không tạo ngoại lệ cho cùng một người. |
| SELLER-REG-09 | MVP không hỗ trợ chuyển tư cách seller sang tài khoản khác; tiếp tục sử dụng hoặc khôi phục tài khoản đã được duyệt. |

### Cập nhật giấy tờ và hạn chế bán

| ID | Quyết định |
| --- | --- |
| SELLER-REG-10 | Giấy tờ hết hạn sau khi được duyệt thì có thời gian gia hạn để cập nhật. Quá hạn thì chặn tạo sản phẩm mới và gửi duyệt; vẫn xử lý đơn cũ. |
| SELLER-REG-11 | Gia hạn 30 ngày từ ngày giấy tờ hết hạn; trong thời gian này vẫn được tạo sản phẩm và gửi duyệt. |
| SELLER-REG-12 | Nộp đủ hồ sơ cập nhật trước khi hết 30 ngày thì tiếp tục tạo sản phẩm/gửi duyệt trong lúc chờ admin xét. |
| SELLER-REG-13 | Nếu hồ sơ bị từ chối sau hạn 30 ngày, admin cho bổ sung hoặc hạn chế ngay tùy lý do; tiêu chí từng nhóm theo các quyết định tiếp theo. |
| SELLER-REG-14 | Với ảnh mờ/lóa/cắt thiếu thông tin, cho 7 ngày từ yêu cầu bổ sung đầu tiên; trong hạn vẫn được tạo sản phẩm/gửi duyệt. Nộp lại không kéo dài deadline. |
| SELLER-REG-15 | Nộp ảnh bổ sung trong hạn 7 ngày thì tiếp tục hoạt động khi chờ admin duyệt. |
| SELLER-REG-16 | Nếu hết 7 ngày mà hồ sơ bổ sung vẫn không đạt khi admin xét, hạn chế tạo sản phẩm/gửi duyệt đến khi hồ sơ được duyệt; vẫn được nộp lại và xử lý đơn cũ. |
| SELLER-REG-17 | Khi bị hạn chế do hồ sơ cập nhật chưa đạt, sản phẩm vẫn cho xem nhưng chặn mua mới, kèm thông báo tạm ngừng nhận đơn. |
| SELLER-REG-18 | Nếu seller bị hạn chế khi checkout chưa thanh toán, chặn thanh toán phần hàng của seller đó, loại phần đó và tính lại tổng để buyer xác nhận; phần seller khác tiếp tục. |
| SELLER-REG-19 | Khi giấy tờ cập nhật được duyệt, tự gỡ hạn chế do giấy tờ; sản phẩm đủ điều kiện được mua lại ngay. Không mở sản phẩm tự ẩn/bị đình chỉ vì lý do khác, không tự thêm lại món đã loại khỏi checkout. |

### Nghi vấn và kết luận giả mạo danh tính

| ID | Quyết định |
| --- | --- |
| SELLER-REG-20 | Có dấu hiệu giấy tờ giả/không đúng người thì hạn chế bán ngay trong lúc xác minh: chặn tạo sản phẩm, gửi duyệt và mua mới; vẫn cho xử lý đơn đã thanh toán. Chưa tự động hủy đơn hoặc đóng băng tiền. |
| SELLER-REG-21 | Riêng hồ sơ nghi không đúng người, yêu cầu selfie cầm giấy tờ để đối chiếu; ngoại lệ của SELLER-REG-03. |
| SELLER-REG-22 | Seller có 7 ngày từ khi hệ thống gửi yêu cầu xác minh để nộp selfie và giải trình. |
| SELLER-REG-23 | Quá 7 ngày chưa phản hồi: giữ hạn chế bán, đánh dấu quá hạn, vẫn cho bổ sung sau; không tự kết luận gian lận vì im lặng. |
| SELLER-REG-24 | Nộp đủ selfie/giải trình chưa tự mở quyền bán; phải chờ admin xác minh đạt. |
| SELLER-REG-25 | Khi đã kết luận có hành vi giả mạo danh tính, thu hồi quyền bán vĩnh viễn trên tài khoản; vẫn cho khiếu nại kết luận. Quy trình khiếu nại định danh chưa chốt chi tiết. |
| SELLER-REG-26 | Tài khoản đã bị kết luận giả mạo bị chặn cả mua và bán mới; vẫn truy cập đơn cũ, khiếu nại và hỗ trợ. Xử lý đơn cũ/số dư sau kết luận chưa chốt. |

### Giữ tiền và quyết toán bảo vệ giao dịch

| ID | Quyết định |
| --- | --- |
| SETTLEMENT-REVIEW-01 | Xác nhận lại quy tắc cũ: đủ 72 giờ từ giao thành công và không tranh chấp mới mở tiền seller. Buyer xác nhận nhận hàng sớm không mở tiền sớm và không mất quyền khiếu nại trong 72 giờ. |
| SETTLEMENT-REVIEW-02 | Mốc giao thành công lấy từ trạng thái đã xác minh của hãng vận chuyển. Dữ liệu thiếu/sai thì admin được đối chiếu bằng chứng, ghi nhận ngoại lệ và lưu lý do; seller không tự xác lập mốc này. |
| SETTLEMENT-REVIEW-03 | Có tranh chấp một hoặc nhiều món thì giữ toàn bộ khoản tiền seller của order liên quan đến khi giải quyết xong; không ảnh hưởng order khác. Phải có SLA để tránh giữ tiền vô thời hạn. Các bước chờ xét lại theo nhóm DISPUTE-APPEAL. |

72 giờ là thời gian chờ quyết toán nội bộ Rewear; không phải xác nhận cổng thanh
toán cung cấp dịch vụ escrow/giữ tiền 72 giờ. Bản code đã đọc mới có reservation
và báo cước sandbox; không dùng các quyết định này làm bằng chứng tính năng tiền
đã hoàn thành.

### SLA tranh chấp và lịch làm việc

| ID | Quyết định |
| --- | --- |
| DISPUTE-SLA-01 | Ra quyết định trong 3 ngày làm việc; vụ phức tạp được gia hạn một lần, tối đa tổng cộng 5 ngày làm việc, phải thông báo lý do. Đây là hạn ra quyết định, không gồm vận chuyển hàng trả và thực hiện refund. |
| DISPUTE-SLA-02 | Ghi nhận bắt đầu SLA khi buyer gửi hồ sơ đáp ứng thông tin/bằng chứng tối thiểu; thời gian chờ các bên phản hồi nằm trong SLA. Deadline tính theo DISPUTE-CALENDAR-03. |
| DISPUTE-SLA-03 | Không dừng SLA khi chờ buyer, seller hoặc hãng vận chuyển; quyết định dựa trên bằng chứng thu được trong tối đa 5 ngày làm việc. |
| DISPUTE-SLA-04 | Quá 5 ngày chưa có quyết định: tiếp tục giữ tiền, ghi nhận vi phạm SLA, chuyển cấp tối đa thêm 1 ngày làm việc và người phụ trách phải ra quyết định. Không tự cho bên nào thắng vì timeout. Đây là ngoại lệ sự cố, không phải gia hạn thông thường. |
| DISPUTE-CALENDAR-01 | Ngày làm việc là thứ Hai–thứ Sáu, loại trừ ngày nghỉ lễ Việt Nam. |
| DISPUTE-CALENDAR-02 | Hạn 1 ngày làm việc: bỏ ngày hệ thống gửi thông báo, kết thúc lúc 17:00 ngày làm việc kế tiếp, múi giờ Việt Nam. |
| DISPUTE-CALENDAR-03 | SLA admin: bỏ ngày nhận hồ sơ hợp lệ, kết thúc 17:00 ngày làm việc thứ 3 hoặc thứ 5 nếu gia hạn, múi giờ Việt Nam. Vẫn ghi nhận tiếp nhận ngay lúc gửi, không chờ admin mở hồ sơ. |

Ví dụ không có ngày lễ: hồ sơ hợp lệ gửi thứ Hai thì hạn thông thường là
17:00 thứ Năm; nếu gia hạn thì 17:00 thứ Hai tuần sau. Chưa chốt cơ chế nếu
tiếp tục vi phạm sau ngày chuyển cấp bổ sung; không tự suy ra được giữ vô hạn.

### Bằng chứng và phản hồi

| ID | Quyết định |
| --- | --- |
| DISPUTE-EVIDENCE-01 | Khi chưa đủ căn cứ, admin xét trách nhiệm cung cấp bằng chứng của từng bên; chưa mặc định buyer/seller thắng chỉ vì bên kia im lặng. Trách nhiệm theo từng loại vấn đề còn cần đặc tả. |
| DISPUTE-EVIDENCE-02 | Với sai món/lỗi không mô tả: không bắt buộc video unbox; cần ảnh/video thể hiện vấn đề, xác định món thuộc order và mô tả điểm khác tin đăng; admin được yêu cầu bổ sung. |
| DISPUTE-EVIDENCE-03 | Video unbox rõ ràng chứng minh vấn đề tạo căn cứ ban đầu nghiêng về buyer; seller cần bằng chứng phản bác. Không tự chấp thuận chỉ vì có video; admin đối chiếu toàn bộ hồ sơ. |
| DISPUTE-EVIDENCE-04 | Video mạnh: quay liên tục từ kiện chưa mở, thấy mã vận đơn, quá trình lấy hàng và vấn đề khiếu nại. Thiếu một chi tiết nhưng bằng chứng khác bù được thì admin có thể công nhận, phải ghi lý do. Video chưa đạt vẫn là bằng chứng bổ trợ. |
| DISPUTE-RESPONSE-01 | Seller có 1 ngày làm việc từ thông báo khiếu nại hợp lệ để phản hồi/cung cấp bằng chứng; thay mốc 24 giờ liên tục trong đề xuất cũ cho bước phản hồi tranh chấp này, không đổi hạn xác nhận order SELLER-SESSION-01. |
| DISPUTE-RESPONSE-02 | Seller quá hạn: admin xét bằng chứng hiện có, ghi nhận không thực hiện trách nhiệm phản hồi; không tự cho buyer thắng. |
| DISPUTE-EVIDENCE-05 | Bằng chứng seller nộp muộn nhưng trước quyết định vẫn được xét nếu liên quan; ghi nhận nộp muộn, không kéo dài SLA. |

### Yêu cầu xét lại quyết định tranh chấp mua bán

| ID | Quyết định |
| --- | --- |
| DISPUTE-APPEAL-01 | Mỗi bên được yêu cầu xét lại một lần, phải có bằng chứng mới hoặc nêu sai sót cụ thể; phạm vi được làm rõ bởi DISPUTE-APPEAL-09. |
| DISPUTE-APPEAL-02 | Hạn gửi là 2 ngày làm việc từ thông báo quyết định: bỏ ngày thông báo, kết thúc 17:00 ngày làm việc thứ hai, giờ Việt Nam. |
| DISPUTE-APPEAL-03 | Chờ hết cửa sổ 2 ngày trước khi thực hiện quyết định về tiền. Có yêu cầu hợp lệ thì giữ tiền đến kết luận cuối. Refund phải trả hàng vẫn cần đáp ứng điều kiện trả hàng. |
| DISPUTE-APPEAL-04 | Ưu tiên admin khác xét lại. Nếu không có admin khác, admin ban đầu được xét lại nhưng phải ghi lý do ngoại lệ và lưu lịch sử người xử lý. |
| DISPUTE-APPEAL-05 | SLA xét lại là 2 ngày làm việc, không gia hạn thông thường, deadline 17:00 theo lịch đã chốt. Mốc ban đầu “từ nhận yêu cầu hợp lệ” đã được thay bởi DISPUTE-APPEAL-06. |
| DISPUTE-APPEAL-06 | Gộp yêu cầu hai bên đối với cùng quyết định thành một lần xét chung. Chờ hết cửa sổ gửi 2 ngày làm việc, sau đó mới bắt đầu SLA xét lại 2 ngày làm việc; không ra kết luận sớm làm mất quyền gửi của bên kia. |
| DISPUTE-APPEAL-07 | Kết luận xét lại là cuối cùng trong quy trình nội bộ, không có thêm vòng xét lại cùng vấn đề. Sửa lỗi thao tác/sai số tiền là quy trình riêng chưa chốt. |
| DISPUTE-APPEAL-08 | Quá hạn xét lại: giữ tiền, ghi nhận vi phạm SLA, chuyển cấp tối đa thêm 1 ngày làm việc; không tự cho bên nào thắng. Không coi ngày bổ sung là gia hạn thông thường. |
| DISPUTE-APPEAL-09 | Mỗi bên có một lần yêu cầu xét lại cho từng quyết định về từng vấn đề; mỗi quyết định có cửa sổ riêng. Phần có kết luận cuối không tự mở lại. Làm rõ phạm vi DISPUTE-APPEAL-01/06, không gộp các quyết định khác vấn đề thành một deadline mới. |

### Cửa sổ khiếu nại và nhiều vấn đề trong một order

| ID | Quyết định |
| --- | --- |
| DISPUTE-WINDOW-01 | Mở tranh chấp trong 72 giờ liên tục từ mốc giao thành công đã xác minh, gồm cuối tuần/ngày lễ. Bấm nhận sớm không mất quyền. Hồ sơ hợp lệ đúng hạn tiếp tục được xử lý và khóa tiền sau mốc 72 giờ. |
| DISPUTE-WINDOW-02 | Trong 72 giờ đã xác định order, món và mô tả vấn đề nhưng thiếu bằng chứng tối thiểu: cho thêm một lần 24 giờ liên tục, tạm giữ tiền. Không bổ sung đủ thì đóng yêu cầu. SLA xử lý bắt đầu khi đủ điều kiện tối thiểu. |
| DISPUTE-WINDOW-03 | 24 giờ bổ sung tính ngay từ khi hệ thống ghi nhận yêu cầu thiếu bằng chứng, không chờ admin hoặc hết cửa sổ 72 giờ. |
| DISPUTE-WINDOW-04 | Yêu cầu trùng cùng món/cùng vấn đề được gộp, giữ deadline của yêu cầu đầu. Xóa/gửi lại không đặt lại thời hạn. |
| DISPUTE-SCOPE-01 | Mỗi order một hồ sơ chung. Được thêm món/vấn đề khác trong 72 giờ; từng vấn đề có deadline bổ sung bằng chứng riêng, không đặt lại SLA phần đã hợp lệ. |
| DISPUTE-SCOPE-02 | Admin quyết định riêng từng vấn đề đúng SLA; giữ toàn bộ tiền seller của order đến khi mọi vấn đề và bước xét lại liên quan kết thúc. |

### Trả hàng và giữ hàng hoàn một phần

| ID | Quyết định |
| --- | --- |
| RETURN-REVIEW-01 | Khi seller có lỗi, hỗ trợ ba hướng: trả hàng hoàn tiền; miễn trả trong trường hợp đặc biệt; hoặc giữ hàng hoàn một phần. Điều kiện miễn trả và các chi tiết còn mở không được coi là đã chốt. |
| RETURN-PARTIAL-01 | Giữ hàng hoàn một phần chỉ áp dụng khi buyer và seller cùng đồng ý. Không thống nhất thì xét trả hàng/ngoại lệ miễn trả; admin không áp mức giảm bắt buộc. |
| RETURN-PARTIAL-02 | Một bên gửi đề xuất trong hồ sơ, bên kia bấm chấp thuận đúng số tiền và món liên quan; lưu đề xuất/xác nhận. Thương lượng không kéo dài SLA. |
| RETURN-PARTIAL-03 | Hai bên xác nhận thì thỏa thuận có hiệu lực ngay và kết thúc vấn đề được thỏa thuận; không đổi ý để yêu cầu xét lại vấn đề đó. Vấn đề khác vẫn tiếp tục. Phạm vi giữ tiền được làm rõ bởi WALLET-REFUND-PER-ISSUE-01: tiền seller còn lại khóa theo hồ sơ, phần refund buyer đã đủ điều kiện không phải chờ vấn đề khác. |
| RETURN-PARTIAL-04 | Khoản hoàn không vượt giá trị món trước giảm xu đã snapshot, không gồm ship; hoàn vào ví buyer. |
| RETURN-PARTIAL-05 | Với lỗi seller, seller chịu toàn bộ số tiền đã đồng ý hoàn, kể cả phần tương ứng xu; phải thấy chính xác khoản bị trừ trước khi chấp thuận. |

### Hoa hồng và phí thanh toán

| ID | Quyết định |
| --- | --- |
| COMMISSION-01 | Seller cá nhân và shop có tỷ lệ riêng; tính trên tiền hàng trước giảm xu, không tính ship. |
| COMMISSION-02 | Giữ hàng hoàn một phần thì tính lại hoa hồng trên tiền hàng còn lại sau hoàn, theo tỷ lệ snapshot của giao dịch. |
| COMMISSION-03 | Trả món và hoàn toàn bộ tiền hàng thì hủy toàn bộ hoa hồng món đó; món không hoàn giữ nguyên hoa hồng. |
| COMMISSION-04 | Mức khởi tạo: seller cá nhân 5%, shop 3%. |
| COMMISSION-05 | Admin lên lịch thay đổi, thông báo trước. Tỷ lệ mới áp dụng checkout giữ hàng thành công từ thời điểm hiệu lực; lưu tỷ lệ khi giữ thành công, không hồi tố checkout cũ. |
| COMMISSION-06 | Tăng hoa hồng phải báo trước tối thiểu 7 ngày liên tục. |
| COMMISSION-07 | Giảm hoa hồng cũng phải báo trước tối thiểu 7 ngày liên tục; không áp dụng ngay hoặc sửa snapshot giao dịch cũ. |
| PAYMENT-FEE-01 | Sàn chịu phí cổng thanh toán; không thu thêm buyer hoặc khấu trừ seller. |

### Nguồn, thưởng và sử dụng xu

| ID | Quyết định |
| --- | --- |
| COIN-FUNDING-01 | Sàn tài trợ khoản giảm bằng xu. Seller được ghi nhận tiền hàng theo giá trước giảm xu, rồi mới trừ hoa hồng/điều chỉnh. |
| COIN-LIMIT-01 | Dùng xu tối đa 10% tiền hàng trước giảm xu, không gồm ship và không vượt số dư khả dụng. Làm rõ/thay thế cách ghi “10% tổng checkout” của COIN-SESSION-01. |
| COIN-RATE-01 | 1 xu = 1đ khi thanh toán. |
| COIN-SOURCE-01 | MVP có xu thưởng đơn mua đủ điều kiện và xu admin cấp theo chương trình. Không tự bao gồm thưởng đăng ký/giới thiệu/đánh giá. |
| COIN-EARN-BASE-01 | Cơ sở thưởng là tiền hàng sau trừ xu đã dùng và refund, không gồm ship; không thấp hơn 0. |
| COIN-EARN-RATE-01 | Tỷ lệ thưởng mua hàng khởi tạo 0,5%. |
| COIN-EARN-SCOPE-01 | Cấp riêng từng order khi đủ điều kiện: giao dịch hoàn tất, hết thời gian tranh chấp; nếu có tranh chấp thì chờ kết luận cuối và xác định khoản hoàn. Không chờ order khác trong checkout. |
| COIN-EARN-ROUND-01 | Cộng cơ sở thưởng cả order, áp dụng 0,5%, làm tròn xuống một lần; không giữ xu lẻ. |
| COIN-EXPIRY-01 | Xu thưởng mua hàng không hết hạn. Xu admin cấp theo chương trình có thể có hạn, phải công bố trước khi cấp. Thay cách ghi chung xu không hết hạn trước đây. |
| COIN-SPEND-ORDER-01 | Dùng xu hết hạn sớm trước, xu không hết hạn sau; cùng hạn thì khoản cấp trước dùng trước. |
| COIN-HOLD-01 | Giữ riêng xu đã chọn cho checkout; checkout khác chỉ dùng xu chưa bị giữ. Chỉ trừ chính thức khi thanh toán thành công. Cần nhả giữ khi hủy/hết hạn. |
| COIN-HOLD-02 | Xu còn hạn khi giữ được dùng đến deadline checkout ban đầu dù xu hết hạn trong lúc chờ; không gia hạn. Checkout hủy/hết hạn sau hạn xu thì xu đó không trở lại số dư khả dụng. |

### Thanh toán đến muộn và tra soát trước hạn

**Lưu ý về trạng thái xác nhận — bổ sung ngày 05/11/2026:** Người dùng chỉ ra
rằng API/provider ảnh hưởng trực tiếp các câu hỏi thanh toán. Các lựa chọn dưới
đây được giữ làm lịch sử và ý định nghiệp vụ, không phải cam kết tích hợp đã khả
thi. PAYMENT-RECONCILE-02/03 là lịch tra soát dự kiến, cần kiểm chứng provider có
API query, ngữ nghĩa trạng thái và giới hạn gọi phù hợp rồi mới xác nhận dùng để
triển khai. PAYMENT-LATE-01 là mong muốn hoàn về nguồn ban đầu; chưa xác nhận có
API refund tự động, nguồn nhận hoàn có xác định được hay phải chuyển tiền thủ
công. Không tự thay bằng hoàn ví hoặc coi thiếu API là đã hoàn tiền. Provider đã
được chọn tại PAYMENT-PROVIDER-01; vẫn cần kiểm chứng luồng tạo/nhận tiền,
webhook, query, hết hạn, tiền đến muộn,
refund và môi trường thử trước khi hỏi/chốt tiếp các chi tiết phụ thuộc provider.
Thời hạn checkout của Rewear không tự chứng minh rằng provider ngừng nhận tiền
đúng thời điểm đó. Chính sách giữ tiền nội bộ 72 giờ không tự chứng minh provider
có dịch vụ giữ tiền hoặc chi tiền cho seller.

| ID | Quyết định |
| --- | --- |
| PAYMENT-PROVIDER-01 | Người dùng chọn MoMo Sandbox cho tích hợp thanh toán online của Rewear ngày 05/11/2026. Thay trạng thái chỉ là hướng thử trong PAY-04/archive; không chọn SePay. Chưa đồng nghĩa đã tích hợp, có credentials hoặc kiểm thử sandbox thành công; chưa tự mở rộng sang production, thẻ, trả sau hoặc chi tiền seller. |
| PAYMENT-COD-01 | Bổ sung COD cho đồ án, thay phạm vi cũ chỉ online sandbox/chưa COD của PAY-02 trong archive. Phạm vi tích hợp theo SHIPPING-COD-01; thu theo order, ship, xu, refund và mốc seller theo các nhóm COD bên dưới. Không áp nguyên thanh toán chung trước giao và mốc xác nhận seller sau trả tiền sang COD. MoMo Sandbox vẫn là provider online; ví Rewear giữ các quy tắc đã chốt/làm rõ. |
| SHIPPING-COD-01 | Tiếp tục từ thử nghiệm GHN Sandbox: tích hợp tạo/tra cứu vận đơn COD và nhận trạng thái vào Rewear. Nếu không kiểm thử được chuyển tiền COD thì mô phỏng riêng bước đối soát, ghi rõ giới hạn. Không thu tiền thật và không coi delivered là bằng chứng tiền COD đã chuyển về sàn. Đây là phạm vi triển khai, chưa phải bằng chứng tích hợp hoặc kiểm thử thành công. |
| PAYMENT-LATE-01 | Khi xác nhận đã thu tiền nhưng checkout đã hết hạn và hàng đã nhả: không khôi phục checkout, không trừ xu, hoàn qua cổng về phương thức thanh toán ban đầu. Đây là ngoại lệ riêng với refund vào ví cho order đã thanh toán rồi hủy. |
| PAYMENT-RECONCILE-01 | Bắt đầu tra soát trước deadline checkout. Đến đúng hết 10 phút vẫn chưa xác nhận thành công thì nhả hàng; tiền thu muộn hoàn theo PAYMENT-LATE-01. Không giữ thêm 2 phút. Mốc bắt đầu theo PAYMENT-RECONCILE-02, tần suất theo PAYMENT-RECONCILE-03. |
| PAYMENT-RECONCILE-02 | Với giao dịch online chưa có kết quả, bắt đầu chủ động tra soát sau 60 giây từ khi tạo giao dịch hoặc khi checkout còn 2 phút, mốc nào đến trước. Nếu tạo giao dịch khi đã vào 2 phút cuối thì kiểm tra ngay khi có tham chiếu giao dịch để tra soát. Đã nhận kết quả hợp lệ thì không cần tra soát tiếp. Không thay đổi deadline giữ hàng. |
| PAYMENT-RECONCILE-03 | Khi kết quả còn đang xử lý, tra soát mỗi 60 giây; trong 2 phút cuối checkout chuyển sang mỗi 15 giây. Không tạo các lượt tra soát song song cho cùng giao dịch, dừng khi có kết quả hợp lệ hoặc hết deadline. Đây là chính sách mục tiêu, cần kiểm chứng API/giới hạn của provider khi tích hợp; không xác nhận provider đã hỗ trợ. |

Đối chiếu tài liệu chính thức ngày 05/11/2026 (kết quả nghiên cứu của assistant,
không phải quyết định người dùng hoặc bằng chứng chạy API):

- [Thanh toán ví một lần](https://developers.momo.vn/v3/vi/docs/payment/api/wallet/onetime/):
  có create với `captureWallet`, mặc định `autoCapture=true`, số tiền 1.000–50.000.000đ;
  thử thanh toán bằng ứng dụng/tài khoản MoMo Test. Đây là hướng tích hợp đề xuất,
  không tự coi toàn bộ phương thức MoMo cung cấp là phạm vi đã chọn.
- [IPN](https://developers.momo.vn/v3/docs/payment/api/result-handling/notification/):
  phải kiểm tra chữ ký và đối chiếu mã giao dịch/đối tác/số tiền; trả HTTP 204
  trong 15 giây. Redirect không phải căn cứ duy nhất ghi nhận đã trả tiền. Không
  dùng việc từ chối IPN như lệnh yêu cầu MoMo tự refund.
- [Query](https://developers.momo.vn/v3/docs/payment/api/payment-api/query/):
  có API tra trạng thái; tài liệu yêu cầu timeout gọi tối thiểu 30 giây. Đây là
  thời gian chờ request, không phải giới hạn tần suất 30 giây. Nhịp mục tiêu 15
  giây không được tạo request chồng khi query trước vẫn chạy. Chưa xác minh rate
  limit cụ thể; không ghi nhịp dự kiến là năng lực đã được MoMo bảo đảm.
- [Refund và query refund](https://developers.momo.vn/v3/docs/payment/api/payment-api/refund/):
  có hoàn toàn phần/một phần, ID refund khác giao dịch mua, hỗ trợ tham chiếu
  kiểm tra kết quả; số tiền chịu giới hạn API. Chưa chạy thử quyền refund của
  tài khoản sandbox. Refund vào ví Rewear là ghi sổ nội bộ, khác refund MoMo;
  không thực hiện cả hai cho cùng một nghĩa vụ hoàn.
- Còn phải kiểm chứng thời hạn thực tế của giao dịch MoMo so với giữ hàng 10 phút,
  độ trễ query/IPN, hoàn tiền thu muộn và chính sách số tiền ngoài giới hạn.

### Đặt hàng COD, khóa hàng và hủy trước bàn giao

| ID | Quyết định |
| --- | --- |
| COD-SELLER-01 | Seller có 24 giờ liên tục để xác nhận, tính từ khi buyer đặt hàng COD thành công. Đặt thành công là Rewear đã kiểm tra hàng, chốt địa chỉ/số tiền và tạo order chờ seller; chưa phải tạo vận đơn. Đây là mốc riêng COD, không chờ thu tiền như online/ví. |
| COD-RESERVE-01 | Đặt COD thành công thì khóa món cho order trong lúc chờ seller; buyer khác không mua được. Đây là khóa theo order, không nhả theo deadline 10 phút của checkout cũ. Giới hạn/chống lạm dụng theo nhóm COD-ABUSE; không coi các ngưỡng đã chốt là đã có code thực thi. |
| COD-CANCEL-01 | Seller từ chối hoặc quá 24 giờ chưa xác nhận: hủy riêng order COD và nhả các món còn đủ điều kiện bán; order seller khác tiếp tục. Chưa thu tiền COD nên không refund tiền COD. Chỉ nhả khóa đúng order; món bị đình chỉ/nguồn bán không hợp lệ không tự mở bán. Xu giữ xử lý theo COD-COIN-RESTORE và COD-COIN-RELEASE-01. |
| COD-BUYER-CANCEL-01 | Buyer được tự hủy từng order COD bất kỳ lúc nào trước khi seller xác nhận; nhả khóa hàng ngay, chỉ mở bán nếu còn đủ điều kiện. Khi buyer hủy đồng thời seller xác nhận, chỉ một thao tác thành công. Đặt/hủy lặp xử lý theo nhóm COD-ABUSE. |
| COD-BUYER-CANCEL-02 | Seller đã xác nhận nhưng chưa bàn giao thực tế cho GHN: buyer gửi yêu cầu hủy, seller chấp thuận hoặc từ chối trong 12 giờ liên tục theo COD-CANCEL-RESPONSE-01. Không coi tạo vận đơn là đã bàn giao. Quy tắc chờ phản hồi/quá hạn và hủy vận đơn theo các quyết định bên dưới. |
| COD-CANCEL-RESPONSE-01 | Seller có 12 giờ liên tục để phản hồi yêu cầu hủy COD trước bàn giao. |
| COD-CANCEL-PENDING-01 | Trong lúc yêu cầu hủy còn chờ, tạm chặn bàn giao trong Rewear; seller phải chấp thuận hoặc từ chối trước. Chưa xác lập khả năng ngăn bàn giao ngoài hệ thống; nhánh hàng đã thực sự được bàn giao cần xử lý riêng. |
| COD-CANCEL-TIMEOUT-01 | Hết 12 giờ seller chưa phản hồi thì tự chấp thuận hủy. Nếu đã có vận đơn, phải xử lý hủy với GHN và xác định an toàn trước khi nhả hàng; chấp thuận hủy order không đồng nghĩa GHN đã hủy vận đơn. |
| COD-SHIPMENT-CANCEL-01 | Nếu kết quả hủy GHN chưa rõ, đánh dấu “Đang hủy vận đơn”, tiếp tục khóa hàng, tự tra cứu lại; quá thời hạn thì chuyển admin. Không coi timeout là GHN đã từ chối hoặc đã hủy, không nhả hàng khi chưa loại trừ nguy cơ kiện đang vận chuyển. |
| COD-SHIPMENT-CANCEL-02 | Sau 30 phút liên tục từ lần yêu cầu hủy vận đơn đầu tiên mà chưa xác định được kết quả, chuyển admin. Thử lại không đặt lại mốc thời gian. Đây là ngưỡng xử lý sự cố của Rewear, không phải cam kết phản hồi của GHN. |
| COD-SHIPMENT-CANCEL-03 | Admin kiểm tra và đưa hướng xử lý sự cố hủy vận đơn trong 1 ngày làm việc từ khi nhận sự cố: bỏ ngày nhận, hạn 17:00 ngày làm việc kế tiếp, giờ Việt Nam. Hướng xử lý có thể xác nhận hủy an toàn hoặc xác định đã bàn giao để chuyển luồng phù hợp; không ép đánh dấu đã hủy khi thiếu bằng chứng. Nhánh hết hạn vẫn chưa rõ trạng thái còn mở. |
| COD-SHIPMENT-CANCEL-04 | Ưu tiên dữ liệu GHN đã xác minh cho thấy vận đơn đã hủy và không tiếp tục vận chuyển. Nếu thiếu/mâu thuẫn, admin được đối chiếu xác nhận từ GHN và bằng chứng liên quan, lưu căn cứ trước khi nhả hàng. Timeout hoặc lời seller đơn phương không đủ căn cứ. Trạng thái/API cụ thể phải kiểm chứng khi tích hợp. |
| COD-CANCEL-REJECT-01 | Seller từ chối yêu cầu hủy trước bàn giao phải chọn lý do và giải thích. Buyer được đề nghị admin kiểm tra nếu không đồng ý; không tự kết luận buyer lạm dụng vì yêu cầu bị từ chối. Danh sách lý do hợp lệ còn cần chốt. |
| COD-CANCEL-REVIEW-WINDOW-01 | Sau thông báo seller từ chối, tiếp tục chặn bàn giao 4 giờ liên tục. Buyer đề nghị admin kiểm tra trong hạn thì giữ chặn đến kết quả; không đề nghị thì hết hạn được tiếp tục giao. |
| COD-CANCEL-REVIEW-SLA-01 | Admin quyết định cho hủy hay tiếp tục giao trong 1 ngày làm việc từ đề nghị kiểm tra của buyer, theo lịch đã chốt: bỏ ngày nhận, hạn 17:00 ngày làm việc kế tiếp, giờ Việt Nam. Đây là kiểm tra hủy trước giao, không dùng SLA tranh chấp sau nhận hàng 3–5 ngày. |
| COD-CANCEL-REASON-01 | Chỉ “đã đóng gói” hoặc “đã tạo vận đơn” chưa đủ để từ chối hủy trước bàn giao; seller phải nêu căn cứ khác và bằng chứng phù hợp. |
| COD-CANCEL-COST-01 | Có chi phí thực tế không thể thu hồi vẫn cho hủy; admin xác định bên chịu phí theo nguyên nhân và bằng chứng. Tách quyền hủy khỏi trách nhiệm phí, không mặc định khấu trừ ví buyer. |
| COD-CANCEL-COST-02 | Buyer chỉ đổi ý và seller không có lỗi: buyer chịu phí hủy thực tế đã xác minh nếu loại phí và điều kiện thu đã công bố trước khi đặt hàng. Phí chưa công bố không tự trở thành nghĩa vụ buyer; không tự đặt khoản phạt. Số tiền minh họa trong hội thoại không phải biểu phí GHN. |
| COD-CANCEL-FEE-PAY-01 | Tạo yêu cầu thanh toán phí hủy riêng bằng MoMo Sandbox; ví Rewear đủ thì buyer được chọn trả toàn bộ bằng ví. Hủy hàng không chờ buyer trả phí. Phí dưới giới hạn API MoMo theo COD-CANCEL-FEE-MIN-01; không tự cộng vào đơn sau hoặc thu thủ công. |
| COD-CANCEL-FEE-DUE-01 | Buyer có 72 giờ liên tục để trả phí, từ khi hệ thống gửi thông báo khoản phí đã xác định kèm số tiền, lý do và căn cứ. Phản đối và hạn chế quá hạn theo các quyết định bên dưới; không tự khóa toàn bộ tài khoản/trừ tiền. |
| COD-CANCEL-FEE-REVIEW-01 | Buyer được phản đối trong hạn 72 giờ, một lần cho mỗi quyết định phí, phải nêu căn cứ cụ thể. Tạm dừng hạn trả phí khi admin xét; nếu vẫn phải trả, cấp lại đủ 72 giờ từ thông báo kết quả. Phản đối phí không khôi phục order đã hủy. |
| COD-CANCEL-FEE-REVIEW-SLA-01 | Admin xét phản đối phí trong 2 ngày làm việc: bỏ ngày nhận, deadline 17:00 ngày làm việc thứ hai theo giờ Việt Nam. Xử lý quá SLA còn mở. |
| COD-CANCEL-FEE-OVERDUE-01 | Phí đã xác định quá hạn và không còn đang được xét thì chặn đặt COD mới. Vẫn cho mua bằng MoMo/ví, xử lý đơn cũ, hỗ trợ và thanh toán chính khoản phí. Gỡ hạn chế khi khoản phí được thanh toán hoặc hủy theo kết quả xử lý; không tự khấu trừ ví. |
| COD-CANCEL-FEE-MIN-01 | Phí dưới ngưỡng thanh toán tối thiểu MoMo và ví Rewear không đủ thì sàn chịu, không tạo khoản phải trả hoặc hạn chế buyer vì khoản đó; không làm tròn tăng phí. Ngưỡng luồng ví MoMo trong tài liệu đã đối chiếu là 1.000đ, cần kiểm chứng khi tích hợp. |
| COD-CANCEL-FEE-REFUND-01 | Nếu phí đã thu được xác định thu nhầm, hoàn về đúng nguồn: MoMo thì refund qua MoMo, ví Rewear thì cộng lại ví. Chỉ ghi đã hoàn khi có xác nhận kết quả; gửi yêu cầu refund chưa là hoàn thành. Đây là sửa khoản thu sai, khác refund tiền hàng. |

### Thu COD theo order và sử dụng xu

| ID | Quyết định |
| --- | --- |
| COD-COLLECTION-01 | Buyer đặt nhiều seller trong cùng một lượt nhưng thanh toán COD riêng khi nhận từng order/kiện. Checkout hiển thị rõ số tiền từng kiện và tổng dự kiến; không áp thanh toán chung một lần của online sang COD. |
| COD-SHIPPING-FEE-01 | Số tiền thu khi nhận từng kiện gồm tiền hàng và ship của order. Sàn trả cước cho GHN và đối soát khoản thu; phải cấu hình/kiểm chứng để không thu ship hai lần. Không mặc định hãng thu thêm ship ngoài tổng đã chốt. |
| COD-COIN-01 | Cho dùng xu với COD, tối đa 10% tiền hàng, không gồm ship và không vượt số dư khả dụng. Số tiền thu từng kiện giảm theo phần xu phân bổ cho order đó; sàn tài trợ, seller được ghi nhận tiền hàng trước giảm xu. |
| COD-COIN-DEBIT-01 | Giữ xu từ lúc đặt COD thành công; trừ chính thức theo order khi xác minh buyer đã thanh toán COD cho hãng vận chuyển, không chờ tiền chuyển về sàn. Không coi delivered đơn thuần là bằng chứng đã thu tiền. Nguồn xác minh theo COD-COLLECTION-VERIFY-01, vẫn cần kiểm thử tích hợp. |
| COD-COIN-EXPIRY-01 | Xu còn hạn khi đặt COD được bảo toàn quyền dùng cho đúng order đó đến khi order kết thúc dù hết hạn trong lúc chờ; không chuyển phần xu giữ sang order khác. Cần giới hạn vòng đời order. Hủy/giao thất bại xử lý theo các quyết định nhả/phục hồi bên dưới; không tự áp quy tắc giữ xu 10 phút của online sang COD. |
| COD-COIN-RESTORE-01 | Order COD hủy trước thu tiền do seller từ chối/không giao được: nhả xu còn hạn theo hạn cũ; xu đã hết hạn phục hồi với hạn mới 7 ngày từ lúc hủy. Không chuyển thành tiền ví; đây là xử lý xu chưa trừ. |
| COD-COIN-RESTORE-02 | Buyer đổi ý và hủy COD được chấp thuận trước thu tiền: xu còn hạn nhả theo hạn cũ; xu hết hạn phục hồi thêm 7 ngày từ lúc hủy, chịu giới hạn COD-COIN-RESTORE-03. |
| COD-COIN-RESTORE-03 | Mỗi khoản xu hết hạn chỉ được phục hồi một lần do buyer đổi ý. Hủy do lỗi seller vẫn được phục hồi tiếp. Theo dõi lịch sử từng khoản xu, không đặt lại số lần khi nhả hoặc chuyển sang order khác. Chưa tự mở rộng giới hạn này sang mọi loại lỗi buyer hoặc lỗi carrier. |
| COD-COIN-RELEASE-01 | Khi xác minh order không giao tiếp, chưa thu COD và đã chuyển hoàn thì giải phóng phần giữ xu, không chờ kiện về seller. Xu còn hạn trả để dùng lại; xu hết hạn xét theo nguyên nhân. Hàng vẫn khóa riêng đến khi đủ điều kiện xử lý hàng hoàn. |
| COD-COIN-RESTORE-PENDING-01 | Nếu giao thất bại chưa rõ trách nhiệm, chỉ xu đã hết hạn chuyển sang chờ xác định nguyên nhân rồi quyết định phục hồi; hạn phục hồi 7 ngày bắt đầu khi thực sự được phục hồi. Xu còn hạn được trả ngay. Không phục hồi tạm rồi tự thu hồi tạo số dư âm. |
| COD-COIN-CARRIER-01 | Xác định giao thất bại do hãng vận chuyển: phục hồi xu hết hạn thêm 7 ngày từ kết luận, không tính vào lượt phục hồi do buyer đổi ý. Bồi thường hàng/phí vận chuyển xét riêng, không tự trừ tiền seller hoặc carrier vì phục hồi xu. |
| COD-COIN-BUYER-FAULT-01 | Giao thất bại do lỗi buyer đã xác minh, khác chủ động hủy vì đổi ý trước thu tiền: không phục hồi xu hết hạn; xu còn hạn vẫn trả. Không kết luận chỉ từ một cuộc gọi nhỡ hoặc mã giao thất bại. Hủy vì đổi ý vẫn theo COD-COIN-RESTORE-02/03. |
| COD-FAILURE-RESPONSIBILITY-01 | Hệ thống tổng hợp trạng thái/lý do GHN và bằng chứng; admin xác nhận trước khi kết luận lỗi buyer hoặc seller. Không tự quy lỗi chỉ từ mã trạng thái hãng hoặc lựa chọn đơn phương của seller. |
| COD-FAILURE-SLA-01 | Admin xác định trách nhiệm trong 2 ngày làm việc từ khi hệ thống xác minh order không giao tiếp, chưa thu tiền và chuyển hồ sơ sang admin; không chờ đủ bằng chứng mới tính hạn. Bỏ ngày tiếp nhận, deadline 17:00 ngày làm việc thứ hai theo giờ Việt Nam. |
| COD-COIN-INCONCLUSIVE-01 | Admin đã xét đúng hạn nhưng chưa đủ căn cứ quy trách nhiệm: phục hồi xu hết hạn thêm 7 ngày từ kết luận, không tính vào lượt buyer đổi ý. Không tự kéo dài xét thêm 3 ngày. Quy tắc này chỉ về xu, chưa xác định ai chịu phí hoặc bồi thường. |

### Cước giao COD thất bại và khoản phải trả

| ID | Quyết định |
| --- | --- |
| COD-FAILURE-FEE-01 | Giao thất bại do lỗi buyer đã xác minh: buyer chịu phí giao đi và chuyển hoàn thực tế, hợp lệ, với loại phí/điều kiện thu được công bố trước khi đặt. Không cộng tiền hàng, hoa hồng hoặc khoản phạt tùy ý. |
| COD-FAILURE-FEE-PROCESS-01 | Phí giao thất bại do lỗi buyer dùng chung quy trình phí hủy: thanh toán riêng MoMo hoặc toàn bộ bằng ví nếu đủ trong 72 giờ; phản đối một lần có căn cứ, admin xét 2 ngày làm việc, tạm dừng hạn và cấp lại 72 giờ nếu còn phải trả; quá hạn chặn COD mới nhưng không chặn mua trả trước; phí dưới ngưỡng MoMo khi ví không đủ do sàn chịu; thu nhầm hoàn đúng nguồn. Mỗi khoản gắn đúng order/chứng từ và không thu trùng. |
| COD-FAILURE-SELLER-FEE-01 | Giao COD thất bại do lỗi seller đã xác minh: seller chịu toàn bộ cước thực tế, hợp lệ thuộc lỗi của mình; buyer không bị thu phí. Không cộng hình phạt tùy ý. Sàn trả GHN và thu lại từ seller là bút toán riêng, không trừ hai lần. |
| COD-SELLER-DEDUCTION-01 | Khấu trừ cước seller chịu từ số dư bán hàng khả dụng của đúng nguồn bán; thiếu thì ghi khoản phải trả và bù trừ khi có tiền khả dụng tiếp theo. Không trừ tiền chờ quyết toán/tranh chấp hoặc số dư nguồn bán khác. Chính sách khấu trừ phải công bố trước và có lịch sử. Phí shop không tự trừ tiền bán cá nhân của owner hoặc shop khác. |
| COD-SELLER-FEE-PAY-01 | Seller được thanh toán phần nghĩa vụ còn thiếu đã xác minh qua MoMo Sandbox, không phải nạp ví bán hàng. Bù trừ tự động vẫn áp dụng nếu tiền khả dụng về trước; phải chống thu trùng khi MoMo và bù trừ đồng thời. Hạn trả/phản đối/hạn chế, khoản dưới ngưỡng và phần thu vượt theo các quyết định bên dưới. |
| COD-SELLER-FEE-DUE-01 | Seller có 7 ngày liên tục để tất toán phần cước còn thiếu, từ thông báo nghĩa vụ đã xác minh kèm số tiền, lý do và căn cứ. Tiền khả dụng phát sinh vẫn được bù trừ trong thời hạn này. |
| COD-SELLER-FEE-REVIEW-01 | Seller được phản đối một lần có căn cứ trong 7 ngày. Tạm dừng thu thêm và hạn trả của khoản bị phản đối; phần đã khấu trừ giữ chờ kết quả. Nếu vẫn phải trả, cấp lại đủ 7 ngày cho phần thiếu từ thông báo kết quả. Không thay đổi nghĩa vụ khác. |
| COD-SELLER-FEE-REVIEW-SLA-01 | Admin xét phản đối cước seller trong 2 ngày làm việc: bỏ ngày nhận, deadline 17:00 ngày làm việc thứ hai theo giờ Việt Nam. Người xét và xử lý quá hạn còn cần quy định. |
| COD-SELLER-FEE-OVERDUE-01 | Nguồn bán quá hạn cước đã xác định, không còn đang được xét, bị chặn nhận order COD mới; vẫn được bán trả trước, xử lý đơn cũ, trả phí và bù trừ doanh thu. Chỉ áp đúng nguồn bán nợ cước, không áp sang nguồn khác của owner. |
| COD-SELLER-FEE-RESTORE-01 | Tự gỡ hạn chế COD do nợ cước khi tất cả khoản quá hạn của nguồn bán đã thanh toán hoặc được hủy theo kết quả xét. Không gỡ hạn chế vì lý do khác. Chỉ ghi MoMo đã trả khi có kết quả xác minh thành công, không dựa vào thao tác bấm trả hoặc ảnh chứng từ đơn phương. |
| COD-SELLER-FEE-EXCESS-01 | Nếu nghĩa vụ đã được bù trừ hợp lệ rồi MoMo mới xác nhận thu tiền, giữ bút toán bù trừ và refund phần MoMo thu vượt về đúng nguồn MoMo. Chỉ hoàn phần dư; không cộng thành số dư bán hàng hoặc thu hai lần cùng nghĩa vụ. |
| COD-SELLER-FEE-MIN-01 | Phần cước còn thiếu dưới ngưỡng MoMo vẫn ghi phải trả, bù trừ khi có doanh thu khả dụng; được gộp các khoản cùng nguồn bán đến đủ ngưỡng để thanh toán MoMo. Chưa tính quá hạn hoặc chặn COD khi chưa có cách thanh toán khả dụng cho khoản nhỏ này; không thu vượt lên ngưỡng tối thiểu. |
| COD-SELLER-FEE-AGGREGATE-DUE-01 | Khoản nhỏ chưa có deadline vì dưới ngưỡng, khi gộp cùng nguồn đủ ngưỡng thì tính 7 ngày từ thông báo tổng kèm danh sách phí. Không đặt lại deadline của khoản khác đã có thể thanh toán từ trước. |
| COD-SELLER-FEE-CORRECTION-01 | Khi xác định cước seller bị tính sai: hủy phần còn phải trả, trả phần đã khấu trừ vào số dư khả dụng của đúng nguồn bán; không chuyển sang tiền chờ quyết toán. Phần thu sai qua MoMo hoàn đúng nguồn MoMo, không cộng trùng số dư. |
| COD-FAILURE-FEE-INCONCLUSIVE-01 | Admin đã xét nhưng chưa đủ căn cứ quy trách nhiệm: sàn chịu cước thực tế chưa có căn cứ phân bổ, không thu buyer hoặc trừ seller, không tự quy lỗi hãng. Quy trình sửa kết quả nếu phát hiện sai sót rõ ràng sau đó còn cần chốt. |

### Cước và bồi thường khi lỗi hãng vận chuyển

| ID | Quyết định |
| --- | --- |
| COD-CARRIER-FEE-01 | Xác minh giao thất bại do lỗi carrier: không thu buyer/trừ seller. Sàn xử lý cước và yêu cầu hãng miễn, điều chỉnh hoặc hoàn theo kết quả đối soát thực tế; sàn có thể chịu phần hãng không chấp thuận. Chỉ ghi đã hoàn khi được xác nhận, không mặc định GHN bảo đảm miễn/hoàn. |
| COD-CARRIER-COMPENSATION-01 | Hãng làm mất/hỏng hoàn toàn kiện COD trước thu tiền: sàn đứng ra làm hồ sơ, chỉ ghi khoản bồi thường seller được nhận khi hãng xác nhận số tiền và điều kiện. Không ứng trước hoặc tự cam kết bù chênh lệch. Tách khoản bồi thường khỏi tiền bán hàng/hoa hồng; mức cụ thể theo hồ sơ được xác nhận, chưa có biểu bồi thường GHN đã kiểm chứng. |
| COD-CARRIER-COMPENSATION-02 | Hãng chấp thuận thì hiển thị “Chờ nhận bồi thường”; chỉ cộng khả dụng vào đúng nguồn bán khi sàn xác minh đã nhận giá trị thanh toán. Không giữ thêm 72 giờ như doanh thu giao hàng. Trường hợp bù trừ hoàn tất được làm rõ tại COD-CARRIER-COMPENSATION-04. |
| COD-CARRIER-COMPENSATION-03 | Nhận từng phần thì cộng khả dụng từng phần xác minh được thuộc hồ sơ; số còn thiếu tiếp tục chờ. Tổng đã cộng không vượt giá trị thực nhận, xử lý thông báo lặp không cộng lần nữa. |
| COD-CARRIER-COMPENSATION-04 | Bù trừ tiền bồi thường vào công nợ cước sàn được coi là đã nhận giá trị khi đối soát xác minh bù trừ hoàn tất và gắn đúng hồ sơ; cộng phần tương ứng vào khả dụng của nguồn bán. Không ghi đã nhận từ dự kiến/thông báo chưa xác minh. Đây là chính sách Rewear cho trường hợp phát sinh, không xác nhận GHN đã hỗ trợ hoặc đã test bù trừ. |
| COD-CARRIER-CLAIM-01 | Khi đã xác minh kiện thất lạc/hỏng hoàn toàn, hệ thống tự tạo hồ sơ bồi thường nội bộ, thông báo seller và giao admin thu thập bằng chứng làm việc với hãng. Không tự coi giao chậm/mã giao thất bại là thất lạc. Tạo hồ sơ chưa có nghĩa đã gửi hãng hoặc được chấp thuận. |
| COD-CARRIER-CLAIM-VIEW-01 | Seller được xem trạng thái, lịch sử cập nhật, yêu cầu bổ sung, bằng chứng thuộc hồ sơ mình, số tiền đề nghị/được duyệt/đã nhận và lý do từ chối/chênh lệch. Kiểm tra quyền theo đúng nguồn bán; không lộ dữ liệu người khác, credentials hoặc thông tin tài khoản tích hợp sàn. |
| COD-CARRIER-CLAIM-RESPONSE-01 | Admin kiểm tra và cập nhật đầu tiên trong 1 ngày làm việc từ tạo hồ sơ: bỏ ngày tạo, deadline 17:00 ngày làm việc kế tiếp theo giờ Việt Nam. Nêu đủ điều kiện gửi hãng hoặc thiếu gì. Đây không phải hạn hãng ra kết quả; gửi hồ sơ vẫn phải đáp ứng thời hạn hãng sau khi kiểm chứng. |
| COD-CARRIER-CLAIM-EVIDENCE-01 | Admin dùng bằng chứng hiện có, tìm nguồn thay thế và đối chiếu yêu cầu thực tế của hãng. Không tự đóng hồ sơ vì thiếu video/ảnh đóng gói chưa được quy định bắt buộc. Thiếu điều kiện hãng phải nêu căn cứ cụ thể và thông báo seller; không bảo đảm hãng chấp thuận bằng chứng thay thế. |
| COD-CARRIER-CLAIM-REVIEW-01 | Seller được nhờ sàn đề nghị hãng xét lại một lần khi nêu sai sót cụ thể hoặc bằng chứng bổ sung. Sàn đối chiếu rồi gửi theo quy trình/thời hạn hãng hỗ trợ; không hứa kết quả hoặc khả năng mở lại của hãng. Tách khỏi xét lại tranh chấp buyer–seller; hạn seller gửi đề nghị và thời hạn sàn xử lý còn cần chốt. |

### Giới hạn COD và nhận diện đặt–hủy lặp

| ID | Quyết định |
| --- | --- |
| COD-ABUSE-PENDING-01 | Mỗi buyer tối đa 3 lượt checkout COD còn order chờ seller xác nhận. Đếm theo lượt, không theo số seller; lượt còn ít nhất một order chưa xác nhận vẫn tính. Đã hủy hết hoặc được xác nhận hết thì không tính vào giới hạn chờ này. |
| COD-ABUSE-PENDING-ITEMS-01 | Tổng tối đa 20 món thuộc tất cả order COD đang chờ seller xác nhận của buyer, đồng thời không vượt 3 lượt chờ. Món đã hủy/được xác nhận không tính vào giới hạn món chờ này. |
| COD-ABUSE-LIMIT-EXCEEDED-01 | Vượt hạn mức thì chặn lượt đặt COD mới, báo số lượt/số món còn được đặt để buyer tự chọn lại. Không xóa giỏ, tạo order hoặc khóa thêm hàng cho lượt bị chặn. Buyer có thể chuyển trả trước nếu đáp ứng điều kiện khác. |
| COD-ABUSE-ACTIVE-01 | Mỗi buyer tối đa 5 lượt COD chưa kết thúc giao nhận, gồm chờ xác nhận, chuẩn bị giao, đang giao và chuyển hoàn. Một lượt chỉ hết tính khi mọi order đã giao thành công hoặc đã hủy/hoàn tất chuyển hoàn. Áp dụng đồng thời, không thay giới hạn 3 lượt/20 món chờ xác nhận. |
| COD-ABUSE-CANCEL-THRESHOLD-01 | Kích hoạt kiểm soát đặt–hủy lặp khi buyer tự hủy vì đổi ý trước seller xác nhận ở 5 lượt checkout COD khác nhau trong 24 giờ trượt. Một lượt hủy nhiều order vẫn tính một lần. Loại trừ hủy do seller/carrier/lỗi hệ thống hoặc admin xác định buyer không có lỗi. Biện pháp lần đầu/lần hai theo các quyết định bên dưới; không mặc định blacklist/khóa tài khoản. |
| COD-ABUSE-FIRST-RESTRICTION-01 | Lần đầu chạm ngưỡng thì chặn đặt COD mới 24 giờ từ thời điểm chạm ngưỡng, thông báo lý do và giờ mở lại. Vẫn được mua trả trước, xử lý đơn cũ, hủy hợp lệ và hỗ trợ; không tự hủy đơn đang có hoặc coi đây là blacklist. |
| COD-ABUSE-RESTRICTION-CLOCK-01 | Hủy order cũ trong lúc bị chặn không đặt lại/kéo dài đồng hồ đợt chặn hiện tại; vẫn lưu lịch sử để xét tái diễn theo quy tắc riêng. |
| COD-ABUSE-RESTORE-01 | Hết hạn tự gỡ riêng hạn chế đặt–hủy. Chỉ đặt COD được khi không còn hạn chế khác và chưa vượt hạn mức COD; không xóa lịch sử vi phạm. Nợ phí quá hạn vẫn chặn theo nguyên nhân nợ dù đợt đặt–hủy đã hết. |
| COD-ABUSE-REPEAT-WINDOW-01 | Xét các lần bị hạn chế trong 30 ngày liên tục tính lùi từ lần chạm ngưỡng mới để xác định tái diễn. Ngưỡng mới phải dùng lượt hủy phát sinh sau khi mở lại, vẫn đạt 5 lượt/24 giờ trượt; không dùng lại các lượt gây đợt chặn trước. |
| COD-ABUSE-SECOND-RESTRICTION-01 | Lần thứ hai chạm ngưỡng trong 30 ngày thì chặn COD mới 72 giờ. Chỉ hạn chế COD mới, vẫn mua trả trước, xử lý đơn cũ và hỗ trợ; quy tắc không kéo dài đợt chặn và tự gỡ riêng nguyên nhân vẫn áp dụng cho đợt có hạn. Lần thứ ba theo COD-ABUSE-THIRD-RESTRICTION-01. |
| COD-ABUSE-THIRD-RESTRICTION-01 | Lần thứ ba chạm ngưỡng trong 30 ngày thì chặn COD mới và chuyển admin xét mở lại, không tự mở theo mốc 24/72 giờ. Vẫn mua trả trước, xử lý đơn cũ và hỗ trợ; không tự khóa toàn bộ tài khoản. |
| COD-ABUSE-THIRD-REVIEW-01 | Không đặt SLA cố định cho admin xét hạn chế lần ba; giữ chặn COD đến quyết định dựa trên hồ sơ cụ thể. Đây là ngoại lệ riêng, không thay SLA tranh chấp/phí/sự cố khác đã chốt. Không coi hết thời gian là điều kiện tự mở COD. |
| COD-ABUSE-EXPLANATION-01 | Buyer được gửi một bản giải trình kèm bằng chứng trong hồ sơ trước quyết định; chỉ bổ sung tiếp khi admin yêu cầu. Không tự mở COD khi nộp giải trình. |
| COD-ABUSE-INDEFINITE-01 | Admin xử lý được chặn COD không thời hạn khi xác minh buyer cố ý lạm dụng nhiều lần; phải lưu bằng chứng, lý do và thông báo buyer. Không bắt buộc admin thứ hai duyệt; không mở rộng thành khóa toàn bộ tài khoản. |
| COD-ABUSE-INDEFINITE-REVIEW-01 | MVP không có bước buyer yêu cầu xét lại quyết định chặn COD không thời hạn; admin chỉ sửa khi tự phát hiện sai sót. Phạm vi này không tước quyền phản đối phí/tranh chấp khác, hoặc quyền giải trình trước quyết định. |
| COD-ABUSE-DELIVERY-COUNTER-01 | Tách bộ đếm/ngưỡng giao COD thất bại do lỗi buyer khỏi tự hủy trước xác nhận. Chỉ tính sau khi admin xác minh; không tính lỗi seller/carrier hoặc chưa đủ căn cứ. |
| COD-ABUSE-DELIVERY-COUNT-01 | Mỗi order giao thất bại do lỗi buyer được admin xác minh tính một lần. Cập nhật lặp hoặc giao lại thất bại cùng order không tính thêm. Một checkout có nhiều order đủ điều kiện thì tính từng order riêng. |
| COD-ABUSE-DELIVERY-THRESHOLD-01 | Lần đầu kích hoạt khi có 2 order COD giao thất bại do lỗi buyer trong 30 ngày trượt theo thời điểm giao thất bại đã xác minh; chỉ áp dụng sau kết luận admin. Thanh toán cước không xóa lần vi phạm. |
| COD-ABUSE-DELIVERY-FIRST-01 | Lần đầu đạt ngưỡng thì chặn COD mới 7 ngày từ khi hệ thống áp dụng hạn chế sau kết luận admin. Vẫn mua trả trước, xử lý đơn cũ và trả phí; hết 7 ngày không tự gỡ hạn chế khác như nợ phí quá hạn. |
| COD-ABUSE-DELIVERY-REPEAT-01 | Sau mở lại COD, thêm 1 order có sự kiện giao thất bại mới do lỗi buyer đã xác minh thì tính tái diễn nếu còn lần hạn chế giao thất bại trước trong 30 ngày tính lùi. Sự kiện mới phải sau lúc mở lại, không dùng lại order gây đợt cũ. Mức xử lý theo COD-ABUSE-DELIVERY-REPEAT-ACTION-01. |
| COD-ABUSE-DELIVERY-REPEAT-ACTION-01 | Tái diễn giao COD thất bại do lỗi buyer: chặn COD mới, chuyển admin xét mở lại, không SLA cố định. Vẫn mua trả trước, xử lý đơn cũ và hỗ trợ. |
| COD-ABUSE-DELIVERY-REVIEW-01 | Dùng chung quy trình admin của đặt–hủy nghiêm trọng: buyer giải trình một lần, admin quyết định theo bằng chứng, có thể chặn COD không thời hạn khi xác minh cố ý lạm dụng. MVP không có bước buyer yêu cầu xét lại quyết định chặn không thời hạn; admin sửa khi tự phát hiện sai sót. Đạt bộ đếm không tự chứng minh lạm dụng cố ý. |
| COD-ABUSE-MULTIPLE-RESTRICTIONS-01 | Các hạn chế COD chạy độc lập từ lúc áp dụng, không cộng dồn thời lượng. Chỉ mở COD khi tất cả nguyên nhân đã hết/được gỡ, hiển thị riêng lý do và hạn. Còn nguyên nhân chờ admin thì không hứa ngày tự mở tổng thể. |
| COD-ABUSE-CORRECTION-01 | Admin sửa kết luận order từ lỗi buyer thành buyer không có lỗi: tự loại khỏi bộ đếm, tính lại và gỡ/điều chỉnh hạn chế có căn cứ không còn đúng; lưu lịch sử và truy vết order làm căn cứ. Không xóa vi phạm thật hoặc gỡ khoản nợ/hạn chế không liên quan. |
| COD-ABUSE-EVASION-01 | Admin được áp hạn chế tương ứng sang tài khoản khác khi xác minh cùng người và có hành vi né chặn COD; phải lưu bằng chứng/lý do. Cùng địa chỉ, IP hoặc thiết bị chỉ là dấu hiệu kiểm tra, chưa đủ để tự kết luận. Không tự áp sang mọi tài khoản cùng số điện thoại hoặc tự khóa toàn bộ tài khoản. Thời hạn theo COD-ABUSE-EVASION-DURATION-01. |
| COD-ABUSE-EVASION-DURATION-01 | Tài khoản né chặn dùng cùng thời điểm kết thúc với hạn chế gốc; gốc chờ admin/không thời hạn thì áp tương ứng. Liên kết hạn chế để cập nhật khi gốc hết hạn hoặc bị sửa, không đặt lại toàn bộ thời lượng từ lúc phát hiện tài khoản mới. |

### Phương thức checkout và thời hạn bàn giao COD

| ID | Quyết định |
| --- | --- |
| CHECKOUT-PAYMENT-METHOD-01 | Mỗi checkout chỉ chọn một phương thức: MoMo, toàn bộ bằng ví Rewear hoặc COD; không trộn phương thức theo order. Muốn dùng khác phương thức thì tách checkout. Phạm vi các phương thức con qua MoMo vẫn cần kiểm chứng/chốt riêng. |
| COD-HANDOVER-DEADLINE-01 | Seller bàn giao order COD cho GHN trong 48 giờ liên tục từ xác nhận order. Mốc hoàn thành dựa trên sự kiện hãng nhận kiện đã xác minh, không chỉ tạo vận đơn hoặc seller bấm đã gửi. Trường hợp hãng lấy hàng chậm cần xét riêng. |
| COD-HANDOVER-OVERDUE-01 | Quá 48 giờ chưa xác minh GHN nhận hàng: đánh dấu quá hạn, thông báo buyer/seller và chuyển admin kiểm tra nguyên nhân để quyết định hủy hoặc tiếp tục. Giữ khóa hàng, không tự báo đã hủy/đã bàn giao hoặc quy lỗi seller khi thiếu căn cứ. |
| COD-HANDOVER-REVIEW-SLA-01 | Admin ra hướng xử lý order quá hạn bàn giao trong 2 ngày làm việc từ khi hệ thống ghi quá hạn và tạo hồ sơ; không chờ seller phản hồi mới tính. Bỏ ngày tạo, deadline 17:00 ngày làm việc thứ hai theo giờ Việt Nam. Tiếp tục giao cần điều kiện của nhóm COD-HANDOVER-EXTENSION. |
| COD-HANDOVER-EXTENSION-CONSENT-01 | Muốn tiếp tục giao sau hạn bàn giao, buyer phải đồng ý với deadline mới; không đồng ý thì chuyển hủy an toàn. Không tự cho tiếp tục chỉ vì admin/seller xác định có thể giao hoặc lỗi thuộc carrier. |
| COD-HANDOVER-EXTENSION-LIMIT-01 | Deadline bàn giao mới tối đa 24 giờ liên tục từ lúc buyer đồng ý; hiển thị ngày giờ cụ thể trước xác nhận. |
| COD-HANDOVER-EXTENSION-RESPONSE-01 | Buyer có 12 giờ liên tục từ thông báo đề nghị để đồng ý/từ chối; thông báo kèm lý do chậm và deadline dự kiến. Chưa phản hồi không được coi là đã đồng ý. |
| COD-HANDOVER-EXTENSION-TIMEOUT-01 | Hết 12 giờ buyer không phản hồi thì chuyển hủy an toàn; không coi là đồng ý hoặc tự tính thành buyer hủy đổi ý. Nếu có vận đơn thì xác minh hủy an toàn trước khi nhả hàng. |
| COD-HANDOVER-EXTENSION-EXHAUSTED-01 | Chỉ một lần chờ thêm sau quá hạn; hết deadline mới vẫn chưa xác minh GHN nhận hàng thì chuyển hủy an toàn, không gia hạn tiếp. Xét riêng trách nhiệm/chi phí. Hàng thực tế đã bàn giao nhưng dữ liệu chậm phải kiểm tra sự kiện thật; không đánh dấu hủy thành công/nhả hàng khi kiện đang vận chuyển. |
| COD-HANDOVER-PENDING-BLOCK-01 | Trong lúc admin xét quá hạn hoặc buyer chưa phản hồi đề nghị giao trễ, chặn bàn giao trong Rewear; chỉ tiếp tục sau khi admin đề xuất và buyer đồng ý deadline mới. Không coi chặn trong app là bảo đảm hãng chưa lấy kiện ngoài hệ thống. |
| COD-HANDOVER-PICKED-EXCEPTION-01 | Nếu xác minh GHN đã lấy kiện lúc còn chờ buyer đồng ý, thông báo tình trạng thực tế và vẫn để buyer quyết định. Đồng ý thì tiếp tục; từ chối/quá hạn phản hồi thì đề nghị hãng chặn giao/chuyển hoàn và theo dõi đến kết quả. Không coi đề nghị là đã hủy hoặc tự nhả hàng; khả năng API cần kiểm chứng, phí/trách nhiệm xét riêng. |
| COD-HANDOVER-BUYER-REFUSAL-01 | Nếu buyer đã từ chối giao trễ hợp lệ mà kiện vẫn được đưa đến, buyer được từ chối nhận, không tính lỗi/vi phạm hoặc thu cước buyer. Đối chiếu đúng order và lịch sử lựa chọn, không chỉ lời khai sau giao thất bại. Trách nhiệm phí xét riêng ở seller/carrier/sàn. |
| COD-HANDOVER-ADMIN-TIMEOUT-01 | Hết 2 ngày làm việc xét quá hạn bàn giao mà admin chưa xử lý và buyer chưa đồng ý chờ thì chuyển hủy an toàn, thông báo các bên. Kiện đã lấy xử lý chặn giao/chuyển hoàn; không tự báo đã hủy thành công, nhả hàng, quy lỗi hoặc thu phí buyer. |
| COD-SHIPMENT-CREATE-01 | Sau xác nhận order COD, seller chủ động bấm tạo vận đơn khi chuẩn bị hàng xong; backend gọi GHN, vẫn phải bàn giao trong hạn 48 giờ. Dùng địa chỉ/kiện/số tiền từ dữ liệu đã xác thực, không cho seller tự sửa số tiền COD tùy ý. Không tự tạo ngay khi seller xác nhận hoặc chờ admin tạo mặc định. |

### Phí ship cố định và thông số kiện thực giao COD

| ID | Quyết định |
| --- | --- |
| COD-SHIPPING-DIFFERENCE-01 | Địa chỉ/thông tin kiện đều đúng nhưng cước tăng sau khi đặt COD: sàn chịu phần chênh lệch hợp lệ, giữ nguyên số tiền buyer đã xác nhận. Không tự bắt buyer xác nhận tổng tăng hoặc trừ seller khai đúng. |
| COD-SHIPPING-FIXED-FEE-01 | Ship buyer đã đồng ý là mức phí cố định: sàn chịu tăng cước hợp lệ khi khai đúng và giữ phần giảm cước, không tự hoàn phần giảm. Công bố rõ đây không phải thu hộ đúng cước hãng. Không lấy số liệu minh họa làm biểu phí GHN thực tế. |
| COD-SHIPPING-SELLER-ERROR-01 | Seller chịu phần tăng đã xác minh thực sự do khai sai kiện; buyer giữ tổng tiền cũ. Không tự quy toàn bộ chênh lệch hoặc lỗi tính/gộp kiện của Rewear là lỗi seller. |
| COD-SHIPPING-SELLER-ERROR-PROCESS-01 | Phần tăng do seller khai sai dùng chung quy trình cước seller chịu: khấu trừ khả dụng đúng nguồn, thiếu ghi phải trả/bù trừ hoặc MoMo; hạn 7 ngày, phản đối một lần/admin xét 2 ngày làm việc và quy tắc tạm dừng; quá hạn chặn COD đúng nguồn; khoản nhỏ/thu vượt/thu sai theo các quyết định tương ứng. Gắn order/chứng từ đo/đối soát và phần tăng được chấp nhận, không thu trùng. |
| COD-SHIPMENT-ACTUAL-PACKAGE-01 | Seller được nhập khối lượng/kích thước kiện thực tế trước tạo vận đơn; backend kiểm tra, lưu riêng và tính lại cước đối chiếu. Giữ snapshot thông số lúc đặt; không sửa sản phẩm/giá hàng hoặc xóa bằng chứng cũ. Không tự đổi tiền COD buyer đã xác nhận. Trách nhiệm chênh lệch dựa trên nguyên nhân đã xác minh, không chỉ vì có chỉnh thông số. |

### Xác minh thu COD, đối soát và thưởng buyer

| ID | Quyết định |
| --- | --- |
| COD-COLLECTION-VERIFY-01 | Ưu tiên dữ liệu thu COD GHN đã kiểm chứng, đối chiếu đúng vận đơn/số tiền. Thiếu hoặc mâu thuẫn thì admin đối soát bằng chứng trước xác nhận; delivered chưa đủ. Phần sandbox chưa kiểm chứng phải ghi rõ mô phỏng, không coi test trạng thái giao là chứng minh đã thu tiền. |
| COD-SETTLEMENT-RECEIPT-01 | Chỉ mở tiền seller khi đủ 72 giờ từ giao thành công, không tranh chấp và xác minh sàn đã nhận COD. Chưa nhận thì hiển thị đang chờ đối soát, không tự ứng vốn dù buyer đã trả cho hãng. |
| COD-SETTLEMENT-NET-RECEIPT-01 | Có thể xác nhận nhận đủ COD khi đối soát khớp tổng thu, cước khấu trừ hợp lệ và tiền thực chuyển đúng vận đơn. Không coi phần cước có chứng từ là thiếu COD và không trả cước lần nữa. Seller vẫn tính tiền hàng/hoa hồng/điều chỉnh theo quy tắc đã chốt. Đây là chính sách xử lý nếu có, chưa xác nhận luồng GHN đã kiểm thử. |
| COD-SETTLEMENT-PARTIAL-01 | Hãng mới chuyển một phần số COD thực sự phải chuyển của order thì chờ nhận đủ, đối soát xong mới mở tiền seller một lần. Không tự áp mở từng phần của bồi thường sang tiền hàng. Các điều kiện 72 giờ/không tranh chấp vẫn phải đáp ứng. |
| COD-COIN-REWARD-RECEIPT-01 | Buyer đã trả COD xác minh, hết 72 giờ và không tranh chấp thì được thưởng xu theo order, không chờ hãng chuyển đủ COD về sàn. Có tranh chấp chờ kết luận cuối/xác định refund theo quy tắc thưởng đã chốt; cơ sở thưởng sau trừ xu/refund, không gồm ship, tỷ lệ 0,5% và làm tròn xuống một lần/order. |

### Refund COD và điều chỉnh xu thưởng

| ID | Quyết định |
| --- | --- |
| COD-REFUND-ADVANCE-01 | Buyer đã trả COD xác minh, có quyết định refund cuối cùng và hoàn tất điều kiện trả hàng nếu có thì sàn ứng refund, không chờ hãng chuyển COD; tiếp tục đối soát hãng. Đây là ứng refund buyer, không thay quyết định không ứng tiền bán hàng seller. |
| COIN-REWARD-ADJUSTMENT-01 | Refund bổ sung/điều chỉnh sau cấp thưởng làm giảm quyền thưởng thì tính lại, thu hồi phần xu thưởng thừa, lưu lý do và thông báo buyer. Không tự trừ tiền ví. Không coi đây là luồng cấp thưởng bình thường trước khi kết thúc tranh chấp. |
| COIN-REWARD-RECOVERY-01 | Thu hồi trong phạm vi xu khả dụng; thiếu thì ghi “Xu thưởng chờ thu hồi” và bù trừ từ xu thưởng mua hàng được cấp sau. Không tạo số dư xu âm để trừ mọi nguồn cấp, không chặn mua hoặc tự lấy tiền ví/xu đang giữ cho checkout khác. |
| COIN-REWARD-RELEASE-RECOVERY-01 | Checkout hủy và nhả lại chính khoản xu thưởng đã bị điều chỉnh thì ưu tiên thu hồi đến số còn thiếu, chỉ trả phần dư về khả dụng; truy vết đúng khoản thưởng. Không tự hủy checkout đang hoạt động để thu hồi. |
| WALLET-REFUND-EXECUTION-01 | Khi refund vào ví Rewear đã có quyết định hiệu lực cuối cùng và đủ điều kiện thực hiện, tự động cộng đúng số tiền duyệt, ghi giao dịch/thông báo, chống cộng trùng và xử lý lỗi. Không thêm bước admin duyệt chi mặc định; không phải tự động chấp thuận khiếu nại. Refund MoMo là luồng API riêng. |
| WALLET-REFUND-SLA-01 | Refund ví hoàn tất trong 5 phút từ khi đủ mọi điều kiện thực hiện, bình thường cộng ngay; không tính từ lúc mới gửi khiếu nại. Chưa có xác nhận thành công thì hiển thị đang xử lý, không báo đã hoàn. Đây là mục tiêu triển khai/kiểm thử, chưa xác nhận code đáp ứng. |
| WALLET-REFUND-PER-ISSUE-01 | Refund phần đã có kết luận cuối và đủ điều kiện ngay, không chờ vấn đề khác trong cùng order. Phần tiền seller còn lại vẫn khóa đến khi toàn bộ hồ sơ/bước xét lại kết thúc. Làm rõ giữ tiền chung không đồng nghĩa giữ phần refund buyer đã đủ điều kiện. |
| WALLET-REFUND-OVERDUE-01 | Quá 5 phút chưa hoàn tất thì ghi nhận vi phạm SLA, thông báo buyer và cảnh báo admin ngay; tiếp tục tự xử lý an toàn. Buyer không gửi lại yêu cầu. Mỗi lần thử lại kiểm tra bút toán đã cộng để tránh cộng trùng khi mất phản hồi. |
| WALLET-REFUND-INCIDENT-RESPONSE-01 | Admin tiếp nhận và cập nhật hướng xử lý trong 4 giờ liên tục từ cảnh báo. Nêu tình trạng refund, bước đã thực hiện và mốc cập nhật tiếp, không chỉ thông báo chung đang xử lý. Đây là hạn phản hồi/xử lý ban đầu, không cam kết mọi lỗi hạ tầng sửa xong trong 4 giờ. |
| WALLET-REFUND-EXCESS-VERIFY-01 | Nếu ví cộng thừa so với quyết định, admin kiểm tra quyết định và sổ giao dịch, xác nhận khoản thừa trước khi điều chỉnh giảm. Chỉ xử lý phần thừa đã xác minh, lưu căn cứ/thông báo; không tạo số dư âm hoặc tự lấy tiền giao dịch khác ngoài quy tắc bù trừ refund tại WALLET-EXCESS-RECOVERY-01. |
| WALLET-EXCESS-RECOVERY-01 | Phần tiền cộng thừa buyer đã sử dụng ghi thành khoản phải hoàn trả riêng, thông báo căn cứ và bù trừ từ refund vào ví phát sinh sau. Không tạo số dư ví âm, tự hủy đơn đã mua hoặc mặc định buyer gian lận vì đã dùng trước thông báo. Buyer có quyền phản đối theo các quy tắc bên dưới. |
| WALLET-EXCESS-REVIEW-HOLD-01 | Buyer phản đối thì tạm dừng bù trừ khoản đang xét; refund hợp lệ phát sinh sau vẫn cộng đầy đủ vào khả dụng, không giữ phần tranh cãi. Tiếp tục xử lý nghĩa vụ theo kết quả xét. |
| WALLET-EXCESS-REVIEW-WINDOW-01 | Buyer có 7 ngày liên tục từ thông báo số tiền/giao dịch/căn cứ xác minh để gửi phản đối khoản phải hoàn trả. |
| WALLET-EXCESS-REVIEW-SLA-01 | Admin xét phản đối trong 2 ngày làm việc: bỏ ngày nhận, hạn 17:00 ngày làm việc thứ hai theo giờ Việt Nam. Trong lúc xét vẫn dừng bù trừ. |
| WALLET-EXCESS-REVIEW-COUNT-01 | Mỗi quyết định thu hồi được phản đối một lần, cần sai sót hoặc bằng chứng cụ thể; bổ sung khi admin yêu cầu trong cùng hồ sơ. Không thêm vòng xét lại mặc định. Admin vẫn sửa khi tự phát hiện sai, không giữ bút toán đã biết sai vì hết số lần phản đối. |

### Câu còn treo và việc cần hỏi tiếp

- **Câu đang chờ trả lời:** buyer có được chủ động trả khoản tiền ví cộng thừa
  đã xác định qua MoMo không? Các lựa chọn là trả MoMo song song với bù trừ
  refund tương lai, chỉ bù refund, hoặc trả thủ công qua admin. Chưa có lựa chọn;
  không coi đề xuất A của assistant là quyết định.
- **Câu 29 chưa trả lời:** order đã thanh toán nhưng chưa bàn giao khi seller
  bị kết luận giả mạo sẽ hủy/refund, tạm dừng xét hay tiếp tục giao? Đơn đang
  vận chuyển và số dư của tài khoản bị kết luận giả mạo cũng chưa chốt.
- **Tích hợp MoMo:** phạm vi chỉ ví hay thêm ATM chưa được chọn trực tiếp.
  PAYMENT-RECONCILE-02/03 là lịch mục tiêu chưa kiểm thử; phải xác minh giới hạn
  API, thời hạn giao dịch, thời điểm thực thu/callback, tiền đến muộn, retry và
  refund pending/lỗi, cùng số tiền ngoài ngưỡng của luồng đã chọn.
- **GHN Sandbox:** đã chọn tích hợp vận đơn COD; đối soát không thử được thì
  mô phỏng riêng và ghi rõ giới hạn. Chưa xác minh đầy đủ webhook, thay đổi/hủy/
  chặn giao, chuyển hoàn, đối soát và bồi thường qua backend. Không dùng lịch sử
  test công cụ hoặc delivered làm bằng chứng tiền đã thu/chuyển.
- **COD và vận đơn:** tạo lỗi/chưa rõ/trùng; sửa kiện sau tạo, đổi điểm lấy hàng,
  dữ liệu giao nhận sai thứ tự, thu COD sai số tiền và theo dõi đối soát chậm.
  Cần xử lý trạng thái thực tế khi hãng đã lấy kiện ngoài thao tác trong Rewear.
- **Cước và bồi thường:** xử lý admin quá SLA, sửa kết quả sau đó, phản đối mức
  bồi thường theo thời hạn hãng, hàng thất lạc tìm lại và refund chưa rõ/thất bại.
  Các nhóm đã chốt xem COD-CANCEL-FEE, COD-SELLER-FEE và COD-CARRIER.
- **Chống lạm dụng:** đã chốt giới hạn và hạn chế COD trong nhóm COD-ABUSE.
  Còn mở kết quả khác của admin lần ba, tái phạm sau khi admin mở lại, vi phạm từ
  order cũ lúc đang chặn và chống spam giỏ/checkout online. Uy tín/đánh giá riêng
  seller cá nhân và shop chưa chốt; rate limiting không phải hệ thống uy tín.
- **Tranh chấp/trả hàng:** nghĩa vụ bằng chứng theo loại vấn đề; hai bên đều
  hợp tác nhưng không đủ căn cứ; người tiếp nhận chuyển cấp và sự cố tiếp tục
  quá hạn; điều kiện miễn trả, vận chuyển trả hàng, chi phí và xử lý thiếu số dư.
  SLA ra quyết định không phải tổng thời gian giữ tiền vì còn xét lại/trả hàng.
- **Ví và xu:** xử lý sau kết quả phản đối thu hồi tiền thừa; chủ động hoàn trả
  đang là câu chờ; lỗi thu hồi/refund, chương trình/admin cấp xu, quyền/ngân sách,
  phân bổ/làm tròn xu/hoa hồng và cách kết hợp ví với xu. Không tự đưa phương án
  chưa hỏi vào quyết định đã chốt.
- **Lịch:** ngày nghỉ bù, các biên thời gian chính xác và thông báo còn cần làm rõ.
- Tiếp tục rà tài khoản, shop/staff, sản phẩm, rút tiền và hồ sơ đồ án. Survey,
  phân công/SRS/KPI và xác nhận GVHD còn mở như phiên trước.
