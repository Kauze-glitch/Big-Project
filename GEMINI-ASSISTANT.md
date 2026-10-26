# Trợ lý Gemini

Khung chat ở góc phải trên trang tổng quan, trang nội dung và trình biên soạn. Chỉ thành viên có `sections.owner_id` trùng tài khoản đang đăng nhập được sử dụng.

## Triển khai

1. Chạy `supabase/20261023_ai_quota.sql` trong SQL Editor.
2. Trong Edge Functions → Secrets, thêm `GEMINI_API_KEY`. Không lưu key vào mã nguồn, trình duyệt hoặc Git.
3. Deploy `supabase/functions/gemini-assistant/index.ts` với tên `gemini-assistant`.
4. Cấu hình `verify_jwt = false` như `supabase/config.toml`. Bộ kiểm tra legacy JWT của gateway không dùng được với tất cả signing key mới. Function tự xác minh **mọi** bearer token bằng Supabase Auth `/user`, rồi kiểm tra thành viên từ bảng sections. Không được xóa hai kiểm tra này.
5. Mặc định dùng `gemini-3.5-flash-lite`. Có thể đặt secret `GEMINI_MODEL` sang model văn bản mà project Google được phép dùng; không tự thay đổi billing.
6. Đưa `assistant.js`, `assistant.css`, `shared.js` và ba trang HTML lên GitHub Pages.

Backend chỉ dùng secret mặc định Supabase trong môi trường server. Không gửi secret, dữ liệu tài khoản hay `owner_id` cho Google.

## Hành vi và giới hạn của khung chat

- Tham khảo tất cả các phần hoặc một phần được chọn, tải từ Supabase bằng quyền người gọi. Không nhận nội dung tài liệu do client tự gán.
- Chỉ gửi bản đã lưu, chữ trong bảng, chú thích và nhãn/đường nối sơ đồ. Không gửi ảnh/base64, hồ sơ thành viên hoặc bản nháp riêng.
- Câu hỏi tối đa 2.000 ký tự; lịch sử tối đa 3 cặp hỏi–đáp chỉ giữ trong bộ nhớ tab. Đổi phạm vi, cuộc trò chuyện mới hoặc đăng xuất sẽ xóa lịch sử.
- Tài liệu giới hạn 42.000 ký tự, chia đều cho các phần. Khi rút gọn, UI báo rõ. Câu trả lời có liên kết tới các phần đã gửi làm nguồn; đây không phải xác nhận tự động rằng mọi nhận định của AI đều đúng.
- Trong khung chat, AI chỉ trả lời, không tự chỉnh sửa bài, không truy cập công cụ hay chạy SQL. Kết quả được hiển thị bằng `textContent`, không render HTML do AI tạo.
- Quota máy chủ: 6 lượt/phút, 100 lượt/ngày theo giờ Việt Nam cho mỗi thành viên. Lượt đã gửi kể cả lỗi Gemini hoặc người dùng dừng chờ vẫn tính; không tự thử lại gây thêm chi phí.
- Chỉ hàm backend có quyền gọi RPC quota. Thao tác đếm có khóa hàng để tránh nhiều yêu cầu đồng thời vượt giới hạn. Không lưu nội dung hội thoại vào DB.
- Nút Dừng hủy chờ ở trình duyệt; yêu cầu đã đến Gemini có thể vẫn tiếp tục. Đăng xuất ngăn phản hồi cũ xuất hiện.
- CORS cho origin GitHub Pages của repo; thử UI local dùng fixture ngoài repo.

## Kiểm tra

Kiểm thử handler bằng Node với Auth/DB/Gemini giả lập: guest, token hỏng, người ngoài nhóm, quota, lỗi cấu hình/model, body/history quá dài, lọc ảnh/hồ sơ, nhãn sơ đồ, tài liệu dài, không lộ lỗi chứa secret.

Kiểm thử trình duyệt: mở/đóng, gửi câu hỏi, nguồn tham khảo, HTML độc hại hiển thị như chữ, giữ câu hỏi khi lỗi, xóa hội thoại, đăng xuất khi đang chờ. Cần thêm một lượt hỏi thật trên tài khoản thành viên để xác nhận key/model/quota Google.

Tài liệu API: https://ai.google.dev/api/generate-content và https://supabase.com/docs/guides/functions/secrets.

## Chỉnh đoạn văn trong trình biên soạn

Chế độ riêng `operation: rewrite` nhận đoạn bản nháp do thành viên chủ phần chọn (tối đa 6.000 ký tự). Chỉ đoạn này được gửi tới Gemini sau khi người dùng bấm Tạo đề xuất; không gửi các phần khác hay lịch sử chat. Kiểm tra owner ở máy chủ. Xem `EDITOR-WORKFLOW.md` để triển khai và sử dụng xem trước, áp dụng vào bản nháp, hoàn tác và tiến độ.
