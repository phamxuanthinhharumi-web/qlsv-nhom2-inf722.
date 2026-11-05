'use strict';
// Kiểm thử API cho hai phân hệ bổ sung: hồ sơ sinh viên và điểm rèn luyện.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

const ADMIN_PW = 'Admin-Pass-123';
let srv, admin, gv, sv2, sv5, T; // T: học kỳ mới tạo, chưa có phiếu ĐRL nào

// Tạo tài khoản, đăng nhập và đổi mật khẩu lần đầu; trả về máy khách đã sẵn sàng.
async function ready(username, fullName, role, maSV) {
  assert.equal((await admin.post('/api/users', { username, fullName, role, password: 'Tam-thoi-1', maSV })).status, 201);
  const { c } = await srv.login(username, 'Tam-thoi-1');
  assert.equal((await c.post('/api/change-password', { current: 'Tam-thoi-1', next: 'Mat-khau-moi-1' })).status, 200);
  return c;
}
const items = (a) => ({ TC1: a[0], TC2: a[1], TC3: a[2], TC4: a[3], TC5: a[4] });

test.before(async () => {
  srv = await startApp(ADMIN_PW);
  admin = (await srv.login('admin', ADMIN_PW)).c;
  assert.equal((await admin.post('/api/admin/demo')).status, 200);
  T = (await admin.post('/api/terms', { ten: 'Học kỳ 2', nam: '2025-2026' })).data.id;
  gv = await ready('gv1', 'Giảng viên 1', 'teacher');
  sv2 = await ready('sv002', 'Trần Thị Bình', 'student', 'SV002');
  sv5 = await ready('sv005', 'Hoàng Văn Em', 'student', 'SV005');
});
test.after(() => srv.close());

test('khung ĐRL: có 2 khung, mặc định dùng khung TT16', async () => {
  const r = await sv2.get('/api/drl/frameworks');
  assert.equal(r.status, 200);
  assert.equal(r.data.frameworks.length, 2);
  const active = r.data.frameworks.filter((f) => f.dangDung);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'tt16');
  assert.deepEqual(active[0].criteria.map((c) => c.max), [20, 25, 20, 25, 10]);
});

test('hồ sơ: cán bộ cập nhật được, dữ liệu sai bị từ chối', async () => {
  const p = { ngaySinh: '2005-03-21', noiSinh: 'Hải Phòng', queQuan: 'Hải Phòng', diaChi: 'Số 5 phố Mẫu', cccd: '000000000099', danToc: 'Kinh', tonGiao: 'Không', dienChinhSach: '', trangThai: 'Đang học', ngayNhapHoc: '2024-09-05' };
  assert.equal((await gv.put('/api/students/SV002/profile', p)).status, 200);
  const r = await gv.get('/api/students/sv002/profile'); // mã SV không phân biệt hoa thường
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.maSV, 'SV002');
  assert.equal(r.data.profile.cccd, '000000000099');
  assert.equal((await gv.put('/api/students/SV002/profile', { ...p, cccd: '123' })).status, 400);
  assert.equal((await gv.put('/api/students/SV002/profile', { ...p, trangThai: 'Nghỉ' })).status, 400);
  assert.equal((await gv.put('/api/students/SV002/profile', { ...p, ngaySinh: '2005-02-30' })).status, 400);
  assert.equal((await gv.put('/api/students/SV002/profile', { ...p, ngaySinh: '2005-13-01' })).status, 400);
  assert.equal((await gv.put('/api/students/SV002/profile', { ...p, ngaySinh: '2999-01-01' })).status, 400);
  assert.equal((await gv.put('/api/students/KHONGCO/profile', p)).status, 404);
  assert.equal((await sv2.put('/api/students/SV002/profile', p)).status, 403);
});

test('hồ sơ: sinh viên chỉ xem được hồ sơ của mình; danh sách có trạng thái học tập', async () => {
  assert.equal((await sv2.get('/api/students/SV002/profile')).status, 200);
  assert.equal((await sv2.get('/api/students/SV003/profile')).status, 403);
  assert.equal((await sv2.get('/api/students/KHONGCO/profile')).status, 403);
  const d = (await gv.get('/api/data')).data;
  assert.equal(d.students.find((s) => s.maSV === 'SV011').trangThai, 'Bảo lưu');
  assert.equal(d.students.find((s) => s.maSV === 'SV002').trangThai, 'Đang học');
});

