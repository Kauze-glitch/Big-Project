# Sắp xếp các phần

## Kích hoạt

1. Trong Supabase của website, mở SQL Editor.
2. Chạy toàn bộ `supabase/20261021_section_order.sql` bằng tài khoản quản trị.
3. Triển khai các file HTML/JS/CSS của nhánh này rồi tải lại website.

Bản cập nhật chỉ tạo cấu hình thứ tự và hàm lưu thứ tự. Không sửa nội dung, tên, slug hoặc người phụ trách trong `sections`. Có thể chạy lại migration mà không đặt lại thứ tự đã lưu.

## Sử dụng

Đăng nhập tài khoản được giao ít nhất một phần. Bấm **Sắp xếp các phần** bên dưới mục lục, dùng **↑ / ↓**, rồi **Lưu thứ tự**. **Hủy** bỏ thay đổi chưa lưu.

Thứ tự dùng chung cho menu, số thứ tự, liên kết phần trước/tiếp và trình chiếu. Trang biên soạn giữ nguyên bản nháp khi đổi thứ tự. Các tab cùng trình duyệt nhận thông báo; thiết bị khác lấy thứ tự khi tải lại, quay lại cửa sổ hoặc bắt đầu trình chiếu.

Khách chỉ xem. Hàm Supabase kiểm tra người gọi có `owner_id` trong `sections`, danh sách đủ và không trùng, đồng thời kiểm tra phiên bản để ngăn ghi đè thay đổi của thành viên khác. Không cấp quyền cập nhật trực tiếp bảng cấu hình cho trình duyệt.

Nếu migration chưa chạy hoặc kết nối lỗi, website vẫn đọc nội dung; bảng sắp xếp thông báo lỗi và không cho lưu.

## Kiểm tra

Đã kiểm tra cú pháp JavaScript và luồng trình duyệt bằng Supabase giả lập: đổi thứ tự, lưu/tải lại, thứ tự trình chiếu, và giữ nguyên văn bản đang soạn. Fixture nằm ngoài repository và không được triển khai. Cần chạy migration và kiểm tra quyền trên Supabase thật trước khi sử dụng chính thức.
