# Dữ liệu công dân · phiên bản 1

Website giữ nguyên GitHub Pages; dữ liệu, phân quyền và lịch sử đặt trên Supabase. Ba tài khoản dự án hiện tại được ánh xạ từ chủ sở hữu của `phan1`, `phan2`, `phan3`; không thay đổi mật khẩu hoặc cấp thêm quyền dự án cho tài khoản công dân.

## Chức năng

- Thành viên: thêm/sửa hồ sơ, cấp mật khẩu riêng, khóa/mở khóa tài khoản, lập hộ và xử lý yêu cầu công dân.
- Công dân: CCCD + mật khẩu → OTP theo kênh tài khoản (mô phỏng hoặc Telegram) → chỉ xem hồ sơ và yêu cầu của mình. Không kết nối VNeID hoặc dữ liệu quốc gia.
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

CCCD cần đủ 12 chữ số, không giới hạn tiền tố. Số liên hệ nhận 10 chữ số hoặc dạng quốc tế có dấu + và mã nước. Dữ liệu cũ bắt đầu bằng 000 vẫn giữ nguyên và sử dụng được. Email liên hệ có thể để trống hoặc dùng địa chỉ hợp lệ (Gmail, Outlook, email cơ quan…), tối đa 100 ký tự. Email chỉ được lưu để liên hệ, không thay đổi tài khoản đăng nhập và chưa được xác minh hộp thư; OTP vẫn qua Telegram theo cấu hình tài khoản. Địa chỉ @example.invalid cũ vẫn dùng được.

## Kiểm tra

`npm ci` rồi `npm test`. Database dùng PostgreSQL trong bộ nhớ (PGlite), Auth/Edge có fixture tách biệt. UI được kiểm tra bằng jsdom, bộ đọc/ghi Excel được kiểm tra vòng xuất/nhập. Các bài thử không kết nối hoặc đổi tài khoản sản xuất.

Muốn rebuild thư viện Excel: `npm run build:excel`. Giữ `PORTAL-EXCEL-LICENSES.txt` đi kèm bundle.

Máy chủ QA tùy chọn: `node tests/portal-integration-server.mjs` (dữ liệu chỉ tồn tại trong RAM); mở URL được in ra và dùng trang đăng nhập QA. Không dùng trang này làm hệ thống xác thực sản xuất.

## Giới hạn có chủ đích

Đây là bộ chức năng phục vụ demo môn học: chưa gửi OTP thật, chưa mở nhập CCCD thật hoặc thay thế nghiệp vụ dịch vụ công. 22 bảng nghiệp vụ đã có nền cấu trúc; giao diện v1 tập trung hồ sơ, cư trú/hộ, căn cước, tài khoản và yêu cầu. Các danh mục được kiểm soát, không cho trình duyệt tự tạo bảng SQL.

Nếu mất kết nối, web báo lỗi và giữ bản kéo/bản nháp phù hợp; không âm thầm chuyển hồ sơ sang kho cục bộ. Thành viên bấm **Tải mới** để lấy thay đổi đã lưu từ thiết bị khác. Không có đồng bộ realtime mỗi ký tự.

## Chủ hộ và tỉnh/thành cư trú (bản dữ liệu v2)

Chủ hộ được chọn từ công dân đã lưu, liên kết bằng ID/CCCD, không tạo bằng tên tự do. Muốn một người mới làm chủ hộ, lưu hồ sơ của họ trước rồi mở lại để chọn. Người đang ở hộ khác phải hoàn tất chuyển hộ trước; thay đổi chủ hộ giữ lịch sử các vai trò cũ.

Cư trú sử dụng danh mục 63 tỉnh/thành theo mốc 31/12/2024; dữ liệu tham chiếu ở provinces-vn-2024.json. Mã trong tệp là định danh nội bộ, không phải mã hành chính nhà nước. Có danh sách chọn riêng cho thường trú, tạm trú và nơi ở hiện tại. Mỗi địa chỉ có nội dung thì bắt buộc chọn tỉnh/thành tương ứng, kiểm tra cả ở máy chủ. Hồ sơ cũ không bị gán tỉnh tự động; cần chọn đúng khi cập nhật.

Chạy thêm migration supabase/20261101_07_household_provinces.sql trước khi cập nhật giao diện. Công cụ tái tạo: node scripts/build-residence-migration.mjs. Nhập file chỉ thêm thành viên vào hộ đã có chủ hộ; lập hộ/đổi chủ hộ trên giao diện quản lý trước để tránh tự tạo quan hệ từ những người chưa tồn tại.

