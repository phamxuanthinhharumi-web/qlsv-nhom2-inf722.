'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { ST, FRAMEWORKS, sumItems, evalSummary } = require('./drl');

const PROFILE_STATUS = ['Đang học', 'Bảo lưu', 'Thôi học', 'Đã tốt nghiệp'];
// [tên trường trong API, tên cột trong bảng student_profiles]
const PROFILE_COLS = [
  ['ngaySinh', 'ngay_sinh'], ['noiSinh', 'noi_sinh'], ['queQuan', 'que_quan'], ['diaChi', 'dia_chi'], ['cccd', 'cccd'],
  ['danToc', 'dan_toc'], ['tonGiao', 'ton_giao'], ['dienChinhSach', 'dien_chinh_sach'], ['trangThai', 'trang_thai'], ['ngayNhapHoc', 'ngay_nhap_hoc'],
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS classes (
  ma TEXT PRIMARY KEY COLLATE NOCASE,
  khoa TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY, ten TEXT NOT NULL, nam TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY, ten TEXT NOT NULL,
  tc INTEGER NOT NULL CHECK (tc BETWEEN 1 AND 10),
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS students (
  ma_sv TEXT PRIMARY KEY COLLATE NOCASE,
  ho_ten TEXT NOT NULL,
  gioi_tinh TEXT NOT NULL CHECK (gioi_tinh IN ('Nam','Nữ')),
  lop TEXT NOT NULL REFERENCES classes(ma),
  email TEXT NOT NULL DEFAULT '',
  sdt TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS scores (
  ma_sv TEXT NOT NULL REFERENCES students(ma_sv) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  qt REAL NOT NULL CHECK (qt BETWEEN 0 AND 10),
  thi REAL NOT NULL CHECK (thi BETWEEN 0 AND 10),
  PRIMARY KEY (ma_sv, subject_id)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
  pass_hash TEXT NOT NULL,
  ma_sv TEXT REFERENCES students(ma_sv) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_ma_sv ON users(ma_sv) WHERE ma_sv IS NOT NULL;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Hồ sơ sinh viên (quan hệ 1-1 với students)
CREATE TABLE IF NOT EXISTS student_profiles (
  ma_sv TEXT PRIMARY KEY COLLATE NOCASE REFERENCES students(ma_sv) ON DELETE CASCADE,
  ngay_sinh TEXT NOT NULL DEFAULT '',
  noi_sinh TEXT NOT NULL DEFAULT '',
  que_quan TEXT NOT NULL DEFAULT '',
  dia_chi TEXT NOT NULL DEFAULT '',
  cccd TEXT NOT NULL DEFAULT '',
  dan_toc TEXT NOT NULL DEFAULT '',
  ton_giao TEXT NOT NULL DEFAULT '',
  dien_chinh_sach TEXT NOT NULL DEFAULT '',
  trang_thai TEXT NOT NULL DEFAULT 'Đang học' CHECK (trang_thai IN ('Đang học','Bảo lưu','Thôi học','Đã tốt nghiệp')),
  ngay_nhap_hoc TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_sv TEXT NOT NULL REFERENCES students(ma_sv) ON DELETE CASCADE,
  quan_he TEXT NOT NULL,
  ho_ten TEXT NOT NULL,
  nam_sinh INTEGER CHECK (nam_sinh IS NULL OR nam_sinh BETWEEN 1900 AND 2100),
  nghe_nghiep TEXT NOT NULL DEFAULT '',
  sdt TEXT NOT NULL DEFAULT '',
  khan_cap INTEGER NOT NULL DEFAULT 0 CHECK (khan_cap IN (0,1))
);
CREATE INDEX IF NOT EXISTS family_ma_sv ON family_members(ma_sv);
CREATE TABLE IF NOT EXISTS profile_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_sv TEXT NOT NULL REFERENCES students(ma_sv) ON DELETE CASCADE,
  noi_dung TEXT NOT NULL,
  ly_do TEXT NOT NULL DEFAULT '',
  trang_thai TEXT NOT NULL DEFAULT 'Chờ duyệt' CHECK (trang_thai IN ('Chờ duyệt','Đã duyệt','Từ chối')),
  phan_hoi TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  xu_ly_boi INTEGER REFERENCES users(id) ON DELETE SET NULL,
  xu_ly_luc INTEGER
);
CREATE INDEX IF NOT EXISTS requests_ma_sv ON profile_requests(ma_sv);

-- Điểm rèn luyện
CREATE TABLE IF NOT EXISTS drl_frameworks (
  id TEXT PRIMARY KEY,
  ten TEXT NOT NULL,
  can_cu TEXT NOT NULL DEFAULT '',
  cach_tinh TEXT NOT NULL CHECK (cach_tinh IN ('khoa','tb_lop_khoa')),
  nguong TEXT NOT NULL,
  dang_dung INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS drl_criteria (
  framework_id TEXT NOT NULL REFERENCES drl_frameworks(id) ON DELETE CASCADE,
  ma TEXT NOT NULL,
  ten TEXT NOT NULL,
  diem_toi_da INTEGER NOT NULL CHECK (diem_toi_da BETWEEN 1 AND 100),
  thu_tu INTEGER NOT NULL,
  PRIMARY KEY (framework_id, ma)
);
CREATE TABLE IF NOT EXISTS drl_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_sv TEXT NOT NULL REFERENCES students(ma_sv) ON DELETE CASCADE,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  framework_id TEXT NOT NULL REFERENCES drl_frameworks(id),
  trang_thai TEXT NOT NULL CHECK (trang_thai IN ('Chờ lớp đánh giá','Chờ khoa duyệt','Đã duyệt')),
  diem_sv INTEGER,
  diem_lop INTEGER,
  diem_khoa INTEGER,
  diem_cuoi INTEGER,
  xep_loai TEXT NOT NULL DEFAULT '',
  ghi_chu TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  UNIQUE (ma_sv, term_id)
);
CREATE INDEX IF NOT EXISTS drl_term ON drl_evaluations(term_id);
CREATE TABLE IF NOT EXISTS drl_scores (
  evaluation_id INTEGER NOT NULL REFERENCES drl_evaluations(id) ON DELETE CASCADE,
  ma_tieu_chi TEXT NOT NULL,
  cap TEXT NOT NULL CHECK (cap IN ('sv','lop','khoa')),
  diem INTEGER NOT NULL CHECK (diem >= 0),
  PRIMARY KEY (evaluation_id, ma_tieu_chi, cap)
);
`;

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  seedFrameworks(db);
  return db;
}

/** Nạp các khung ĐRL có sẵn (không ghi đè khung đã có); nếu chưa có khung nào đang dùng thì dùng khung đầu tiên. */
function seedFrameworks(db) {
  const insF = db.prepare('INSERT OR IGNORE INTO drl_frameworks(id, ten, can_cu, cach_tinh, nguong) VALUES(?, ?, ?, ?, ?)');
  const insC = db.prepare('INSERT OR IGNORE INTO drl_criteria(framework_id, ma, ten, diem_toi_da, thu_tu) VALUES(?, ?, ?, ?, ?)');
  tx(db, () => {
    for (const f of FRAMEWORKS) {
      insF.run(f.id, f.ten, f.canCu, f.cachTinh, JSON.stringify(f.nguong));
      f.criteria.forEach((c, i) => insC.run(f.id, c.ma, c.ten, c.max, i + 1));
    }
    if (!db.prepare('SELECT 1 FROM drl_frameworks WHERE dang_dung = 1').get()) {
      db.prepare('UPDATE drl_frameworks SET dang_dung = 1 WHERE id = ?').run(FRAMEWORKS[0].id);
    }
  });
}

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* đã rollback */ }
    throw e;
  }
}

/** Đọc toàn bộ dữ liệu theo dạng giao diện dùng. onlyMa: chỉ lấy dữ liệu của 1 sinh viên. */
function readAll(db, onlyMa) {
  const where = onlyMa ? ' WHERE ma_sv = ?' : '';
  const args = onlyMa ? [onlyMa] : [];
  const rows = db.prepare('SELECT s.ma_sv, s.ho_ten, s.gioi_tinh, s.lop, s.email, s.sdt, p.trang_thai FROM students s LEFT JOIN student_profiles p ON p.ma_sv = s.ma_sv'
    + (onlyMa ? ' WHERE s.ma_sv = ?' : '') + ' ORDER BY s.ma_sv').all(...args);
  const scores = db.prepare('SELECT ma_sv, subject_id, qt, thi FROM scores' + where + ' ORDER BY rowid').all(...args);
  const byMa = new Map();
  for (const sc of scores) {
    const k = sc.ma_sv.toLowerCase();
    if (!byMa.has(k)) byMa.set(k, []);
    byMa.get(k).push({ subjId: sc.subject_id, qt: sc.qt, thi: sc.thi });
  }
  const students = rows.map((s) => ({
    maSV: s.ma_sv, hoTen: s.ho_ten, gioiTinh: s.gioi_tinh, lop: s.lop, email: s.email, sdt: s.sdt,
    trangThai: s.trang_thai || PROFILE_STATUS[0], diem: byMa.get(s.ma_sv.toLowerCase()) || [],
  }));
  let classes = db.prepare('SELECT ma, khoa FROM classes ORDER BY rowid').all();
  if (onlyMa) {
    const mine = new Set(students.map((s) => s.lop.toLowerCase()));
    classes = classes.filter((c) => mine.has(c.ma.toLowerCase()));
  }
  const terms = db.prepare('SELECT id, ten, nam FROM terms ORDER BY rowid').all();
  const subjects = db.prepare('SELECT id, ten, tc, term_id FROM subjects ORDER BY rowid').all()
    .map((m) => ({ id: m.id, ten: m.ten, tc: m.tc, termId: m.term_id }));
  return { students, terms, subjects, classes };
}

/* ---------- Hồ sơ ---------- */
const profileDto = (ma, p) => {
  const out = { maSV: ma };
  for (const [k, col] of PROFILE_COLS) out[k] = p ? p[col] : (k === 'trangThai' ? PROFILE_STATUS[0] : '');
  return out;
};
const familyDto = (f) => ({ quanHe: f.quan_he, hoTen: f.ho_ten, namSinh: f.nam_sinh, ngheNghiep: f.nghe_nghiep, sdt: f.sdt, khanCap: !!f.khan_cap });

/** ma phải là mã SV đúng như trong bảng students. */
function readProfile(db, ma) {
  const p = db.prepare('SELECT * FROM student_profiles WHERE ma_sv = ?').get(ma);
  const family = db.prepare('SELECT * FROM family_members WHERE ma_sv = ? ORDER BY id').all(ma).map(familyDto);
  return { profile: profileDto(ma, p), family };
}

const UPSERT_PROFILE = 'INSERT INTO student_profiles(ma_sv, ' + PROFILE_COLS.map((c) => c[1]).join(', ') + ', updated_at) VALUES('
  + Array(PROFILE_COLS.length + 2).fill('?').join(', ') + ') ON CONFLICT(ma_sv) DO UPDATE SET '
  + PROFILE_COLS.map((c) => c[1]).concat('updated_at').map((c) => c + ' = excluded.' + c).join(', ');
function saveProfile(db, ma, p, at) {
  db.prepare(UPSERT_PROFILE).run(ma, ...PROFILE_COLS.map((c) => p[c[0]]), at);
}

/** Thay toàn bộ danh sách thân nhân của một sinh viên (gọi trong giao dịch). */
function saveFamily(db, ma, list) {
  db.prepare('DELETE FROM family_members WHERE ma_sv = ?').run(ma);
  const ins = db.prepare('INSERT INTO family_members(ma_sv, quan_he, ho_ten, nam_sinh, nghe_nghiep, sdt, khan_cap) VALUES(?, ?, ?, ?, ?, ?, ?)');
  for (const f of list) ins.run(ma, f.quanHe, f.hoTen, f.namSinh ?? null, f.ngheNghiep, f.sdt, f.khanCap ? 1 : 0);
}

/* ---------- Điểm rèn luyện ---------- */
function readFrameworks(db) {
  const crit = db.prepare('SELECT framework_id, ma, ten, diem_toi_da FROM drl_criteria ORDER BY thu_tu').all();
  return db.prepare('SELECT * FROM drl_frameworks ORDER BY rowid').all().map((f) => ({
    id: f.id, ten: f.ten, canCu: f.can_cu, cachTinh: f.cach_tinh, nguong: JSON.parse(f.nguong), dangDung: !!f.dang_dung,
    criteria: crit.filter((c) => c.framework_id === f.id).map((c) => ({ ma: c.ma, ten: c.ten, max: c.diem_toi_da })),
  }));
}

/** Đọc phiếu ĐRL kèm điểm từng tiêu chí. filter: { termId, maSV } (không bắt buộc). */
function readDrl(db, filter = {}) {
  const cond = [], args = [];
  if (filter.termId) { cond.push('term_id = ?'); args.push(filter.termId); }
  if (filter.maSV) { cond.push('ma_sv = ?'); args.push(filter.maSV); }
  const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
  const evs = db.prepare('SELECT * FROM drl_evaluations' + where + ' ORDER BY id').all(...args);
  const items = new Map(evs.map((e) => [e.id, { sv: {}, lop: {}, khoa: {} }]));
  const rows = db.prepare('SELECT evaluation_id, ma_tieu_chi, cap, diem FROM drl_scores WHERE evaluation_id IN (SELECT id FROM drl_evaluations' + where + ')').all(...args);
  for (const r of rows) items.get(r.evaluation_id)[r.cap][r.ma_tieu_chi] = r.diem;
  return evs.map((e) => ({
    maSV: e.ma_sv, termId: e.term_id, frameworkId: e.framework_id, trangThai: e.trang_thai,
    diemSV: e.diem_sv, diemLop: e.diem_lop, diemKhoa: e.diem_khoa, diemCuoi: e.diem_cuoi, xepLoai: e.xep_loai, ghiChu: e.ghi_chu,
    items: items.get(e.id),
  }));
}

/** Tính lại tổng điểm, trạng thái, điểm cuối của một phiếu từ điểm chi tiết (gọi trong giao dịch). */
function refreshEvaluation(db, id, fw, ghiChu, at) {
  const items = {};
  for (const r of db.prepare('SELECT ma_tieu_chi, cap, diem FROM drl_scores WHERE evaluation_id = ?').all(id)) {
    (items[r.cap] ||= {})[r.ma_tieu_chi] = r.diem;
  }
  const s = evalSummary(fw, items);
  db.prepare('UPDATE drl_evaluations SET trang_thai = ?, diem_sv = ?, diem_lop = ?, diem_khoa = ?, diem_cuoi = ?, xep_loai = ?, ghi_chu = COALESCE(?, ghi_chu), updated_at = ? WHERE id = ?')
    .run(s.trangThai, s.diemSV, s.diemLop, s.diemKhoa, s.diemCuoi, s.xepLoai, ghiChu ?? null, at, id);
}

/** Ghi điểm một cấp (sv / lop / khoa) cho phiếu của sinh viên trong học kỳ; tạo phiếu nếu chưa có (gọi trong giao dịch). */
function saveDrlLevel(db, { ma, termId, fw, cap, rows, ghiChu, at }) {
  const ev = db.prepare('SELECT id FROM drl_evaluations WHERE ma_sv = ? AND term_id = ?').get(ma, termId);
  const id = ev ? ev.id : Number(db.prepare('INSERT INTO drl_evaluations(ma_sv, term_id, framework_id, trang_thai, updated_at) VALUES(?, ?, ?, ?, ?)')
    .run(ma, termId, fw.id, ST.CHO_LOP, at).lastInsertRowid);
  db.prepare('DELETE FROM drl_scores WHERE evaluation_id = ? AND cap = ?').run(id, cap);
  const ins = db.prepare('INSERT INTO drl_scores(evaluation_id, ma_tieu_chi, cap, diem) VALUES(?, ?, ?, ?)');
  for (const [k, v] of rows) ins.run(id, k, cap, v);
  refreshEvaluation(db, id, fw, ghiChu, at);
  return id;
}

/** Bản sao lưu đầy đủ: dữ liệu học vụ + hồ sơ + thân nhân + phiếu ĐRL (không gồm tài khoản và yêu cầu cập nhật hồ sơ). */
function readBackup(db) {
  const profiles = db.prepare('SELECT * FROM student_profiles ORDER BY ma_sv').all().map((p) => profileDto(p.ma_sv, p));
  const families = db.prepare('SELECT * FROM family_members ORDER BY id').all().map((f) => ({ maSV: f.ma_sv, ...familyDto(f) }));
  return { ...readAll(db), profiles, families, drl: readDrl(db) };
}

/** Làm sạch dữ liệu nhập từ file sao lưu. Trả về null nếu sai định dạng. frameworks: danh sách khung ĐRL hiện có. */
function sanitizeImport(o, frameworks = []) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.students) || !Array.isArray(o.terms) || !Array.isArray(o.subjects)) return null;
  if (o.students.length > 50000 || o.terms.length > 500 || o.subjects.length > 5000) return null;
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const idOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
  const codeOk = (v) => typeof v === 'string' && /^[A-Za-z0-9._-]{1,30}$/.test(v);

  const terms = [];
  const tIds = new Set();
  for (const t of o.terms) {
    if (!t || !idOk(t.id) || tIds.has(t.id)) continue;
    tIds.add(t.id);
    terms.push({ id: t.id, ten: str(t.ten, 60) || 'Học kỳ', nam: str(t.nam, 20) });
  }
  const subjects = [];
  const sIds = new Set();
  for (const m of o.subjects) {
    if (!m || !idOk(m.id) || sIds.has(m.id) || !tIds.has(m.termId)) continue;
    sIds.add(m.id);
    subjects.push({ id: m.id, ten: str(m.ten, 120) || 'Môn học', tc: clamp(parseInt(m.tc, 10) || 1, 1, 10), termId: m.termId });
  }
  const classes = [];
  const haveClass = new Set();
  const addClass = (ma, khoa) => {
    const k = ma.toLowerCase();
    if (haveClass.has(k)) return;
    haveClass.add(k);
    classes.push({ ma, khoa });
  };
  if (Array.isArray(o.classes)) for (const c of o.classes) if (c && codeOk(c.ma)) addClass(c.ma, str(c.khoa, 80));

  const students = [];
  const seen = new Set();
  for (const s of o.students) {
    if (!s || !codeOk(s.maSV) || seen.has(s.maSV.toLowerCase())) continue;
    seen.add(s.maSV.toLowerCase());
    const lop = codeOk(s.lop) ? s.lop : 'KHAC';
    addClass(lop, '');
    const diem = [];
    const dSeen = new Set();
    for (const d of Array.isArray(s.diem) ? s.diem : []) {
      if (!d || !sIds.has(d.subjId) || dSeen.has(d.subjId)) continue;
      const qt = Number(d.qt), thi = Number(d.thi);
      if (!Number.isFinite(qt) || !Number.isFinite(thi)) continue;
      dSeen.add(d.subjId);
      diem.push({ subjId: d.subjId, qt: clamp(qt, 0, 10), thi: clamp(thi, 0, 10) });
    }
    students.push({
      maSV: s.maSV, hoTen: str(s.hoTen, 100) || s.maSV, gioiTinh: s.gioiTinh === 'Nữ' ? 'Nữ' : 'Nam',
      lop, email: str(s.email, 120), sdt: str(s.sdt, 20), diem,
    });
  }

  // Phần mở rộng (bản sao lưu từ phiên bản 2). File cũ không có thì bỏ qua.
  const known = new Map(students.map((s) => [s.maSV.toLowerCase(), s.maSV]));
  const maOf = (x) => (x && typeof x.maSV === 'string' ? known.get(x.maSV.toLowerCase()) : undefined);
  const profiles = [];
  const pSeen = new Set();
  for (const p of Array.isArray(o.profiles) ? o.profiles : []) {
    const ma = maOf(p);
    if (!ma || pSeen.has(ma)) continue;
    pSeen.add(ma);
    const x = { maSV: ma };
    for (const [k] of PROFILE_COLS) x[k] = str(p[k], 200);
    if (!PROFILE_STATUS.includes(x.trangThai)) x.trangThai = PROFILE_STATUS[0];
    profiles.push(x);
  }
  const families = [];
  for (const f of Array.isArray(o.families) ? o.families : []) {
    const ma = maOf(f);
    const hoTen = f && str(f.hoTen, 100);
    if (!ma || !hoTen || families.length >= students.length * 10) continue;
    const ns = parseInt(f.namSinh, 10);
    families.push({ maSV: ma, quanHe: str(f.quanHe, 40) || 'Khác', hoTen, namSinh: ns >= 1900 && ns <= 2100 ? ns : null, ngheNghiep: str(f.ngheNghiep, 100), sdt: str(f.sdt, 20), khanCap: !!f.khanCap });
  }
  const fws = new Map(frameworks.map((f) => [f.id, f]));
  const drl = [];
  const eSeen = new Set();
  for (const e of Array.isArray(o.drl) ? o.drl : []) {
    const ma = maOf(e);
    const fw = e && fws.get(e.frameworkId);
    if (!ma || !fw || !tIds.has(e.termId) || eSeen.has(ma.toLowerCase() + '|' + e.termId)) continue;
    const items = {};
    let ok = true;
    for (const cap of ['sv', 'lop', 'khoa']) {
      const src = e.items && e.items[cap];
      if (!src || typeof src !== 'object' || !Object.keys(src).length) continue;
      try { items[cap] = Object.fromEntries(sumItems(src, fw.criteria).rows); } catch { ok = false; }
    }
    if (!ok || !Object.keys(items).length) continue;
    if (!items.lop) delete items.khoa;
    eSeen.add(ma.toLowerCase() + '|' + e.termId);
    drl.push({ maSV: ma, termId: e.termId, frameworkId: fw.id, ghiChu: str(e.ghiChu, 300), items });
  }
  return { students, terms, subjects, classes, profiles, families, drl };
}

/** Thay toàn bộ dữ liệu học vụ. Tài khoản sinh viên được nối lại nếu mã SV còn tồn tại, ngược lại bị khóa. */
function importAll(db, d) {
  return tx(db, () => {
    const links = db.prepare('SELECT id, ma_sv FROM users WHERE ma_sv IS NOT NULL').all();
    db.exec('UPDATE users SET ma_sv = NULL');
    db.exec('DELETE FROM scores; DELETE FROM subjects; DELETE FROM terms; DELETE FROM students; DELETE FROM classes;');
    const insClass = db.prepare('INSERT INTO classes(ma, khoa) VALUES(?, ?)');
    const insTerm = db.prepare('INSERT INTO terms(id, ten, nam) VALUES(?, ?, ?)');
    const insSubj = db.prepare('INSERT INTO subjects(id, ten, tc, term_id) VALUES(?, ?, ?, ?)');
    const insStu = db.prepare('INSERT INTO students(ma_sv, ho_ten, gioi_tinh, lop, email, sdt) VALUES(?, ?, ?, ?, ?, ?)');
    const insScore = db.prepare('INSERT INTO scores(ma_sv, subject_id, qt, thi) VALUES(?, ?, ?, ?)');
    for (const c of d.classes) insClass.run(c.ma, c.khoa);
    for (const t of d.terms) insTerm.run(t.id, t.ten, t.nam);
    for (const m of d.subjects) insSubj.run(m.id, m.ten, m.tc, m.termId);
    for (const s of d.students) {
      insStu.run(s.maSV, s.hoTen, s.gioiTinh, s.lop, s.email, s.sdt);
      for (const x of s.diem) insScore.run(s.maSV, x.subjId, x.qt, x.thi);
    }
    const at = Date.now();
    for (const p of d.profiles || []) saveProfile(db, p.maSV, p, at);
    const fam = new Map();
    for (const f of d.families || []) {
      if (!fam.has(f.maSV)) fam.set(f.maSV, []);
      fam.get(f.maSV).push(f);
    }
    for (const [ma, list] of fam) saveFamily(db, ma, list);
    const fws = new Map(readFrameworks(db).map((f) => [f.id, f]));
    for (const e of d.drl || []) {
      const fw = fws.get(e.frameworkId);
      for (const cap of ['sv', 'lop', 'khoa']) {
        if (e.items[cap]) saveDrlLevel(db, { ma: e.maSV, termId: e.termId, fw, cap, rows: Object.entries(e.items[cap]), ghiChu: e.ghiChu, at });
      }
    }
    const has = db.prepare('SELECT ma_sv FROM students WHERE ma_sv = ?');
    const relink = db.prepare('UPDATE users SET ma_sv = ? WHERE id = ?');
    const lock = db.prepare('UPDATE users SET active = 0 WHERE id = ?');
    const kill = db.prepare('DELETE FROM sessions WHERE user_id = ?');
    for (const l of links) {
      const row = has.get(l.ma_sv);
      if (row) relink.run(row.ma_sv, l.id);
      else { lock.run(l.id); kill.run(l.id); }
    }
    return {
      students: d.students.length, terms: d.terms.length, subjects: d.subjects.length, classes: d.classes.length,
      profiles: (d.profiles || []).length, families: (d.families || []).length, drl: (d.drl || []).length,
    };
  });
}

/** Dữ liệu mẫu cố định (không ngẫu nhiên giữa các lần nạp). */
function demoData() {
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const R = rng(20241029);
  const r1 = (x) => Math.round(x * 10) / 10;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const classes = [
    { ma: 'CNTT1', khoa: 'Công nghệ thông tin' }, { ma: 'CNTT2', khoa: 'Công nghệ thông tin' }, { ma: 'HTTT1', khoa: 'Hệ thống thông tin' },
  ];
  const terms = [
    { id: 't1', ten: 'Học kỳ 1', nam: '2024-2025' }, { id: 't2', ten: 'Học kỳ 2', nam: '2024-2025' }, { id: 't3', ten: 'Học kỳ 1', nam: '2025-2026' },
  ];
  const subjects = [
    { id: 'm1', ten: 'Lập trình C++', tc: 3, termId: 't1' }, { id: 'm2', ten: 'Toán cao cấp A1', tc: 3, termId: 't1' },
    { id: 'm3', ten: 'Anh văn 1', tc: 2, termId: 't1' }, { id: 'm4', ten: 'Cơ sở dữ liệu', tc: 3, termId: 't2' },
    { id: 'm5', ten: 'Lập trình Java', tc: 3, termId: 't2' }, { id: 'm6', ten: 'Toán rời rạc', tc: 3, termId: 't2' },
    { id: 'm7', ten: 'Mạng máy tính', tc: 3, termId: 't3' }, { id: 'm8', ten: 'Hệ điều hành', tc: 3, termId: 't3' },
    { id: 'm9', ten: 'Phân tích thiết kế HTTT', tc: 3, termId: 't3' },
  ];
  const rows = [
    ['SV001', 'Nguyễn Văn An', 'Nam', 'CNTT1', 'an.nv@mail.vn', '0901234001'], ['SV002', 'Trần Thị Bình', 'Nữ', 'CNTT1', 'binh.tt@mail.vn', '0901234002'],
    ['SV003', 'Lê Văn Cường', 'Nam', 'CNTT1', 'cuong.lv@mail.vn', '0901234003'], ['SV004', 'Phạm Thu Dung', 'Nữ', 'CNTT2', 'dung.pt@mail.vn', '0901234004'],
    ['SV005', 'Hoàng Văn Em', 'Nam', 'CNTT2', 'em.hv@mail.vn', '0901234005'], ['SV006', 'Vũ Thị Phượng', 'Nữ', 'CNTT2', 'phuong.vt@mail.vn', '0901234006'],
    ['SV007', 'Đặng Văn Giang', 'Nam', 'HTTT1', 'giang.dv@mail.vn', '0901234007'], ['SV008', 'Bùi Thị Hương', 'Nữ', 'HTTT1', 'huong.bt@mail.vn', '0901234008'],
    ['SV009', 'Đỗ Văn Khánh', 'Nam', 'HTTT1', 'khanh.dv@mail.vn', '0901234009'], ['SV010', 'Ngô Thị Lan', 'Nữ', 'CNTT1', 'lan.nt@mail.vn', '0901234010'],
    ['SV011', 'Dương Văn Minh', 'Nam', 'CNTT2', 'minh.dv@mail.vn', '0901234011'], ['SV012', 'Lý Thị Nga', 'Nữ', 'HTTT1', 'nga.lt@mail.vn', '0901234012'],
  ];
  const students = rows.map((r) => {
    const base = 5.6 + R() * 3;
    const diem = [];
    for (let j = 1; j <= 6; j++) diem.push({ subjId: 'm' + j, qt: r1(clamp(base + (R() - 0.5) * 2, 3, 10)), thi: r1(clamp(base + (R() - 0.5) * 3, 3, 10)) });
    return { maSV: r[0], hoTen: r[1], gioiTinh: r[2], lop: r[3], email: r[4], sdt: r[5], diem };
  });

  // Hồ sơ, thân nhân và phiếu ĐRL mẫu. Số CCCD bắt đầu bằng 0000 (không phải mã tỉnh thật) để không trùng người thật.
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const tenBo = ['Hùng', 'Dũng', 'Tuấn', 'Thắng', 'Long', 'Sơn'], tenMe = ['Hoa', 'Lan', 'Mai', 'Hằng', 'Thu', 'Yến'];
  const profiles = students.map((s, i) => ({
    maSV: s.maSV, ngaySinh: (2004 + (i % 2)) + '-' + pad(1 + ((i * 5) % 12)) + '-' + pad(1 + ((i * 7) % 28)),
    noiSinh: 'Hải Phòng', queQuan: 'Hải Phòng', diaChi: 'Số ' + (10 + i) + ' phố Mẫu, TP. Hải Phòng', cccd: '0000' + pad(i + 1, 8),
    danToc: 'Kinh', tonGiao: 'Không', dienChinhSach: i === 3 ? 'Con thương binh' : i === 8 ? 'Hộ cận nghèo' : '',
    trangThai: i === 10 ? 'Bảo lưu' : 'Đang học', ngayNhapHoc: '2024-09-05',
  }));
  const families = [];
  students.forEach((s, i) => {
    const ho = s.hoTen.split(' ')[0];
    families.push({ maSV: s.maSV, quanHe: 'Bố', hoTen: ho + ' Văn ' + tenBo[i % 6], namSinh: 1972 + (i % 6), ngheNghiep: 'Công nhân', sdt: '0912345' + pad(i * 2, 3), khanCap: i % 2 === 1 });
    families.push({ maSV: s.maSV, quanHe: 'Mẹ', hoTen: 'Nguyễn Thị ' + tenMe[i % 6], namSinh: 1975 + (i % 5), ngheNghiep: 'Buôn bán', sdt: '0912345' + pad(i * 2 + 1, 3), khanCap: i % 2 === 0 });
  });
  const tt16 = FRAMEWORKS[0];
  const pick = (base) => Object.fromEntries(tt16.criteria.map((c) => [c.ma, clamp(Math.round(c.max * (base + (R() - 0.5) * 0.2)), 0, c.max)]));
  const drl = [];
  students.forEach((s, i) => {
    const base = 0.6 + R() * 0.35;
    // Các học kỳ đã qua: phiếu đều đã được khoa duyệt
    for (const termId of ['t1', 't2']) drl.push({ maSV: s.maSV, termId, frameworkId: tt16.id, ghiChu: '', items: { sv: pick(base), lop: pick(base), khoa: pick(base) } });
    // Học kỳ hiện tại: đủ các trạng thái để dùng thử quy trình; sinh viên bảo lưu không có phiếu
    if (profiles[i].trangThai !== 'Đang học') return;
    const items = { sv: pick(base) };
    if (i % 4 >= 1) items.lop = pick(base);
    if (i % 4 >= 2) items.khoa = pick(base);
    drl.push({ maSV: s.maSV, termId: 't3', frameworkId: tt16.id, ghiChu: '', items });
  });
  return { students, terms, subjects, classes, profiles, families, drl };
}

module.exports = {
  PROFILE_STATUS, open, tx, readAll, sanitizeImport, importAll, demoData,
  readProfile, saveProfile, saveFamily, readFrameworks, readDrl, saveDrlLevel, refreshEvaluation, readBackup,
};
