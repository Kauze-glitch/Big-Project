# Trợ lý giọng nói của Cổng công dân

Cổng công dân (`portal.html`) có hai nút ở góc dưới bên phải màn hình:

- **🔊 Nghe hướng dẫn**: dành cho mọi người, kể cả khách chưa đăng nhập. Máy đọc to các bước của màn hình đang mở (đăng nhập, nhập mã OTP, từng trang hồ sơ) và đọc cả thông báo lỗi đang hiện. Nút này dùng giọng đọc có sẵn trên thiết bị (`speechSynthesis`), không gọi AI và không tốn phí.
- **💬 Hỏi trợ lý**: chỉ hiện với công dân đã xác thực OTP và với thành viên dự án. Người dùng bấm **Bấm để nói** để nói câu hỏi (`SpeechRecognition`, tiếng Việt), hoặc gõ chữ. Gemini trả lời bằng câu ngắn, theo từng bước, và câu trả lời được đọc to tự động. Muốn tắt đọc tự động thì bỏ chọn ô tương ứng.

Mã nguồn nằm ở `portal-assistant.js`, `portal-assistant.css` và `supabase/functions/gemini-assistant/index.ts` (thao tác `operation: "guide"`).

## Triển khai

1. Chạy `supabase/migrations/20261119000000_ai_guide_quota.sql` trong SQL Editor. Lệnh này tạo bảng `ai_guide_usage` và hàm `reserve_ai_guide_request`. Giới hạn là 5 câu/phút và 40 câu/ngày cho mỗi tài khoản, tính riêng với hạn mức của thành viên.
2. Secret `GEMINI_API_KEY` (và `GEMINI_MODEL` nếu cần) đặt trong Edge Functions → Secrets như trước. Không đưa key vào mã nguồn.
3. Deploy lại function `gemini-assistant`. Giữ `verify_jwt = false` như trong `supabase/config.toml`, vì function tự xác minh mọi bearer token.

## Kiểm soát truy cập và dữ liệu

- Máy chủ xác minh token bằng Supabase Auth `/user`. Sau đó máy chủ chỉ cho phép khi `cd_current_citizen()` trả về công dân, nghĩa là phiên đã qua OTP, hoặc khi tài khoản là chủ một phần trong bảng `sections`, tức thành viên dự án. Người khác bị từ chối trước khi gọi Gemini và trước khi trừ hạn mức.
- Gemini chỉ nhận một bản hướng dẫn sử dụng cố định, tên màn hình đang mở, câu hỏi và tối đa 3 cặp hỏi–đáp gần nhất. Không gửi hồ sơ công dân, số căn cước hay token.
- Lời nhắc hệ thống yêu cầu trả lời đơn giản, dễ nghe, không Markdown, và không bao giờ hỏi mật khẩu, mã OTP hay số căn cước. Câu trả lời hiển thị bằng `textContent`, nên HTML do AI tạo không chạy được.
- Lịch sử chat chỉ nằm trong bộ nhớ tab. Lịch sử bị xóa khi đăng xuất hoặc đổi tài khoản, và không lưu vào DB.

## Thiết bị hỗ trợ

- Đọc to chạy trên Chrome, Edge và Safari. Chất lượng phụ thuộc giọng tiếng Việt có trên máy: Android, iOS và macOS thường có sẵn; Windows có thể phải cài thêm gói giọng nói tiếng Việt. Nếu không có giọng tiếng Việt, trang hiện nhắc nhở.
- Nói bằng micro cần Chrome hoặc Edge, kể cả trên Android, hoặc Safari mới. Trình duyệt không hỗ trợ sẽ ẩn nút micro và chỉ còn ô gõ chữ. Lần đầu dùng, trình duyệt hỏi quyền micro.

## Kiểm thử

- `tests/portal-assistant.test.mjs`: hướng dẫn đọc to cho khách, bước OTP và đọc lỗi; công dân hỏi bằng chữ; HTML hiển thị như chữ; đăng xuất thì ẩn và xóa hội thoại.
- `tests/gemini-guide.test.mjs`: công dân đã OTP và thành viên được phép; người khác bị từ chối trước khi gọi Gemini; thiếu token, hết hạn mức hoặc nhập quá dài đều bị chặn.
- Cần thử thật một lượt trên điện thoại với tài khoản công dân sau khi deploy, để xác nhận key, model, hạn mức và giọng đọc của thiết bị.

## Thao tác cũ cho trang báo cáo

Function vẫn giữ hai thao tác `chat` và `rewrite` cũ dành cho thành viên. Giao diện trang báo cáo đã bị gỡ khỏi repo nên hiện không còn trang nào gọi hai thao tác này. Bảng `ai_usage` và `supabase/20261023_ai_quota.sql` được giữ để không làm hỏng dữ liệu đã có.
