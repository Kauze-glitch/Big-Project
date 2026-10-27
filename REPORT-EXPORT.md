# Xuất báo cáo Word và PDF

Mở `report.html` từ nút **Xuất báo cáo** ở trang chính, trang đọc hoặc biên soạn.

- Đọc nội dung đã đăng và thứ tự đã lưu; không đọc bản nháp trên thiết bị và không ghi dữ liệu lên Supabase.
- Có thể chọn các phần, đổi tên đề tài/nhóm trên bản xuất, bật/tắt bìa và mục lục. Tên, vai trò, nhiệm vụ lấy từ hồ sơ thành viên giống trang giới thiệu.
- Word là DOCX thực, giữ chữ có thể sửa, định dạng cơ bản, bảng (cả gộp ô), ảnh/sơ đồ và số trang. Mục lục có sẵn liên kết; trong Word, chọn Update Field để bổ sung/cập nhật số trang trong mục lục.
- PDF có phông Roboto hỗ trợ tiếng Việt, mục lục kèm số trang tự tính, số trang cuối trang. Các đoạn ngắn được giữ cùng trang khi vừa kích thước.
- Bảng bố cục tự do xuất thành PNG độ phân giải gấp đôi, giữ vị trí ảnh, hộp và đường nối. Sơ đồ trong file không còn là các hộp có thể kéo riêng.
- Xem trước PDF dùng PDF.js, xem từng trang bằng nút trước/sau, không cần trình đọc PDF tích hợp của trình duyệt.
- Báo lỗi nếu dữ liệu/thứ tự/ảnh/công cụ xuất chưa tải được; không xuất một bản thiếu nội dung âm thầm. Thư viện xuất chỉ tải khi sử dụng.

## Tệp và phụ thuộc

- `report.js`: lựa chọn, dữ liệu đã đăng, xem trước và tải file.
- `report-core.js`: chuyển văn bản/bảng sang cấu trúc dùng chung; vẽ ảnh/sơ đồ; tạo Word/PDF.
- `report.html`, `report.css`: giao diện responsive, giữ tông xanh của website.
- `section-order.js`: thêm cờ trạng thái đọc thứ tự; trang báo cáo chặn xuất khi không xác nhận được thứ tự.
- docx 9.6.1: `docx-report.js`, MIT, `DOCX-LICENSE.txt`, https://docx.js.org/
- pdfmake 0.2.20: `pdfmake-report.min.js`, MIT, `PDFMAKE-LICENSE.txt`, https://pdfmake.github.io/docs/0.1/
- Roboto font bundle: `report-fonts.js`, Apache-2.0, `ROBOTO-LICENSE.txt`.
- PDF.js 5.6.205: `report-pdf.module.js`, `report-pdf.worker.js`, Apache-2.0, `PDFJS-LICENSE.txt`, https://mozilla.github.io/pdf.js/

Thư viện được lưu cùng website, không gửi báo cáo đến dịch vụ chuyển đổi bên ngoài. Không cần migration hoặc secret mới.

## Kiểm tra đã thực hiện

- Xuất Word và PDF từ trình duyệt với 3 phần theo thứ tự tùy chỉnh, hồ sơ thành viên, tiếng Việt, chữ đậm/nghiêng/gạch chân/màu/cỡ, danh sách lồng, bảng có rowspan/colspan, ảnh và sơ đồ.
- Kiểm tra XML trong gói DOCX, mục lục, bookmark, ảnh, bảng gộp ô, trường số trang bằng Python.
- PDF mẫu 7 trang: trích xuất đủ nội dung, số trang và số trang mục lục chính xác; dựng ảnh các trang để kiểm tra bố cục.
- Chỉ chọn một phần và tắt bìa/mục lục: PDF chỉ chứa phần được chọn. Bỏ chọn mọi phần: nút xuất bị vô hiệu hóa.
- Công cụ dựng ảnh DOCX tự động không khả dụng trên máy kiểm thử (thiếu LibreOffice); chưa xác nhận toàn bộ bố cục Word bằng ảnh render. Word có thể phân trang khác PDF tùy phông cài trên máy.