test('thân nhân: thay cả danh sách, kiểm tra năm sinh, số điện thoại, họ tên', async () => {
  const fam = [
    { quanHe: 'Bố', hoTen: 'Trần Văn Hùng', namSinh: 1975, ngheNghiep: 'Kỹ sư', sdt: '0912000001', khanCap: true },
    { quanHe: 'Mẹ', hoTen: 'Nguyễn Thị Hoa', namSinh: null, ngheNghiep: '', sdt: '' },
  ];
  assert.equal((await gv.put('/api/students/SV002/family', { family: fam })).status, 200);
  const r = await sv2.get('/api/students/SV002/profile');
  assert.equal(r.data.family.length, 2);
  assert.equal(r.data.family[0].khanCap, true);
  assert.equal(r.data.family[1].khanCap, false);
  assert.equal((await gv.put('/api/students/SV002/family', { family: [{ ...fam[0], namSinh: 1800 }] })).status, 400);
  assert.equal((await gv.put('/api/students/SV002/family', { family: [{ ...fam[0], sdt: 'abc' }] })).status, 400);
  assert.equal((await gv.put('/api/students/SV002/family', { family: [{ ...fam[0], hoTen: ' ' }] })).status, 400);
  assert.equal((await gv.put('/api/students/SV002/family', { family: Array(11).fill(fam[1]) })).status, 400);
  assert.equal((await sv2.put('/api/students/SV002/family', { family: [] })).status, 403);
});

test('yêu cầu cập nhật hồ sơ: gửi, chặn gửi trùng, duyệt thì áp dụng vào hồ sơ', async () => {
  assert.equal((await sv2.post('/api/profile-requests', { changes: { cccd: '000000000001' } })).status, 400);
  assert.equal((await sv2.post('/api/profile-requests', { changes: {} })).status, 400);
  assert.equal((await sv2.post('/api/profile-requests', { changes: { sdt: '123' } })).status, 400);
  const sent = await sv2.post('/api/profile-requests', { changes: { sdt: '0987654321', diaChi: 'Số 1 phố Mới' }, lyDo: 'Đổi số và chuyển nhà' });
  assert.equal(sent.status, 201);
  assert.equal((await sv2.post('/api/profile-requests', { changes: { email: 'x@y.vn' } })).status, 409);
  assert.equal((await gv.post('/api/profile-requests', { changes: { sdt: '0987654321' } })).status, 403);
  const list = (await gv.get('/api/profile-requests')).data.requests;
  const req = list.find((x) => x.id === sent.data.id);
  assert.equal(req.trangThai, 'Chờ duyệt');
  assert.equal(req.hienTai.diaChi, 'Số 5 phố Mẫu');
  assert.equal(req.changes.diaChi, 'Số 1 phố Mới');
  assert.equal((await sv2.put('/api/profile-requests/' + req.id, { duyet: true })).status, 403);
  assert.equal((await gv.put('/api/profile-requests/' + req.id, { duyet: false })).status, 400);
  assert.equal((await gv.put('/api/profile-requests/' + req.id, { duyet: true })).status, 200);
  assert.equal((await gv.put('/api/profile-requests/' + req.id, { duyet: true })).status, 409);
  const d = (await sv2.get('/api/data')).data;
  assert.equal(d.students[0].sdt, '0987654321');
  assert.equal((await sv2.get('/api/students/SV002/profile')).data.profile.diaChi, 'Số 1 phố Mới');
});

test('yêu cầu bị từ chối thì dữ liệu giữ nguyên và sinh viên thấy lý do', async () => {
  const before = (await sv2.get('/api/data')).data.students[0].email;
  const sent = await sv2.post('/api/profile-requests', { changes: { email: 'moi@mail.vn' } });
  assert.equal(sent.status, 201);
  assert.equal((await gv.put('/api/profile-requests/' + sent.data.id, { duyet: false, phanHoi: 'Cần dùng email của trường' })).status, 200);
  const mine = (await sv2.get('/api/profile-requests')).data.requests;
  assert.ok(mine.every((x) => x.maSV === 'SV002'));
  const r = mine.find((x) => x.id === sent.data.id);
  assert.equal(r.trangThai, 'Từ chối');
  assert.equal(r.phanHoi, 'Cần dùng email của trường');
  assert.equal((await sv2.get('/api/data')).data.students[0].email, before);
});

