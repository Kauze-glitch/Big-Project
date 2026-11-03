# Dùng Telegram OTP trên bản đồ án

1. Lưu API token tại Supabase → Edge Functions → Secrets, tên **TELEGRAM_GATEWAY_TOKEN**. Không đưa token vào frontend, repo hoặc chat. Nhóm đã xác nhận lưu secret và nhận được mã đăng nhập thật ngày 03/11/2026; trang **Phân quyền và bảo mật** kiểm tra máy chủ có nhận được token hay chưa, không đọc giá trị token ra trình duyệt.
2. Đăng nhập thành viên trên trang báo cáo, mở cổng công dân → Quản lý hồ sơ. Người thao tác cần quyền **Quản trị nghiệp vụ** hoặc **Cán bộ tiếp nhận**.
3. Tạo hồ sơ với căn cước đủ 12 chữ số, số liên hệ 10 chữ số hoặc dạng quốc tế, lưu hồ sơ, rồi **Cấp tài khoản** với mật khẩu riêng nếu chưa cấp. Không nhập CCCD thật.
4. Ở dòng hồ sơ, chọn **Kênh nhận OTP** → **Telegram Gateway**. Nhập số nhận mã đã đăng ký Telegram. Có thể nhập số Việt Nam dạng 09… hoặc +849…; hệ thống tự chuẩn hóa, kể cả khi thừa số 0 sau +84. Số quốc tế khác cần dấu + và mã nước. Đây là số nhận OTP riêng, không thay điện thoại liên hệ minh họa của hồ sơ. Chỉ dùng số của người đã đồng ý nhận mã; với bài thử đầu nên dùng số của chính chủ tài khoản Gateway.
5. Lưu cấu hình. Thao tác này chưa gửi tin, nhưng thu hồi các phiên đăng nhập cũ. Trong bản đồ án, cùng một số thử có thể dùng cho nhiều hồ sơ; cách đó chỉ phục vụ thử chức năng, không chứng minh danh tính riêng của các công dân.
6. Mở trang đăng nhập công dân, nhập CCCD minh họa và mật khẩu riêng. Nếu tài khoản chọn Telegram, hệ thống gửi mã 6 số qua Gateway. Nhập mã trong Telegram; website không hiển thị mã thật. Mã có hạn 2 phút, gửi lại sau 30 giây và khóa mã sau 5 lần sai.
7. Nếu số chưa dùng Telegram, token lỗi, thiếu số dư hoặc mất mạng, trang báo lỗi; không tự chuyển sang mã mô phỏng. Thành viên có thể đổi lại kênh demo một cách rõ ràng để trình bày khi không dùng gửi thật.

Gửi đến số của chính chủ Gateway được miễn phí; các số khác có thể tính phí theo Gateway. Giới hạn toàn dự án mặc định 20 lần gửi mỗi 24 giờ; có thể thêm TELEGRAM_DAILY_LIMIT trong Secrets (1–100). Giới hạn tính cả một số lần thử thất bại nên có thể đạt trước số tin giao thành công.

Kiểm thử tự động trong repo dùng nhà cung cấp giả lập và không tính phí. Chỉ khi thử đăng nhập bằng số thật và nhận mã trong Telegram mới xác nhận được gửi thực tế.

Nguồn: [Telegram Gateway API](https://core.telegram.org/gateway/api).