Nguồn đối chiếu danh mục cũ: https://danhmuchanhchinh.nso.gov.vn/Tinh_tk_new.aspx và danh sách tỉnh/thành trước sắp xếp tại https://sonoivu.hatinh.gov.vn/snv/plugin_upload/preview/documents/507/2969/tvVanBanGoc_08_VBHN_BNV.pdf .

## Nghiệp vụ phiên bản 3 (02/11/2026)

Chạy migration 08 (nghiệp vụ) và 09 (Storage) sau 01–07. Migration 09 tạo bucket riêng tư cd-documents, PDF/PNG/JPEG/WebP tối đa 2 MB, 5 tệp mỗi giấy tờ. Không có bucket công khai hay quyền xóa tệp cho trình duyệt. Upload hai bước: cấp đường dẫn qua RPC, upload bằng phiên thành viên, xác nhận kích thước/MIME từ Storage. Công dân sau OTP chỉ được tải tệp giấy tờ của chính mình.

Menu thành viên có Hộ gia đình, Cư trú và biến động, Giấy tờ hành chính, Thống kê dân cư. Lập hộ yêu cầu công dân đã tồn tại; chuyển hộ và đổi chủ hộ kiểm tra phiên bản, không bỏ lại hộ còn người mà không có chủ hộ. Tách thành viên cuối đánh dấu hộ đã kết thúc, không xóa lịch sử hoặc tái sử dụng mã hộ. Chuyển hộ không tự thay đổi địa chỉ thường trú. Hiệu lực thao tác hộ là ngày hiện tại.

Cư trú cho nhập ngày hiệu lực đến hiện tại, không trước lần đăng ký đang có; tạm trú bắt buộc có hạn. Gia hạn ghi lần mới, kết thúc lần cũ. Hạn đăng ký khác ngày kết thúc lịch sử. Tình trạng hết hạn được tính theo ngày Việt Nam, không cần cron. Dữ liệu tạm trú cũ thiếu hạn giữ nguyên để thành viên bổ sung. Form hồ sơ và nhập/xuất Excel/CSV có thêm ngày bắt đầu/hết hạn tạm trú.

Công dân có mục Giấy tờ của tôi và lịch sử cư trú/hộ của chính mình. Thành viên nhập/sửa/thu hồi giấy tờ có lý do và kiểm tra phiên bản. Số liệu thống kê tính mỗi người một lần theo tỉnh thường trú; hộ dùng mã duy nhất trong mỗi tỉnh, tạm trú báo riêng theo địa bàn tạm trú. CSV thống kê không chứa định danh/mật khẩu; đây là báo cáo dân cư, khác tệp báo cáo đề tài PDF/Word.

Không có tích hợp với dữ liệu hành chính quốc gia hay VNeID. Các thay đổi tiếp theo xem phiên bản 4 dưới đây.

## Nghiệp vụ phiên bản 4 (03/11/2026)

Áp dụng `supabase/migrations/20261102164415_portal_completion.sql` sau 01–09, rồi deploy lại Edge Function citizen-portal. Đây là migration được tạo bằng Supabase CLI. Công cụ tái tạo phần định nghĩa kế thừa: `node scripts/build-completion-migration.mjs`.

