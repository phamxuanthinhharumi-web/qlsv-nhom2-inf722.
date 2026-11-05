# Bản v3 (05/11/2026)

- Thêm `.gitignore` (bỏ qua `data/`, `node_modules/`, tệp `*.sqlite*`, `.env`) để không đẩy cơ sở dữ liệu lên kho.
- Tách quy tắc tính điểm học phần, điểm chữ, quy đổi thang 4 và điểm trung bình có trọng số tín chỉ từ `public/app.js` ra `public/grade.js` (hàm thuần); thêm `test/grade.unit.test.js` (5 kiểm thử). Tổng 40 kiểm thử, đạt 40/40.
- GitHub Actions kiểm tra cú pháp thêm `public/grade.js`.
- Đưa hai prototype HTML ban đầu vào `prototype/`.
- Mã được chuẩn bị với sự hỗ trợ của Claude; Trưởng nhóm đọc, chạy thử và tự đẩy lên kho.

# Ghi chú thay đổi: bổ sung phân hệ Hồ sơ sinh viên và Điểm rèn luyện

Gửi Hưng (lập trình, CSDL, test, Git). Bản này dựa trên ứng dụng Node.js trong thư mục
`quanlysinhvien-app/qlsv`, thêm hai phân hệ trọng tâm của đề tài. Mã được viết với sự hỗ trợ của Claude;
Hưng cần đọc, chạy và hiểu từng phần trước khi đưa vào kho Git, và nhóm ghi phạm vi dùng AI vào phụ lục báo cáo.

## 1. Chạy thử trong 3 bước

```bash
node -v                      # cần 22.13 trở lên
npm test                     # phải ra: tests 35, pass 35, fail 0
npm start                    # mở http://127.0.0.1:3000, đăng nhập admin bằng mật khẩu tạm in ra màn hình
```

Vào **Dữ liệu & Sao lưu → Nạp dữ liệu mẫu**, rồi tạo thêm một tài khoản giảng viên và một tài khoản sinh viên
(menu **Tài khoản**) để thử đủ 3 vai trò.

## 2. Thay đổi theo tệp

| Tệp | Thay đổi |
|---|---|
| `drl.js` (mới) | Hai khung đánh giá rèn luyện (TT16 và khung của nhóm), hàm `classify`, `finalScore`, `sumItems`, `evalSummary`. Đây là hàm thuần, không đụng CSDL, nên test đơn vị được. |
| `db.js` | Thêm 7 bảng: `student_profiles`, `family_members`, `profile_requests`, `drl_frameworks`, `drl_criteria`, `drl_evaluations`, `drl_scores` (tổng cộng 14 bảng). Thêm hàm đọc/ghi hồ sơ, thân nhân, phiếu ĐRL; sao lưu/khôi phục gồm cả dữ liệu mới; dữ liệu mẫu có hồ sơ, 2 thân nhân mỗi SV, phiếu ĐRL 3 học kỳ. |
| `server.js` | 13 API mới (xem README mục "API bổ sung"), kiểm tra dữ liệu vào (CCCD 12 số, ngày hợp lệ, năm sinh, SĐT), phân quyền theo vai trò và theo chủ sở hữu, chặn sai trạng thái phiếu (trả 409). |
| `public/app.js`, `public/app.css` | 3 màn hình mới: Hồ sơ sinh viên, Điểm rèn luyện, Xét chọn khen thưởng. Bảng sinh viên có cột Trạng thái; bảng điểm có cột Điểm chữ và chi tiết điểm từng môn cho sinh viên. |
| `test/helpers.js` (mới) | Khởi động máy chủ thử với CSDL trong bộ nhớ, máy khách có cookie riêng. |
| `test/drl.unit.test.js` (mới) | 6 test đơn vị: giá trị biên xếp loại của 2 khung, điểm cuối, kiểm tra điểm từng tiêu chí, trạng thái phiếu. |
| `test/hoso-drl.test.js` (mới) | 13 test API: hồ sơ hợp lệ/không hợp lệ, quyền xem, thân nhân, luồng yêu cầu cập nhật, quy trình ĐRL 3 cấp, điểm sai, mở lại phiếu, đổi khung, sao lưu v2, xóa dây chuyền. |
| `.github/workflows/ci.yml` (mới) | GitHub Actions: kiểm tra cú pháp và chạy `npm test` mỗi lần push hoặc mở pull request. |
| `Dockerfile` | Thêm `drl.js` vào lệnh `COPY` (thiếu thì container không chạy). |
| `README.md` | Vai trò, hai phân hệ mới, bảng API, giới hạn, số test. |

`test/api.test.js` (16 test cũ) giữ nguyên và vẫn đạt.

## 3. Gợi ý đưa vào Git

Lịch sử commit phải là lịch sử thật của nhóm. Hưng tự đọc và tự commit; nên chia theo từng phần để dễ trình bày
khi cô hỏi, ví dụ:

1. `feat(drl): khung đánh giá rèn luyện và test đơn vị` gồm `drl.js`, `test/drl.unit.test.js`
2. `feat(db): bảng hồ sơ, thân nhân, yêu cầu cập nhật, phiếu rèn luyện` gồm `db.js`
3. `feat(api): API hồ sơ và rèn luyện kèm test` gồm `server.js`, `test/helpers.js`, `test/hoso-drl.test.js`
4. `feat(ui): màn hình hồ sơ, rèn luyện, xét chọn` gồm `public/`
5. `ci: chạy npm test trên GitHub Actions` gồm `.github/`, `Dockerfile`, `README.md`

Sau khi push, chụp ảnh tab **Actions** có dấu tích xanh làm minh chứng cho mục tự động hóa (Chương 4).

## 4. Điểm cần nhóm chốt (chưa tự quyết)

- **Khung rèn luyện**: mặc định theo Thông tư 16/2015 (20/25/20/25/10, điểm cuối là điểm khoa). Khung "5 tiêu chí × 20"
  trong prompt có sẵn để chuyển. Nếu lấy được phiếu thật của ĐHHP thì sửa `FRAMEWORKS` trong `drl.js`.
- **Công thức điểm tổng kết môn**: ứng dụng dùng 0,4 × quá trình + 0,6 × thi; bản prototype HTML dùng 0,3 / 0,7.
- **Ngưỡng điểm chữ B+**: ứng dụng dùng 8,0; prototype dùng 7,8.
- **Vai trò**: giảng viên đang đánh giá rèn luyện được cho mọi lớp (chưa gán CVHT theo lớp); quản trị đóng vai khoa.

## 5. Ba câu tự kiểm tra cho Hưng

1. *Vì sao mỗi phiếu ĐRL lưu `framework_id`?* Để đổi khung giữa chừng không làm sai điểm của phiếu đã chấm theo khung cũ.
2. *Vì sao sinh viên gửi yêu cầu thay vì tự sửa hồ sơ?* Hồ sơ là dữ liệu chính thức; cán bộ phải xác nhận trước khi ghi,
   và bảng `profile_requests` giữ lại vết ai duyệt, lúc nào.
3. *Nếu cô hỏi "test nào chứng minh sinh viên không xem được phiếu của bạn khác?"*: test "ĐRL: sinh viên chỉ đọc được
   phiếu của mình" và các lệnh gọi trả 403 trong `test/hoso-drl.test.js`.
