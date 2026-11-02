# Sao lưu và thử phục hồi đồ án

Xuất Excel/CSV không thay thế sao lưu: tệp đó không chứa đầy đủ quan hệ, lịch sử, nội dung báo cáo, tài khoản và giấy tờ đính kèm.

## Phạm vi công cụ

`scripts/backup-portal.mjs` tạo bản dump PostgreSQL của ba schema `public`, `auth`, `storage`, tải nội dung tệp trong bucket riêng tư `cd-documents`, ghi mã SHA-256 và kiểm tra lại từng tệp. Gói chứa dữ liệu riêng tư, bao gồm dữ liệu Auth; không gửi qua chat, đưa vào GitHub, thư mục công khai hoặc nộp kèm báo cáo. Mã nguồn đã loại trừ thư mục `backups/` khỏi Git, nhưng người vận hành vẫn phải giữ bản sao ở nơi riêng tư và mã hóa nếu sao chép ra ngoài máy.

Gói dump bao gồm cả ba schema nói trên của dự án Supabase, có thể chứa ứng dụng khác dùng chung dự án; chỉ người quản trị dự án được vận hành công cụ này. Danh mục đối chiếu trên web chỉ thống kê bảng thuộc đồ án. Không sao lưu thiết lập dashboard, Edge Function Secrets, cấu hình SMTP, dữ liệu của dịch vụ Telegram hoặc cấu hình hạ tầng. Mã nguồn/migration và phiên bản Edge Function nằm trong Git. Các secret cần được người quản trị nhập lại trực tiếp. Không đưa giá trị secret vào tệp hướng dẫn này.

## Chuẩn bị và tạo bản sao

1. Cài PostgreSQL client có `pg_dump` và `pg_restore`; dùng phiên bản client tương thích với PostgreSQL trên Supabase. Đây là công cụ vận hành riêng, không chạy trong trình duyệt.
2. Hoàn tất migration `supabase/migrations/20261102164415_portal_completion.sql`.
3. Người quản trị lấy connection string trực tiếp ở Supabase Connect, và service key trong dashboard. Nhập riêng hai biến môi trường `PORTAL_DB_URL` và `PORTAL_SERVICE_KEY` trên máy tin cậy; không đặt secret trong lệnh được chia sẻ, repo hoặc chat. Dùng kết nối trực tiếp/session pooler phù hợp, tránh transaction pooler khi dump.
4. Thống nhất một khoảng không chỉnh sửa với cả nhóm; tạm dừng đăng nhập công dân, sửa báo cáo, cấp tài khoản và nhập tệp trong khoảng sao lưu. Công cụ so sánh fingerprint dữ liệu nghiệp vụ trước/sau và từ chối hoàn tất khi thấy thay đổi; đây không phải giao dịch nguyên tử giữa PostgreSQL và Storage. Những bảng phiên, OTP, giới hạn tần suất và hoạt động Auth không nằm trong so sánh ổn định. Không dựa vào kiểm tra này để thay thế khoảng bảo trì.
5. Chạy từ thư mục repo:

```text
node scripts/backup-portal.mjs --out backups/truoc-bao-ve
node scripts/backup-portal.mjs --check backups/truoc-bao-ve
```

Nếu lỗi, thư mục có dấu `.incomplete` được giữ riêng để tránh mất tệp đã tải; công cụ sẽ từ chối phục hồi gói đó. Sau khi sửa nguyên nhân, chọn tên thư mục mới. Chỉ khi kiểm tra đầy đủ từng tệp thành công, dấu `.incomplete` mới được gỡ. Công cụ không in connection string, password, key hoặc nội dung bản dump.

## Thử phục hồi vào Supabase cục bộ dùng một lần

Không thử phục hồi trực tiếp lên web chính. Chức năng phục hồi của công cụ chỉ chấp nhận hostname localhost/127.0.0.1 và yêu cầu hai xác nhận rõ ràng. Nó xóa/thay thế đối tượng trong database thử nghiệm bằng `pg_restore --clean`; không trỏ vào database cá nhân đang dùng.

1. Tạo Supabase local sạch bằng CLI/Docker, đúng phiên bản PostgreSQL tương thích; không mở hệ thống local này ra Internet. Cấu hình service key local riêng. Đây là bản sao có dữ liệu Auth, cần giữ kín.
2. Đặt `PORTAL_RESTORE_DB_URL`, `PORTAL_RESTORE_API_URL`, `PORTAL_RESTORE_SERVICE_KEY` trỏ vào đúng Supabase local dùng một lần, và `PORTAL_RESTORE_DISPOSABLE=YES`.
3. Chạy:

```text
node scripts/backup-portal.mjs --restore backups/truoc-bao-ve --confirm-disposable
```

4. Công cụ kiểm tra checksum trước khi phục hồi, tải lại tệp Storage, so sánh số dòng/fingerprint nghiệp vụ và danh sách tệp. Nếu schema quản lý của Supabase không tương thích hoặc `pg_restore` báo lỗi, dừng tại bản local; không sửa bằng cách đổi đích sang production. Cần rà soát hướng dẫn chính thức để điều chỉnh phiên bản/cách dump.
5. Chạy lại kiểm thử, mở một hồ sơ mẫu, một hộ, lịch sử yêu cầu, giấy tờ và tải một tệp để đối chiếu. Phiên đăng nhập/OTP trong bản dump không được dùng để chứng minh phân quyền; tạo phiên kiểm thử mới. Ghi ngày thử và kết quả vào biên bản bảo vệ.

Không dùng gói chưa thử phục hồi làm bằng chứng đã có khả năng khôi phục. Việc triển khai công cụ chưa có nghĩa đã tạo hoặc thử thành công một backup thực tế: cần các thông tin kết nối riêng và môi trường local nói trên.

Tham khảo: [Database backups](https://supabase.com/docs/guides/platform/backups), [Backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Bản backup database của Supabase không bao gồm nội dung các tệp Storage.