- Phân quyền nghiệp vụ lưu ở business_role, tách khỏi vai trò học tập/quyền biên soạn báo cáo. Bốn vai trò: admin, intake, processor, approver. Các tài khoản hiện tại giữ quyền đang có qua giá trị admin mặc định; người quản trị phân công tại **Phân quyền và bảo mật**. Mọi thao tác ghi đều kiểm tra capability tại RPC, bao gồm bước cấp tài khoản trên Edge; không chỉ ẩn nút. Không tự nâng quyền từ user_metadata. Chặn sửa phiên bản cũ và hạ quyền quản trị cuối cùng.
- Tiếp nhận, xử lý và phê duyệt yêu cầu có quyền riêng. Người phê duyệt có thể áp dụng thay đổi từ yêu cầu đã kiểm tra dù không có quyền sửa hồ sơ trực tiếp. Giao diện ẩn thao tác theo quyền, cả khi bảng hoặc bảng chi tiết được dựng lại sau tải bất đồng bộ.
- Công dân sau OTP có mục **Bảo mật tài khoản**: nhập mật khẩu hiện tại, mật khẩu mới và xác nhận. Máy chủ kiểm tra mật khẩu cũ, bảo vệ ba tài khoản dự án, thu hồi phiên xác thực cũ trước khi gọi Auth để tránh khoảng trống khi timeout; sau thay đổi phải đăng nhập/OTP lại. Quên mật khẩu được hướng dẫn liên hệ người phụ trách, không có mật khẩu dùng chung.
- OTP theo từng tài khoản: mặc định demo, tùy chọn Telegram sau khi thành viên lưu số quốc tế riêng. Telegram số thật chỉ dùng cho nhận mã; các trường CCCD/điện thoại liên hệ trong hồ sơ vẫn giữ dữ liệu minh họa. Token chỉ đặt trong TELEGRAM_GATEWAY_TOKEN ở Supabase Secrets. Mặc định giới hạn 20 lần gửi mỗi 24 giờ trên toàn dự án, điều chỉnh bằng TELEGRAM_DAILY_LIMIT (1–100). Không gọi checkSendAbility trước để tránh một lần tính phí dư. Không trả OTP thật về trình duyệt, không ghi log, không tự đổi sang demo khi gửi thất bại. OTP 2 phút, gửi lại sau 30 giây, tối đa 5 lần sai. Cấu hình số nhận sẽ thu hồi phiên/challenge cũ. Xem TELEGRAM-OTP.md.
- Thống kê có bộ lọc tỉnh thường trú, giới tính, nhóm tuổi; có biểu đồ, CSV tổng hợp và xem bản in/lưu PDF trong cùng tab. Tuổi được tính theo ngày sinh tại ngày thống kê; ngày chưa rõ được thống kê riêng. Không xuất tên/CCCD trong báo cáo thống kê. Đây là số liệu hiện tại, chưa có báo cáo hồi cứu theo mốc quá khứ.
- Tra cứu hành chính gọi RPC dùng danh mục 63 tỉnh/thành tại mốc 31/12/2024, luôn trả simulation=true và ghi rõ nguồn nội bộ. Không gọi hoặc giả nhận kết nối dữ liệu quốc gia.
- Quản trị viên xem danh mục bảng/tệp cần sao lưu, chỉ gồm số dòng/fingerprint/đường dẫn, không đọc nội dung hồ sơ qua danh mục này. Công cụ sao lưu PostgreSQL + Storage và thử phục hồi chỉ vào Supabase localhost dùng một lần nằm ở scripts/backup-portal.mjs; hướng dẫn ở BACKUP-RESTORE.md. Chưa có thông tin kết nối riêng hoặc môi trường khôi phục thì không tuyên bố đã tạo/thử một backup sản xuất.

Kiểm thử bổ sung: các vai trò không được vượt quyền; chặn mất quản trị cuối; OTP Telegram với nhà cung cấp giả lập; thu hồi phiên sau đổi mật khẩu; lỗi gửi không lộ mã; lọc/thống kê/CSV/bản in; cấu hình số OTP qua UI; checksum, gói chưa hoàn chỉnh và chặn khôi phục vào production. Các bài thử không gửi tin Telegram thật và không thay đổi tài khoản sản xuất.

## Chỉnh sửa nhập số Telegram (03/11/2026)

Sau migration phiên bản 4, chạy thêm supabase/migrations/20261102174930_normalize_telegram_phone.sql. Giao diện và RPC cùng chuẩn hóa số Việt Nam dạng 09…, +849… và +8409… có thừa số 0; bỏ khoảng trắng/dấu định dạng, không tự điền chữ số bị thiếu. Không đổi các số đã lưu trong migration. Phân biệt thiếu token, token bị nhà cung cấp từ chối và số nhận không hợp lệ; có nút kiểm tra lại cấu hình ngay trong form, giữ nội dung đang nhập khi lỗi. Token không xuất hiện trong trạng thái trả về. Nhóm đã xác nhận nhận OTP Telegram thật; các bài thử tự động vẫn dùng nhà cung cấp giả lập.

## Định dạng căn cước và số liên hệ (03/11/2026)

Chạy supabase/migrations/20261102190014_flexible_citizen_identifiers.sql sau các migration trước, deploy Edge Function rồi cập nhật frontend. Phiên bản schema 5 cho phép CCCD bất kỳ đủ 12 chữ số, kể cả bắt đầu 0 hoặc 1–9; vẫn giữ UNIQUE và kiểm tra phiên bản. Điện thoại liên hệ nhận 10 chữ số với tiền tố bất kỳ, hoặc dạng quốc tế có dấu + và 7–15 chữ số. Số nhận Telegram giữ cơ chế và chuẩn hóa riêng. Migration không đổi dữ liệu hồ sơ, mật khẩu, quyền hoặc số OTP đã lưu.

Đã đồng bộ form thêm/sửa, đăng nhập, cấp tài khoản, gửi lại mã, nhập tệp và kho cục bộ cũ. CSV xuất số quốc tế có dấu nháy bảo vệ công thức; khi nhập lại chỉ bỏ dấu nháy ở cột định danh/điện thoại nếu phần còn lại khớp đúng định dạng, không bỏ bảo vệ ở dữ liệu tùy ý. Ô định danh trong Excel vẫn cần kiểu Text để giữ chính xác chữ số đầu.