test('ĐRL: quy trình sinh viên → lớp → khoa theo khung TT16', async () => {
  const self = await sv5.put(`/api/drl/SV005/${T}/self`, { items: items([18, 22, 17, 20, 8]) });
  assert.equal(self.status, 200);
  assert.equal(self.data.evaluation.trangThai, 'Chờ lớp đánh giá');
  assert.equal(self.data.evaluation.diemSV, 85);
  assert.equal((await sv5.put(`/api/drl/SV005/${T}/self`, { items: items([18, 22, 17, 21, 8]) })).data.evaluation.diemSV, 86);
  assert.equal((await gv.put(`/api/drl/SV005/${T}/faculty`, { items: items([18, 22, 17, 22, 9]) })).status, 403);
  assert.equal((await admin.put(`/api/drl/SV005/${T}/faculty`, { items: items([18, 22, 17, 22, 9]) })).status, 409);
  const lop = await gv.put(`/api/drl/SV005/${T}/class`, { items: items([18, 23, 18, 22, 9]), ghiChu: 'Họp lớp ngày 20/12' });
  assert.equal(lop.status, 200);
  assert.equal(lop.data.evaluation.trangThai, 'Chờ khoa duyệt');
  assert.equal(lop.data.evaluation.diemLop, 90);
  assert.equal((await sv5.put(`/api/drl/SV005/${T}/self`, { items: items([20, 25, 20, 25, 10]) })).status, 409);
  const khoa = await admin.put(`/api/drl/SV005/${T}/faculty`, { items: items([18, 22, 17, 22, 9]) });
  assert.equal(khoa.status, 200);
  assert.deepEqual(
    [khoa.data.evaluation.trangThai, khoa.data.evaluation.diemKhoa, khoa.data.evaluation.diemCuoi, khoa.data.evaluation.xepLoai, khoa.data.evaluation.ghiChu],
    ['Đã duyệt', 88, 88, 'Tốt', 'Họp lớp ngày 20/12'],
  );
  assert.equal((await gv.put(`/api/drl/SV005/${T}/class`, { items: items([18, 23, 18, 22, 9]) })).status, 409);
  assert.equal((await admin.put(`/api/drl/SV005/${T}/faculty`, { items: items([18, 22, 17, 22, 9]) })).status, 409);
});

test('ĐRL: điểm từng tiêu chí sai, phiếu của người khác, mã không tồn tại', async () => {
  assert.equal((await sv2.put(`/api/drl/SV002/${T}/self`, { items: items([18, 26, 17, 20, 8]) })).status, 400);
  assert.equal((await sv2.put(`/api/drl/SV002/${T}/self`, { items: { TC1: 18, TC2: 22, TC3: 17, TC4: 20 } })).status, 400);
  assert.equal((await sv2.put(`/api/drl/SV002/${T}/self`, { items: items([18.5, 22, 17, 20, 8]) })).status, 400);
  assert.equal((await sv2.put(`/api/drl/SV002/${T}/self`, { items: { ...items([18, 22, 17, 20, 8]), TC9: 1 } })).status, 400);
  assert.equal((await sv2.put(`/api/drl/SV005/${T}/self`, { items: items([18, 22, 17, 20, 8]) })).status, 403);
  assert.equal((await gv.put(`/api/drl/SV999/${T}/class`, { items: items([18, 22, 17, 20, 8]) })).status, 404);
  assert.equal((await gv.put('/api/drl/SV002/khong-co/class', { items: items([18, 22, 17, 20, 8]) })).status, 404);
  assert.equal((await gv.put(`/api/drl/SV002/${T}/self`, { items: items([18, 22, 17, 20, 8]) })).status, 403);
});

