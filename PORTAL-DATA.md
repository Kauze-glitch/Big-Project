# Dữ liệu công dân · phiên bản 1

Website giữ nguyên GitHub Pages; dữ liệu, phân quyền và lịch sử đặt trên Supabase. Ba tài khoản dự án hiện tại được ánh xạ từ chủ sở hữu của `phan1`, `phan2`, `phan3`; không thay đổi mật khẩu hoặc cấp thêm quyền dự án cho tài khoản công dân.

## Chức năng

- Thành viên: thêm/sửa hồ sơ, cấp mật khẩu riêng, khóa/mở khóa tài khoản, lập hộ và xử lý yêu cầu công dân.
- Công dân: CCCD + mật khẩu → mã OTP mô phỏng ngẫu nhiên → chỉ xem hồ sơ và yêu cầu của mình. Chưa có gửi SMS/Telegram; không kết nối VNeID hoặc dữ liệu quốc gia.
- Yêu cầu: Nháp → Đã gửi → Đã tiếp nhận → Đang xử lý → Hoàn thành/Từ chối; có nhánh Cần bổ sung và hủy có lý do. Áp dụng thay đổi vào hồ sơ là lựa chọn duyệt riêng, có kiểm tra phiên bản.
- Nhập `.xlsx` / CSV: sheet đầu tiên, tối đa 500 dòng/10 MB; xem trước, kiểm tra trùng, lỗi từng dòng, chế độ thêm hoặc thêm/cập nhật. Mặc định giao dịch nguyên khối; nhập một phần phải chọn rõ. Mã đợt bảo vệ thao tác thử lại khỏi tạo trùng.
- Xuất Excel/CSV theo bộ lọc hoặc toàn bộ. CCCD và điện thoại là chuỗi để giữ số 0 đầu; không xuất mật khẩu, OTP hoặc quyền.
- Lịch sử: hồ sơ và nội dung báo cáo có phiên bản; khôi phục tạo mốc mới. Chỉ chủ phần báo cáo được khôi phục; trình biên soạn phải lưu/bỏ bản nháp trước.
- Sơ đồ: riêng từng tài khoản tự đồng bộ sau khi kéo, bố cục chung chỉ lưu khi bấm nút; có kiểm tra xung đột và giữ bản kéo chưa đồng bộ trên thiết bị theo tài khoản.

## Triển khai

1. Chạy tuần tự sáu migration `supabase/20261101_01_...sql` đến `20261101_06_...sql` trong đúng Supabase của dự án. Migration có thể chạy lại và không xóa dữ liệu cũ. Tất cả bảng mới dùng tiền tố `cd_`, bật RLS; ghi dữ liệu qua RPC kiểm tra quyền ở máy chủ.
2. Deploy Edge Function `citizen-portal` từ `supabase/functions/citizen-portal/index.ts`. Cấu hình `verify_jwt=false` để bước mật khẩu công khai đi vào hàm; hàm tự kiểm tra JWT với Auth cho mọi thao tác còn lại. Không bật xác thực JWT kiểu legacy trên gateway cho hàm này vì frontend dùng publishable key.
3. Hàm sử dụng biến Supabase tích hợp (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEYS` / `SUPABASE_SERVICE_ROLE_KEY`). Không đưa secret vào JavaScript của website, repo, nội dung báo cáo hoặc log.
4. Đưa các tệp frontend lên GitHub Pages sau khi backend đã sẵn sàng. Không tự tải dữ liệu cũ từ localStorage. Thành viên chọn **Nhập / xuất dữ liệu → Chuyển hồ sơ cũ từ trình duyệt**, xem trước rồi xác nhận. Mật khẩu dùng chung và trạng thái tài khoản cũ không được chuyển; cấp riêng từng tài khoản sau nhập.

Chỉ dùng CCCD giả lập 12 số bắt đầu `000`, điện thoại 10 số bắt đầu `000`, email `@example.invalid`. Không nhập dữ liệu cư dân thật vào bản đồ án.

## Kiểm tra

`npm ci` rồi `npm test`. Database dùng PostgreSQL trong bộ nhớ (PGlite), Auth/Edge có fixture tách biệt. UI được kiểm tra bằng jsdom, bộ đọc/ghi Excel được kiểm tra vòng xuất/nhập. Các bài thử không kết nối hoặc đổi tài khoản sản xuất.

Muốn rebuild thư viện Excel: `npm run build:excel`. Giữ `PORTAL-EXCEL-LICENSES.txt` đi kèm bundle.

Máy chủ QA tùy chọn: `node tests/portal-integration-server.mjs` (dữ liệu chỉ tồn tại trong RAM); mở URL được in ra và dùng trang đăng nhập QA. Không dùng trang này làm hệ thống xác thực sản xuất.

## Giới hạn có chủ đích

Đây là bộ chức năng phục vụ demo môn học: chưa gửi OTP thật, chưa tải tệp đính kèm công dân, chưa mở nhập CCCD thật hoặc thay thế nghiệp vụ dịch vụ công. 22 bảng nghiệp vụ đã có nền cấu trúc; giao diện v1 tập trung hồ sơ, cư trú/hộ, căn cước, tài khoản và yêu cầu. Các danh mục được kiểm soát, không cho trình duyệt tự tạo bảng SQL.

Nếu mất kết nối, web báo lỗi và giữ bản kéo/bản nháp phù hợp; không âm thầm chuyển hồ sơ sang kho cục bộ. Thành viên bấm **Tải mới** để lấy thay đổi đã lưu từ thiết bị khác. Không có đồng bộ realtime mỗi ký tự.
