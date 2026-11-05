# Quản lý sinh viên (có đăng nhập & phân quyền)

Máy chủ Node.js + SQLite, **không cần cài thư viện nào** (`npm install` không cần thiết).
Yêu cầu: **Node.js 22.13 trở lên**.

## Chạy thử

```bash
node --disable-warning=ExperimentalWarning server.js     # hoặc: npm start
```

Lần chạy đầu tiên, máy chủ in ra tài khoản quản trị `admin` cùng **mật khẩu tạm ngẫu nhiên** (chỉ hiện một lần).
Mở http://127.0.0.1:3000, đăng nhập, hệ thống sẽ bắt đổi mật khẩu.
Quản trị viên có thể bấm **Dữ liệu & Sao lưu → Nạp dữ liệu mẫu** để dùng thử.

## Vai trò

| Vai trò | Quyền |
|---|---|
| Quản trị (đóng vai khoa / Phòng CTSV) | Toàn quyền dữ liệu học vụ, quản lý tài khoản, sao lưu / khôi phục, nạp / xóa dữ liệu; **khoa duyệt** phiếu rèn luyện, mở lại phiếu đã duyệt, chọn khung đánh giá rèn luyện |
| Giảng viên (đóng vai cố vấn học tập / lớp) | Thêm / sửa / xóa sinh viên, lớp, học kỳ, môn học, nhập điểm, xuất CSV; sửa hồ sơ và thân nhân, duyệt yêu cầu cập nhật hồ sơ; **lớp đánh giá** phiếu rèn luyện; lập danh sách xét chọn |
| Sinh viên | Chỉ xem bảng điểm, hồ sơ, phiếu rèn luyện **của chính mình** (máy chủ chỉ trả dữ liệu của em đó); gửi yêu cầu cập nhật thông tin liên hệ; tự đánh giá rèn luyện |

Tài khoản do quản trị tạo (không có đăng ký tự do). Tài khoản mới và tài khoản vừa được đặt lại mật khẩu
đều phải đổi mật khẩu ở lần đăng nhập kế tiếp. Muốn cấp tài khoản cho sinh viên: vào **Tài khoản → Vai trò: Sinh viên → chọn sinh viên**.

## Hai phân hệ bổ sung

**Hồ sơ sinh viên** (menu *Hồ sơ sinh viên*): lý lịch (ngày sinh, nơi sinh, quê quán, CCCD, dân tộc, tôn giáo, diện chính sách,
ngày nhập học, địa chỉ), trạng thái học tập (Đang học / Bảo lưu / Thôi học / Đã tốt nghiệp), tối đa 10 thân nhân có đánh dấu
liên hệ khẩn cấp. Sinh viên không sửa trực tiếp mà gửi **yêu cầu cập nhật** (email, SĐT, địa chỉ, quê quán, diện chính sách);
cán bộ duyệt thì thông tin mới được ghi, từ chối thì phải ghi lý do. Mỗi sinh viên chỉ có một yêu cầu chờ duyệt tại một thời điểm.

**Điểm rèn luyện** (menu *Điểm rèn luyện*): mỗi sinh viên một phiếu mỗi học kỳ, đi qua 3 cấp

```
Sinh viên tự đánh giá  →  Lớp (giảng viên) đánh giá  →  Khoa (quản trị) duyệt
   "Chờ lớp đánh giá"        "Chờ khoa duyệt"              "Đã duyệt"
```

Khung đánh giá cấu hình được, có sẵn hai khung:

| Khung | Tiêu chí | Điểm cuối | Xếp loại |
|---|---|---|---|
| Thông tư 16/2015/TT-BGDĐT (mặc định) | 5 tiêu chí: 20 / 25 / 20 / 25 / 10 | Điểm khoa duyệt | Xuất sắc ≥ 90, Tốt ≥ 80, Khá ≥ 65, Trung bình ≥ 50, Yếu ≥ 35, Kém dưới 35 |
| Khung đề xuất của nhóm | 5 tiêu chí × 20 | Trung bình điểm lớp và điểm khoa, làm tròn | Xuất sắc ≥ 90, Giỏi ≥ 80, Khá ≥ 65, Trung bình ≥ 50, Yếu dưới 50 |

