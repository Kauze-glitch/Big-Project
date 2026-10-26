# AI biên soạn và tiến độ các phần

## Sử dụng

- Trong trang mình phụ trách, bôi đen tối đa 6.000 ký tự trong một khối văn bản, chọn **Sửa đoạn với AI**. Chọn Viết rõ hơn, Rút gọn hoặc Sửa chính tả/ngữ pháp, rồi bấm **Tạo đề xuất**.
- So sánh bản gốc và đề xuất, có thể sửa tiếp đề xuất. **Thay vào bản nháp** chỉ thay đoạn đã chọn; không tự đăng. Văn bản mới không giữ toàn bộ định dạng riêng trong vùng được thay.
- **Hoàn tác AI** khôi phục nội dung trước lần áp dụng gần nhất, trước thao tác sửa tiếp theo hoặc khi rời trang.
- Tiến độ gồm Đang viết, Chờ góp ý, Hoàn thành. Chọn dưới tiêu đề rồi **Lưu và hiển thị** để đăng cùng nội dung. Trạng thái chưa đăng được giữ trong bản nháp trên thiết bị.
- Mọi người nhìn thấy trạng thái đã đăng ở mục lục và trang đọc; chỉ người phụ trách sửa được. Hoàn thành là nhãn tiến độ do thành viên tự đánh dấu, không phải kiểm duyệt tự động.

## Triển khai

1. Chạy `supabase/20261026_section_progress.sql` (idempotent, không thay đổi chính sách RLS hoặc cấp thêm quyền).
2. Cập nhật Edge Function `gemini-assistant` bằng `supabase/functions/gemini-assistant/index.ts`. Giữ cấu hình xác thực và secrets hiện tại.
3. Triển khai các tệp giao diện. `ai-editor.js` phải đứng trước `editor.js`; `workflow.css` được tải ở cả ba trang.

## Giới hạn và kiểm tra

- Chức năng sửa đoạn chỉ gửi đoạn người dùng chọn, không gửi toàn bộ bản nháp, ảnh hay các phần đã lưu. Kiểm tra owner ở máy chủ trước khi tính quota. Dùng chung quota với chat.
- Nội dung lựa chọn là dữ liệu không tin cậy. Chỉ thêm kết quả bằng text nodes, không chạy HTML từ AI. Yêu cầu trả lời bị cắt không được áp dụng.
- Kiểm tra epoch, revision, tài khoản, quyền, DOM và nội dung vùng chọn trước khi áp dụng; hủy khi đổi tài khoản/trang. Không tự ghi đè nội dung đã thay đổi. Hủy cửa sổ chỉ dừng chờ; yêu cầu gửi rồi có thể vẫn tính quota.
- Kiểm thử handler: 3 kiểu sửa, owner khác, đoạn quá dài/trống, thao tác sai, không gửi ngữ cảnh ngoài đoạn chọn, các lỗi Auth/quota cũ.
- Kiểm thử UI với fixture: so sánh trước/sau, sửa đề xuất, thay đúng vùng chọn, HTML chỉ là chữ, hoàn tác, lỗi quota giữ bản gốc, lưu tiến độ, tải lại, chuyển phần giữ bản nháp và chặn trang người khác.
- Kiểm thử SQL trong transaction rollback: owner cập nhật được, non-owner không cập nhật được, constraint từ chối trạng thái không hợp lệ.
