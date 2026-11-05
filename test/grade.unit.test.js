'use strict';
// Kiểm thử đơn vị cho quy tắc điểm học tập ở public/grade.js (BR-11, BR-12); không cần máy chủ, không cần CSDL.
const test = require('node:test');
const assert = require('node:assert/strict');
const { tk, pts4, letter, agg } = require('../public/grade');

test('điểm tổng kết = 0,4 × quá trình + 0,6 × thi', () => {
  assert.equal(tk({ qt: 10, thi: 10 }), 10);
  assert.equal(tk({ qt: 0, thi: 0 }), 0);
  assert.equal(Math.round(tk({ qt: 7, thi: 8 }) * 100) / 100, 7.6);
});

test('điểm chữ và thang 4 tại các giá trị biên', () => {
  const cases = [[10, 'A', 4], [8.5, 'A', 4], [8.49, 'B+', 3.5], [8, 'B+', 3.5], [7, 'B', 3], [6.5, 'C+', 2.5],
    [5.5, 'C', 2], [5, 'D+', 1.5], [4, 'D', 1], [3.99, 'F', 0], [0, 'F', 0]];
  for (const [x, l, p] of cases) {
    assert.equal(letter(x), l, `letter(${x})`);
    assert.equal(pts4(x), p, `pts4(${x})`);
  }
});

test('làm tròn hai chữ số trước khi quy đổi (7,995 được tính là 8,00)', () => {
  assert.equal(letter(7.995), 'B+');
  assert.equal(pts4(7.995), 3.5);
});

test('điểm trung bình có trọng số tín chỉ, tín chỉ đạt chỉ tính học phần từ 4,0', () => {
  const subjects = [{ id: 'A', tc: 3 }, { id: 'B', tc: 2 }, { id: 'C', tc: 4 }];
  const sv = { diem: [{ subjId: 'A', qt: 8, thi: 9 }, { subjId: 'B', qt: 2, thi: 3 }] }; // C chưa có điểm
  const r = agg(sv, subjects);
  // A: 8,6 × 3; B: 2,6 × 2  → (25,8 + 5,2) / 5 = 6,2
  assert.equal(r.n, 2);
  assert.equal(r.tc, 5);
  assert.equal(r.pass, 3);
  assert.equal(r.avg10, 6.2);
  assert.equal(r.avg4, Math.round((4 * 3 + 0 * 2) / 5 * 100) / 100);
});

test('sinh viên chưa có điểm nào thì điểm trung bình là null', () => {
  const r = agg({ diem: [] }, [{ id: 'A', tc: 3 }]);
  assert.equal(r.avg10, null);
  assert.equal(r.avg4, null);
  assert.equal(r.tc, 0);
});
