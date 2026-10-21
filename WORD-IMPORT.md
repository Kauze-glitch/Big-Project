# Nhập tài liệu Word

Trong trang biên soạn thuộc quyền của bạn, bấm **Nhập Word**, chọn `.docx` (tối đa 15 MB), xem trước và chọn thêm vào cuối hoặc thay thế nội dung hiện tại. Tiêu đề trang giữ nguyên. Nội dung vào bản nháp trước; bấm **Lưu và hiển thị** để công khai.

**Hoàn tác nhập Word** khôi phục nội dung ngay trước lần nhập vừa rồi. Nút chỉ tồn tại đến lần chỉnh sửa tiếp theo hoặc khi chuyển phần/tải lại. Bản nháp sau nhập vẫn tự lưu trên thiết bị.

Hỗ trợ tiêu đề, văn bản tiếng Việt, đậm/nghiêng/gạch chân, danh sách, bảng (kể cả ô gộp) và ảnh PNG/JPEG/WebP/GIF. Ảnh được tối ưu và chuyển thành khối ảnh/sơ đồ có thể chỉnh vị trí ngay sau đoạn/bảng chứa ảnh. GIF thành ảnh tĩnh. Không tái tạo chính xác bố cục trang, phông/cỡ/màu chữ, SmartArt, biểu đồ hoặc ảnh nổi; đối tượng không hỗ trợ được thông báo ở bản xem trước. `.doc` cũ cần lưu lại thành `.docx`.

## Triển khai

Website tĩnh, không cần SQL hay dịch vụ xử lý tài liệu. Upload các file của nhánh như bình thường. Bộ đọc Mammoth 1.13.0 được đóng gói tại `mammoth.browser.min.js` từ npm (BSD-2-Clause; xem `MAMMOTH-LICENSE.txt`); tài liệu được đọc tại trình duyệt, không gửi file Word đến dịch vụ chuyển đổi. Nguồn: https://github.com/mwilliamson/mammoth.js

Worker riêng có thời hạn 30 giây và bị dừng khi hủy. Kiểm tra ZIP trước giải nén (40 MB, 2.000 mục), giới hạn ảnh/khối và kích thước nội dung trước khi nhập; không cắt nội dung âm thầm. Không truy cập tài nguyên ngoài file và không dùng style map nhúng. HTML phải qua bộ lọc cho phép định dạng và bảng; URL, script, sự kiện và ảnh HTML trực tiếp đều bị loại. Ảnh hợp lệ được đưa qua bộ tối ưu có sẵn.

## Kiểm tra

Đã kiểm tra trên fixture Supabase riêng ngoài repo: xem trước, thêm vào cuối, hoàn tác, thay thế, bản nháp sau tải lại, lưu và trang đọc có bảng/ảnh. Đã kiểm tra guard cho ZIP lỗi, archive quá lớn, file mã hóa, mục ZIP hỏng, `.doc` và file vượt 15 MB. Không đưa nội dung thử nghiệm lên database thật.