test('ĐRL: mở lại phiếu đã duyệt để sửa', async () => {
  const r = await admin.post(`/api/drl/SV005/${T}/reopen`);
  assert.equal(r.status, 200);
  assert.equal(r.data.evaluation.trangThai, 'Chờ khoa duyệt');
  assert.equal(r.data.evaluation.diemKhoa, null);
  assert.equal(r.data.evaluation.diemCuoi, null);
  assert.equal((await admin.post(`/api/drl/SV005/${T}/reopen`)).status, 409);
  assert.equal((await gv.post(`/api/drl/SV005/${T}/reopen`)).status, 403);
  assert.equal((await gv.put(`/api/drl/SV005/${T}/class`, { items: items([19, 23, 18, 22, 9]) })).status, 200);
});

test('ĐRL: đổi khung chỉ áp dụng cho phiếu mới; khung nhóm lấy trung bình lớp và khoa', async () => {
  assert.equal((await gv.put('/api/drl/frameworks/active', { id: 'nhom' })).status, 403);
  assert.equal((await admin.put('/api/drl/frameworks/active', { id: 'khong-co' })).status, 404);
  assert.equal((await admin.put('/api/drl/frameworks/active', { id: 'nhom' })).status, 200);
  assert.equal((await gv.put(`/api/drl/SV006/${T}/class`, { items: items([20, 21, 17, 15, 13]) })).status, 400); // TC2 tối đa 20
  const lop = await gv.put(`/api/drl/SV006/${T}/class`, { items: items([17, 16, 16, 16, 16]) });
  assert.equal(lop.data.evaluation.frameworkId, 'nhom');
  const khoa = await admin.put(`/api/drl/SV006/${T}/faculty`, { items: items([17, 17, 17, 17, 16]) });
  assert.equal(khoa.data.evaluation.diemCuoi, 83); // (81 + 84) / 2 = 82,5 → 83
  assert.equal(khoa.data.evaluation.xepLoai, 'Giỏi');
  const old = await gv.put(`/api/drl/SV005/${T}/class`, { items: items([19, 25, 18, 22, 9]) }); // phiếu cũ vẫn theo TT16 (TC2 tối đa 25)
  assert.equal(old.status, 200);
  assert.equal(old.data.evaluation.frameworkId, 'tt16');
  assert.equal((await admin.put('/api/drl/frameworks/active', { id: 'tt16' })).status, 200);
});

test('ĐRL: sinh viên chỉ đọc được phiếu của mình', async () => {
  const mine = (await sv2.get('/api/drl?termId=t2')).data.evaluations;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].maSV, 'SV002');
  assert.equal((await gv.get('/api/drl?termId=t2')).data.evaluations.length, 12);
  assert.ok((await gv.get('/api/drl')).data.evaluations.length >= 26);
});

test('sao lưu phiên bản 2 giữ hồ sơ, thân nhân và phiếu ĐRL; phiếu sai điểm bị bỏ qua', async () => {
  const exp = (await admin.get('/api/export')).data;
  assert.equal(exp.version, 2);
  assert.equal(exp.profiles.length, 12);
  const nDrl = exp.drl.length;
  const imp = await admin.call('POST', '/api/admin/import', exp);
  assert.equal(imp.status, 200);
  assert.equal(imp.data.counts.drl, nDrl);
  assert.equal(imp.data.counts.families, exp.families.length);
  assert.equal((await gv.get('/api/students/SV002/profile')).data.profile.diaChi, 'Số 1 phố Mới');
  const ev = (await gv.get(`/api/drl?termId=${T}`)).data.evaluations.find((e) => e.maSV === 'SV006');
  assert.equal(ev.diemCuoi, 83);
  const tampered = JSON.parse(JSON.stringify(exp));
  tampered.drl[0].items.sv.TC1 = 999;
  assert.equal((await admin.call('POST', '/api/admin/import', tampered)).data.counts.drl, nDrl - 1);
});

test('xóa học kỳ thì xóa phiếu ĐRL của học kỳ đó; xóa sinh viên thì xóa hồ sơ', async () => {
  assert.ok((await gv.get(`/api/drl?termId=${T}`)).data.evaluations.length > 0);
  assert.equal((await admin.del(`/api/terms/${T}`)).status, 200);
  assert.equal((await gv.get(`/api/drl?termId=${T}`)).data.evaluations.length, 0);
  assert.equal((await admin.del('/api/students/SV006')).status, 200);
  assert.equal((await gv.get('/api/students/SV006/profile')).status, 404);
});
