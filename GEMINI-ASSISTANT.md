# Trợ lý giọng nói của Cổng công dân

Cổng công dân (`portal.html`) có hai nút ở góc dưới bên phải màn hình:

- **🔊 Nghe hướng dẫn**: dành cho mọi người, kể cả khách chưa đăng nhập. Máy đọc to các bước của màn hình đang mở (đăng nhập, nhập mã OTP, từng trang hồ sơ) và đọc cả thông báo lỗi đang hiện. Nút này dùng giọng đọc có sẵn trên thiết bị (`speechSynthesis`), không gọi AI và không tốn phí.
- **🎙 Nói với trợ lý**: chỉ hiện với công dân đã xác thực OTP và với thành viên dự án. Bấm một lần là khung trợ lý mở và bắt đầu nghe ngay (`SpeechRecognition`, tiếng Việt). Người dùng nói câu hỏi, Gemini trả lời bằng câu ngắn theo từng bước, và câu trả lời được đọc to. Ở chế độ **trò chuyện liên tục** (bật sẵn), đọc xong trợ lý tự nghe tiếp câu hỏi sau. Nếu không nghe thấy gì thì dừng lại, không lặp. Bấm micro khi trợ lý đang đọc sẽ ngắt lời để hỏi tiếp. Vẫn có ô gõ chữ cho trình duyệt không nghe được giọng nói.
- **Đưa tới đúng chỗ**: khi người dùng hỏi về một việc, ví dụ "tôi muốn sửa địa chỉ" hay "quên mật khẩu", Gemini chọn trang liên quan trong một danh sách cố định (`GUIDE_TARGETS` ở máy chủ, `PLACES` ở trình duyệt). Trang web tự mở trang đó, làm sáng nút hoặc form cần dùng (ví dụ nút gửi yêu cầu, form đổi mật khẩu), hiện "📍 Đã đưa bạn tới …" rồi đọc hướng dẫn. Trên điện thoại khung trợ lý tự thu lại để người dùng thấy trang. Công dân chỉ được đưa tới các trang hồ sơ của mình, thành viên chỉ tới các trang quản lý; khóa lạ hoặc sai vai trò bị bỏ qua ở cả máy chủ và trình duyệt. Nếu AI lỗi hoặc chưa deploy, trang vẫn đoán chỗ cần mở theo từ khóa trong câu hỏi và đọc hướng dẫn có sẵn của trang đó.
- **Giọng nữ tự nhiên, chỉ tạo khi bấm**: lượt tạo giọng nói miễn phí của Gemini mỗi ngày rất ít, nên câu trả lời của trợ lý hiện chữ trước và **không** tự tạo giọng AI. Người dùng bấm "🔊 Nghe câu trả lời" thì trang gọi thao tác `speak` (cần đăng nhập, tính vào hạn mức 5 lần/phút, 40 lần/ngày) để tạo giọng nữ cho đúng câu đó; giọng được giữ trong tab nên nghe lại không tốn thêm lượt. Ở chế độ trò chuyện liên tục, nghe xong câu trả lời mới nhất thì trợ lý nghe tiếp. Khi hết lượt (Gemini báo 429) hoặc trình duyệt chặn phát, khung trợ lý báo rõ và tạm đọc bằng giọng của máy. Nếu chọn giọng của máy thì câu trả lời vẫn tự đọc như trước. Giọng có thể đổi bằng secret `GEMINI_TTS_MODEL` (mặc định `gemini-2.5-flash-preview-tts`) và `GEMINI_TTS_VOICE` (mặc định `Leda`). Nút "Nghe hướng dẫn" (kể cả cho khách chưa đăng nhập) dùng bản ghi giọng nữ lưu sẵn của các đoạn hướng dẫn cố định (`GUIDE_CLIPS`) trong bucket công khai `assistant-voice`; nếu chưa có bản ghi cho giọng đã chọn và không tạo được, máy chủ trả bản ghi bằng một giọng nữ khác. Riêng thông báo lỗi đang hiện trên trang vẫn đọc bằng giọng của máy. Máy Windows chỉ có giọng tiếng Việt "Microsoft An" (giọng nam).
- **Cài đặt giọng nói** (trong khung trợ lý): bật hoặc tắt đọc to, bật hoặc tắt trò chuyện liên tục, chọn tốc độ (chậm, vừa, nhanh) và chọn giọng đọc. Ô "Giọng đọc" cho chọn 4 giọng nữ AI (`Leda` trẻ trung, rõ — mặc định; `Aoede` nhẹ nhàng; `Sulafat` ấm áp; `Kore` trầm; máy chủ chỉ nhận các giọng trong `TTS_VOICES`, mỗi giọng có bản ghi hướng dẫn riêng); các giọng có sẵn trong máy được ghi rõ "Giọng của máy: … (nam/nữ)". Nút "Nghe thử" phát đúng giọng đang chọn (giọng AI lấy từ đoạn hướng dẫn đã lưu sẵn, không tốn hạn mức). Lựa chọn được lưu trên thiết bị. Cuối phần cài đặt có dòng "Phiên bản trợ lý" (kèm "· Brave" nếu nhận ra Brave) để biết máy đang chạy bản nào.
- **Brave**: Brave có API nhận giọng nói nhưng chặn dịch vụ phía sau, nên trang coi như không hỗ trợ: ẩn nút micro, đổi nút thành "💬 Hỏi trợ lý" và nhắc gõ câu hỏi hoặc dùng Chrome/Edge để nói. Giọng đọc AI vẫn chạy bình thường trên Brave.

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