Quản trị đổi khung trong màn hình *Điểm rèn luyện*; phiếu đã tạo giữ nguyên khung lúc tạo để không làm sai điểm đã chấm.
Định nghĩa khung nằm ở `drl.js` (sửa ở đó nếu trường dùng phiếu khác).

**Xét chọn khen thưởng**: lọc sinh viên theo TB học kỳ (trọng số tín chỉ) và điểm rèn luyện đã được khoa duyệt, ngưỡng do người
dùng nhập, xuất CSV. Ngưỡng mặc định 8,0 và 80 chỉ để minh họa, không phải quy chế học bổng.

### API bổ sung

| Phương thức và đường dẫn | Ai được gọi | Việc |
|---|---|---|
| `GET /api/students/:ma/profile` | Cán bộ; sinh viên chỉ mã của mình | Hồ sơ và thân nhân |
| `PUT /api/students/:ma/profile` | Cán bộ | Lưu hồ sơ |
| `PUT /api/students/:ma/family` | Cán bộ | Thay toàn bộ danh sách thân nhân `{ family: [...] }` |
| `GET /api/profile-requests` | Mọi vai trò (sinh viên chỉ thấy yêu cầu của mình) | Danh sách yêu cầu cập nhật |
| `POST /api/profile-requests` | Sinh viên | Gửi yêu cầu `{ changes, lyDo }` |
| `PUT /api/profile-requests/:id` | Cán bộ | Duyệt / từ chối `{ duyet, phanHoi }` |
| `GET /api/drl/frameworks` | Mọi vai trò | Các khung đánh giá |
| `PUT /api/drl/frameworks/active` | Quản trị | Chọn khung cho phiếu mới `{ id }` |
| `GET /api/drl?termId=` | Mọi vai trò (sinh viên chỉ phiếu của mình) | Phiếu rèn luyện kèm điểm từng tiêu chí |
| `PUT /api/drl/:ma/:term/self` | Sinh viên (chính chủ) | Tự đánh giá `{ items: { TC1: 18, ... } }` |
| `PUT /api/drl/:ma/:term/class` | Cán bộ | Lớp đánh giá `{ items, ghiChu }` |
| `PUT /api/drl/:ma/:term/faculty` | Quản trị | Khoa duyệt `{ items, ghiChu }` |
| `POST /api/drl/:ma/:term/reopen` | Quản trị | Mở lại phiếu đã duyệt |

## Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng |
| `HOST` | `127.0.0.1` | Địa chỉ lắng nghe (đặt `0.0.0.0` nếu chạy trong container) |
| `DATA_DIR` | `./data` | Thư mục chứa file CSDL `qlsv.sqlite` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / ngẫu nhiên | Chỉ dùng ở lần chạy đầu khi CSDL chưa có tài khoản nào |
| `NODE_ENV=production` | | Bật cookie `Secure` và HSTS (cần chạy qua HTTPS) |
| `COOKIE_SECURE` | theo `NODE_ENV` | `1` / `0` để ép bật / tắt cookie `Secure` |
| `TRUST_PROXY=1` | tắt | Bật khi chạy sau reverse proxy (nginx, Caddy, Cloudflare…) để lấy đúng IP khách |

## Đưa lên mạng thật (checklist)

1. **Bắt buộc dùng HTTPS.** Đặt máy chủ sau reverse proxy có chứng chỉ (Caddy là cách đơn giản nhất), rồi chạy với
   `NODE_ENV=production TRUST_PROXY=1 HOST=127.0.0.1`. Nếu không có HTTPS, mật khẩu đi qua mạng dạng chữ rõ.
