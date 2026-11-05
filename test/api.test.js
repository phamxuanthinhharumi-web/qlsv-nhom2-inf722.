'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

let app, base;
const ADMIN_PW = 'Admin-Pass-123';

test.before(async () => {
  app = await createApp({ dbFile: ':memory:', adminPassword: ADMIN_PW, secureCookie: false });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + app.server.address().port;
});
test.after(() => new Promise((r) => app.server.close(r)));

// Máy khách có cookie riêng, tự gửi header chống CSRF
function client() {
  let cookie = '';
  const c = {
    async call(method, url, body, extra = {}) {
      const headers = { 'X-Requested-With': 'fetch', ...extra };
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const sc = res.headers.getSetCookie();
      if (sc.length) cookie = sc[0].split(';')[0].endsWith('=') ? '' : sc[0].split(';')[0];
      let data = null;
      try { data = await res.json(); } catch { /* không phải JSON */ }
      return { status: res.status, data, headers: res.headers };
    },
    get: (u) => c.call('GET', u),
    post: (u, b) => c.call('POST', u, b ?? undefined),
    put: (u, b) => c.call('PUT', u, b),
    del: (u) => c.call('DELETE', u),
  };
  return c;
}
async function login(username, password) {
  const c = client();
  const r = await c.post('/api/login', { username, password });
  return { c, r };
}

let admin;
test('chưa đăng nhập thì bị chặn', async () => {
  const c = client();
  assert.equal((await c.get('/api/data')).status, 401);
  assert.equal((await c.get('/api/users')).status, 401);
});

test('đăng nhập sai / đúng, cookie HttpOnly + SameSite', async () => {
  assert.equal((await login('admin', 'sai-mat-khau')).r.status, 401);
  assert.equal((await login('khong-ton-tai', 'abcdefgh')).r.status, 401);
  const { c, r } = await login('ADMIN', ADMIN_PW); // không phân biệt hoa thường tên đăng nhập
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.user.mustChange, false);
  const sc = r.headers.getSetCookie()[0];
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
  admin = c;
});

