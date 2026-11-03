# Giao diện Nhóm 12

Mục tiêu: đọc báo cáo thuận tiện, tìm đúng hồ sơ và thực hiện nghiệp vụ rõ ràng. Người dùng gồm khách xem báo cáo, công dân xem hồ sơ riêng và ba thành viên quản lý. Cổng quản lý ưu tiên dữ liệu và thao tác, trang báo cáo ưu tiên nội dung đề tài và nhóm thực hiện.

## Quyết định thiết kế

- Giữ xanh rêu và nền giấy ấm. Màu nhấn `#315443`, chữ chính `#253b30`, chữ phụ `#53644f`, nền `#f2f4ed`, giấy `#fffefb`.
- Độ tương phản các cặp màu chính đã tính: chữ chính/giấy 11,92:1; chữ phụ/nền 5,73:1; trắng/nút xanh 8,47:1; chữ/mục đang chọn 8,60:1. Đây là kiểm tra token màu, không phải kiểm định mọi phần tử trên trang.
- Dùng phông tiếng Việt đang có. Không thay font nội dung do thành viên biên soạn, không thay hình học sơ đồ hoặc định dạng xuất/in.
- Nhãn và số liệu có thứ bậc rõ; ô nhập trên điện thoại từ 16 px. Tránh đặt quá nhiều thao tác ngang một dòng.
- Hồ sơ giữ Sửa và Cấp/Khóa/Mở khóa ở ngoài; Lịch sử, OTP, mật khẩu và lập yêu cầu trong mục mở rộng có nhãn rõ. Mọi chức năng vẫn chịu kiểm tra quyền cũ.
- Danh mục quản lý thu gọn trên điện thoại, mở bằng nút, đóng bằng Escape hoặc sau chọn mục. Khách và công dân không được thêm danh mục thành viên.
- Khối nhập liệu dùng lỗi cạnh ô. Thông tin trống và số 0 giữ ý nghĩa; số liệu lấy từ dữ liệu hiện tại, không thêm chỉ số minh họa.
- Chuyển trang cổng công dân dùng opacity/translate ngắn 220 ms; tôn trọng giảm chuyển động. Hoa trang trí nhỏ ở góc, không che vùng nội dung.
- Viền hoa được dùng trên cả sáu trang, kể cả cổng công dân, database và trang xuất báo cáo. Trình chiếu có khung riêng bên trong vùng toàn màn hình. Khung là trang trí, không nhận chuột hay focus và không đưa vào bản in.

## Hướng dẫn tham khảo đã áp dụng

- [Taste Skill, hướng dẫn màn hình ứng dụng](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/references/app-screens.md): ưu tiên công việc chính, dữ liệu thật của ứng dụng, bề mặt và bố cục gọn.
- [Emil Kowalski — Design Engineering](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md): phản hồi khi nhấn, thời lượng chuyển động ngắn và giảm chuyển động.
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md): focus, bàn phím, nhãn, độ dài nội dung, kích thước điều khiển trên điện thoại.

Các tài liệu được đọc và chọn nguyên tắc phù hợp với thương hiệu hiện tại; không cài chương trình hoặc chạy script bên ngoài. Đây không phải chứng nhận tuân thủ toàn bộ bộ skill. Quyền điều khiển trình duyệt đang tắt nên chưa thực hiện quy trình chụp/đánh giá bằng trình duyệt của Taste Skill; kiểm tra mã, DOM và hành vi tự động không thay thế kiểm tra hình ảnh ở các kích thước màn hình.
