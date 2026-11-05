'use strict';
// Kiểm thử đơn vị cho quy tắc điểm rèn luyện (không cần máy chủ, không cần CSDL).
const test = require('node:test');
const assert = require('node:assert/strict');
const { ST, FRAMEWORKS, classify, finalScore, sumItems, evalSummary } = require('../drl');

const TT16 = FRAMEWORKS.find((f) => f.id === 'tt16');
const NHOM = FRAMEWORKS.find((f) => f.id === 'nhom');

test('mỗi khung có 5 tiêu chí, mã không trùng, tổng điểm tối đa 100', () => {
  for (const f of FRAMEWORKS) {
    assert.equal(f.criteria.length, 5, f.id);
    assert.equal(new Set(f.criteria.map((c) => c.ma)).size, 5, f.id);
    assert.equal(f.criteria.reduce((a, c) => a + c.max, 0), 100, f.id);
  }
  assert.deepEqual(TT16.criteria.map((c) => c.max), [20, 25, 20, 25, 10]);
});

test('xếp loại theo khung TT16 tại các giá trị biên', () => {
  const cases = [[100, 'Xuất sắc'], [90, 'Xuất sắc'], [89, 'Tốt'], [80, 'Tốt'], [79, 'Khá'], [65, 'Khá'], [64, 'Trung bình'],
    [50, 'Trung bình'], [49, 'Yếu'], [35, 'Yếu'], [34, 'Kém'], [0, 'Kém']];
  for (const [d, xl] of cases) assert.equal(classify(TT16.nguong, d), xl, 'điểm ' + d);
  assert.equal(classify(TT16.nguong, null), '');
});

test('xếp loại theo khung đề xuất của nhóm tại các giá trị biên', () => {
  const cases = [[90, 'Xuất sắc'], [89, 'Giỏi'], [80, 'Giỏi'], [79, 'Khá'], [65, 'Khá'], [64, 'Trung bình'], [50, 'Trung bình'], [49, 'Yếu'], [0, 'Yếu']];
  for (const [d, xl] of cases) assert.equal(classify(NHOM.nguong, d), xl, 'điểm ' + d);
});

test('điểm cuối: lấy điểm khoa, hoặc trung bình lớp và khoa làm tròn', () => {
  assert.equal(finalScore('khoa', 90, 85), 85);
  assert.equal(finalScore('tb_lop_khoa', 81, 84), 83); // 82,5 làm tròn lên
  assert.equal(finalScore('tb_lop_khoa', 80, 81), 81);
  assert.equal(finalScore('tb_lop_khoa', 80, 80), 80);
});

test('kiểm tra điểm từng tiêu chí: đủ tiêu chí, số nguyên, trong khoảng cho phép', () => {
  const ok = { TC1: 20, TC2: 25, TC3: 0, TC4: 10, TC5: 5 };
  assert.equal(sumItems(ok, TT16.criteria).total, 60);
  assert.throws(() => sumItems({ ...ok, TC2: 26 }, TT16.criteria), RangeError);
  assert.throws(() => sumItems({ ...ok, TC1: -1 }, TT16.criteria), RangeError);
  assert.throws(() => sumItems({ ...ok, TC1: 19.5 }, TT16.criteria), RangeError);
  assert.throws(() => sumItems({ ...ok, TC1: '20' }, TT16.criteria), RangeError);
  assert.throws(() => sumItems({ TC1: 20, TC2: 25, TC3: 0, TC4: 10 }, TT16.criteria), RangeError);
  assert.throws(() => sumItems({ ...ok, TC9: 1 }, TT16.criteria), RangeError);
  assert.throws(() => sumItems([1, 2, 3, 4, 5], TT16.criteria), RangeError);
  assert.throws(() => sumItems({ ...ok, TC2: 21 }, NHOM.criteria), RangeError); // khung nhóm tối đa 20
});

test('trạng thái phiếu đi theo các cấp đã chấm', () => {
  const sv = { TC1: 15, TC2: 20, TC3: 15, TC4: 20, TC5: 5 }; // 75
  const lop = { TC1: 18, TC2: 22, TC3: 16, TC4: 21, TC5: 8 }; // 85
  const khoa = { TC1: 18, TC2: 23, TC3: 17, TC4: 24, TC5: 9 }; // 91
  assert.equal(evalSummary(TT16, { sv }).trangThai, ST.CHO_LOP);
  assert.equal(evalSummary(TT16, { sv, lop }).trangThai, ST.CHO_KHOA);
  const ignored = evalSummary(TT16, { sv, khoa }); // khoa chấm khi lớp chưa chấm thì không tính
  assert.equal(ignored.trangThai, ST.CHO_LOP);
  assert.equal(ignored.diemKhoa, null);
  const s = evalSummary(TT16, { sv, lop, khoa });
  assert.deepEqual(s, { diemSV: 75, diemLop: 85, diemKhoa: 91, diemCuoi: 91, xepLoai: 'Xuất sắc', trangThai: ST.DA_DUYET });
  assert.equal(evalSummary(NHOM, { lop: { TC1: 17, TC2: 16, TC3: 16, TC4: 16, TC5: 16 }, khoa: { TC1: 17, TC2: 17, TC3: 17, TC4: 17, TC5: 16 } }).diemCuoi, 83);
});