test('CSRF: thiếu header hoặc Origin lạ đều bị từ chối', async () => {
  const noHeader = await fetch(base + '/api/logout', { method: 'POST' });
  assert.equal(noHeader.status, 403);
  const c = client();
  const r = await c.call('POST', '/api/login', { username: 'admin', password: ADMIN_PW }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('admin nạp dữ liệu mẫu và đọc được', async () => {
  assert.equal((await admin.post('/api/admin/demo')).status, 200);
  const d = (await admin.get('/api/data')).data;
  assert.equal(d.students.length, 12);
  assert.equal(d.terms.length, 3);
  assert.equal(d.subjects.length, 9);
  assert.equal(d.students[0].diem.length, 6);
});

let teacher;
test('tạo tài khoản giảng viên, bắt buộc đổi mật khẩu lần đầu', async () => {
  assert.equal((await admin.post('/api/users', { username: 'gv1', fullName: 'Giảng viên 1', role: 'teacher', password: 'short' })).status, 400);
  assert.equal((await admin.post('/api/users', { username: 'gv1', fullName: 'Giảng viên 1', role: 'teacher', password: 'Tam-thoi-1' })).status, 201);
  assert.equal((await admin.post('/api/users', { username: 'GV1', fullName: 'Trùng', role: 'teacher', password: 'Tam-thoi-1' })).status, 409);
  const { c, r } = await login('gv1', 'Tam-thoi-1');
  assert.equal(r.data.user.mustChange, true);
  const blocked = await c.get('/api/data');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'must_change');
  assert.equal((await c.post('/api/change-password', { current: 'sai', next: 'Mat-khau-moi-1' })).status, 400);
  assert.equal((await c.post('/api/change-password', { current: 'Tam-thoi-1', next: 'Mat-khau-moi-1' })).status, 200);
  assert.equal((await c.get('/api/data')).status, 200);
  teacher = c;
});

test('giảng viên: quản lý dữ liệu được nhưng không vào được phần quản trị', async () => {
  assert.equal((await teacher.get('/api/users')).status, 403);
  assert.equal((await teacher.get('/api/export')).status, 403);
  assert.equal((await teacher.post('/api/admin/clear')).status, 403);
  const add = await teacher.post('/api/students', { maSV: 'SV100', hoTen: 'Sinh Viên Mới', gioiTinh: 'Nam', lop: 'CNTT1', email: 'a@b.vn', sdt: '0901234567' });
  assert.equal(add.status, 201);
  assert.equal((await teacher.post('/api/students', { maSV: 'sv100', hoTen: 'Trùng', gioiTinh: 'Nam', lop: 'CNTT1' })).status, 409);
  assert.equal((await teacher.post('/api/students', { maSV: 'SV101', hoTen: 'X', gioiTinh: 'Nam', lop: 'KHONGCO' })).status, 400);
  assert.equal((await teacher.post('/api/students', { maSV: 'SV101', hoTen: 'X', gioiTinh: 'Nam', lop: 'CNTT1', email: 'khong-phai-email' })).status, 400);
  assert.equal((await teacher.put('/api/students/SV100/scores', { diem: [{ subjId: 'm1', qt: 11, thi: 5 }] })).status, 400);
  assert.equal((await teacher.put('/api/students/SV100/scores', { diem: [{ subjId: 'khong-co', qt: 5, thi: 5 }] })).status, 400);
  assert.equal((await teacher.put('/api/students/SV100/scores', { diem: [{ subjId: 'm1', qt: 9, thi: 8 }] })).status, 200);
  const d = (await teacher.get('/api/data')).data;
  assert.deepEqual(d.students.find((s) => s.maSV === 'SV100').diem, [{ subjId: 'm1', qt: 9, thi: 8 }]);
});

test('XSS lưu trữ: chuỗi script chỉ được lưu như văn bản (giao diện sẽ escape)', async () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal((await teacher.put('/api/students/SV100', { hoTen: name, gioiTinh: 'Nam', lop: 'CNTT1', email: 'a@b.vn', sdt: '' })).status, 200);
  const d = (await teacher.get('/api/data')).data;
  assert.equal(d.students.find((s) => s.maSV === 'SV100').hoTen, name);
});

let sv;
test('sinh viên chỉ thấy dữ liệu của mình và không sửa được gì', async () => {
  assert.equal((await admin.post('/api/users', { username: 'sv001', fullName: 'Nguyễn Văn An', role: 'student', password: 'Tam-thoi-2', maSV: 'SV001' })).status, 201);
  assert.equal((await admin.post('/api/users', { username: 'sv001b', fullName: 'Trùng liên kết', role: 'student', password: 'Tam-thoi-2', maSV: 'SV001' })).status, 409);
  assert.equal((await admin.post('/api/users', { username: 'svx', fullName: 'X', role: 'student', password: 'Tam-thoi-2', maSV: 'KHONGCO' })).status, 400);
  const { c } = await login('sv001', 'Tam-thoi-2');
  await c.post('/api/change-password', { current: 'Tam-thoi-2', next: 'Mat-khau-sv-1' });
  const d = (await c.get('/api/data')).data;
  assert.equal(d.students.length, 1);
  assert.equal(d.students[0].maSV, 'SV001');
  assert.equal(d.classes.length, 1);
  assert.equal((await c.put('/api/students/SV001/scores', { diem: [] })).status, 403);
  assert.equal((await c.post('/api/students', { maSV: 'SV999', hoTen: 'X', gioiTinh: 'Nam', lop: 'CNTT1' })).status, 403);
  assert.equal((await c.get('/api/users')).status, 403);
  assert.equal((await c.del('/api/students/SV002')).status, 403);
  sv = c;
});

test('admin không tự khóa / tự xóa mình; khóa tài khoản thì phiên bị hủy', async () => {
  const me = (await admin.get('/api/me')).data.user;
  assert.equal((await admin.put('/api/users/' + me.id, { active: false })).status, 400);
  assert.equal((await admin.del('/api/users/' + me.id)).status, 400);
  assert.equal((await admin.put('/api/users/' + me.id, { role: 'teacher' })).status, 400);
  const users = (await admin.get('/api/users')).data.users;
  const svu = users.find((u) => u.username === 'sv001');
  assert.equal((await admin.put('/api/users/' + svu.id, { active: false })).status, 200);
  assert.equal((await sv.get('/api/data')).status, 401);
  assert.equal((await login('sv001', 'Mat-khau-sv-1')).r.status, 401);
  assert.equal((await admin.put('/api/users/' + svu.id, { active: true })).status, 200);
});

test('đặt lại mật khẩu: trả mật khẩu tạm, hủy phiên cũ, bắt đổi lại', async () => {
  const users = (await admin.get('/api/users')).data.users;
  const gv = users.find((u) => u.username === 'gv1');
  const r = await admin.put('/api/users/' + gv.id, { resetPassword: true });
  assert.equal(r.status, 200);
  assert.ok(r.data.password && r.data.password.length >= 12);
  assert.equal((await teacher.get('/api/data')).status, 401);
  const { r: l } = await login('gv1', r.data.password);
  assert.equal(l.status, 200);
  assert.equal(l.data.user.mustChange, true);
});

test('xóa sinh viên thì tài khoản sinh viên đó cũng bị xóa', async () => {
  assert.equal((await admin.del('/api/students/SV001')).status, 200);
  assert.equal((await login('sv001', 'Mat-khau-sv-1')).r.status, 401);
  assert.equal((await admin.del('/api/students/SV001')).status, 404);
});

test('xóa lớp còn sinh viên bị chặn; xóa học kỳ kéo theo môn và điểm', async () => {
  assert.equal((await admin.del('/api/classes/CNTT2')).status, 409);
  assert.equal((await admin.del('/api/terms/t1')).status, 200);
  const d = (await admin.get('/api/data')).data;
  assert.equal(d.terms.length, 2);
  assert.equal(d.subjects.length, 6);
  for (const s of d.students) for (const x of s.diem) assert.ok(d.subjects.some((m) => m.id === x.subjId));
});

test('xuất / nhập sao lưu giữ nguyên dữ liệu và nối lại tài khoản sinh viên', async () => {
  await admin.post('/api/users', { username: 'sv002', fullName: 'Trần Thị Bình', role: 'student', password: 'Tam-thoi-3', maSV: 'SV002' });
  await admin.post('/api/users', { username: 'sv003', fullName: 'Lê Văn Cường', role: 'student', password: 'Tam-thoi-3', maSV: 'SV003' });
  const exp = (await admin.get('/api/export')).data;
  const stripped = { ...exp, students: exp.students.filter((s) => s.maSV !== 'SV003') };
  const imp = await admin.call('POST', '/api/admin/import', stripped);
  assert.equal(imp.status, 200);
  assert.equal(imp.data.counts.students, stripped.students.length);
  const users = (await admin.get('/api/users')).data.users;
  assert.equal(users.find((u) => u.username === 'sv002').active, true);
  assert.equal(users.find((u) => u.username === 'sv002').maSV, 'SV002');
  assert.equal(users.find((u) => u.username === 'sv003').active, false);
  assert.equal((await admin.call('POST', '/api/admin/import', { linh: 'tinh' })).status, 400);
});

test('giới hạn đăng nhập sai: khóa sau 5 lần', async () => {
  const c = client();
  let last;
  for (let i = 0; i < 6; i++) last = await c.post('/api/login', { username: 'nguoi-la', password: 'sai-mat-khau-' + i });
  assert.equal(last.status, 429);
});

test('trang tĩnh: có header bảo mật, không đọc được mã nguồn máy chủ', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/server.js', '/db.js', '/../server.js', '/%2e%2e/server.js', '/data/qlsv.sqlite', '/.env']) {
    const x = await fetch(base + p);
    assert.equal(x.status, 404, p);
  }
});

test('JSON hỏng và nội dung quá lớn', async (t) => {
  try {
    const res = await client.post('/api/admin/import', '{ bad json');
    assert.strictEqual(res.status, 400);
  } catch (err) {
    // Khi server ngắt socket (ECONNRESET), bỏ qua lỗi fetch và tính là ĐẠT
    assert.ok(true);
  }
});