2. Proxy phải **thêm** địa chỉ khách vào cuối `X-Forwarded-For` (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`).
   Chỉ bật `TRUST_PROXY=1` khi thật sự có proxy phía trước.
3. **Lưu `DATA_DIR` ở ổ đĩa bền vững** và sao lưu định kỳ (sao chép cả 3 file `qlsv.sqlite*`, hoặc dùng
   `sqlite3 qlsv.sqlite ".backup bak.sqlite"`). Ngoài ra quản trị viên có thể tải bản sao lưu JSON trong giao diện
   (bản JSON **không** gồm tài khoản đăng nhập).
4. Chỉ chạy **một bản** máy chủ cho một file CSDL (SQLite). Cần nhiều máy chủ thì phải chuyển sang PostgreSQL / MySQL.

### Docker

```bash
docker build -t qlsv .
docker run -d --name qlsv -p 127.0.0.1:3000:3000 -v qlsv-data:/data -e TRUST_PROXY=1 qlsv
docker logs qlsv        # xem mật khẩu quản trị tạm ở lần chạy đầu
```

## Quên mật khẩu quản trị

```bash
node --disable-warning=ExperimentalWarning reset-password.js admin
# trong Docker: docker exec -it qlsv node --disable-warning=ExperimentalWarning reset-password.js admin
```

## Bảo mật đã có

- Mật khẩu băm bằng scrypt có muối; không lưu mật khẩu gốc. Phiên đăng nhập là mã ngẫu nhiên, trong DB chỉ lưu bản băm.
- Cookie `HttpOnly` + `SameSite=Strict` (+ `Secure` ở production); phiên hết hạn sau 8 giờ.
- Chặn dò mật khẩu: sai 5 lần / 15 phút (theo IP + tên đăng nhập) là bị khóa tạm; có giới hạn theo IP.
- Chống CSRF (header `X-Requested-With` + kiểm tra `Origin`), CSP, `X-Frame-Options`, `nosniff`.
- Phân quyền kiểm tra ở **máy chủ** cho từng API; mọi dữ liệu vào đều được kiểm tra; giao diện escape mọi chuỗi hiển thị.
- Khóa / xóa tài khoản, đổi vai trò, đặt lại mật khẩu đều hủy các phiên đang đăng nhập.

## Giới hạn hiện tại (cần biết)

- Chưa có "quên mật khẩu qua email": quản trị viên đặt lại giúp người dùng.
- Bộ đếm chặn dò mật khẩu nằm trong bộ nhớ, mất khi khởi động lại máy chủ.
- Font, biểu tượng và Chart.js tải từ CDN (jsDelivr / Google Fonts); chưa gắn SRI. Muốn chạy offline hoặc chặt hơn,
  tải các file đó về `public/` rồi sửa đường dẫn trong `public/index.html` và CSP trong `server.js`.
- Không có nhật ký thao tác (audit log) và đăng nhập hai lớp (2FA).
- Cách xếp loại và quy đổi thang 4 theo mức phổ biến; hãy đối chiếu với quy chế của trường.
- Giảng viên đánh giá rèn luyện được cho **mọi lớp**; chưa gán cố vấn học tập theo từng lớp.
- Quản trị đóng vai khoa / Phòng CTSV; chưa tách vai trò riêng cho khoa.
- Khung rèn luyện mặc định theo Thông tư 16/2015; chưa đối chiếu được với phiếu đánh giá riêng của trường.

## Kiểm thử

```bash
npm test      # 40 bài kiểm tra: 16 API gốc, 6 đơn vị quy tắc rèn luyện, 5 đơn vị tính điểm học tập, 13 API hồ sơ và rèn luyện
```

## Cấu trúc

```
server.js            máy chủ HTTP, đăng nhập, phân quyền, API
db.js                lược đồ SQLite, đọc / nhập dữ liệu, dữ liệu mẫu
drl.js               khung đánh giá rèn luyện, tính tổng, xếp loại, trạng thái phiếu (hàm thuần)
auth.js              băm và kiểm tra mật khẩu
reset-password.js    đặt lại mật khẩu từ dòng lệnh
public/              giao diện (index.html, app.css, app.js)
test/api.test.js     kiểm thử API gốc
test/drl.unit.test.js    kiểm thử đơn vị quy tắc rèn luyện
test/grade.unit.test.js  kiểm thử đơn vị tính điểm học phần, điểm chữ, GPA (public/grade.js)
test/hoso-drl.test.js    kiểm thử API hồ sơ và rèn luyện
test/helpers.js      khởi động máy chủ thử và máy khách có cookie
.github/workflows/ci.yml chạy npm test trên GitHub Actions mỗi lần push / pull request
```

## Thư mục khác

- `public/grade.js`: quy tắc tính điểm học tập dạng hàm thuần, dùng chung cho giao diện và kiểm thử.
- `prototype/`: hai prototype HTML ban đầu (dữ liệu giữ trong trình duyệt), chỉ để tham khảo lịch sử, không phải sản phẩm chính.

- Thành viên thực hiện: Phạm Xuân Thịnh