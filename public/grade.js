/* Quy tắc điểm học tập (BR-11, BR-12) dạng hàm thuần, dùng chung cho trình duyệt (app.js) và kiểm thử (test/grade.unit.test.js).
   Điểm tổng kết học phần = 0,4 × điểm quá trình + 0,6 × điểm thi; học phần đạt khi điểm tổng kết từ 4,0;
   điểm trung bình = Σ(điểm tổng kết × tín chỉ) / Σ tín chỉ. Hệ số và mốc quy đổi chờ đối chiếu quy chế đào tạo ĐHHP (Q4, Q5). */
(function (root) {
  'use strict';
  function r2(x) { return Math.round(x * 100) / 100; }
  function tk(d) { return d.qt * 0.4 + d.thi * 0.6; }
  function pts4(x) { x = r2(x); if (x >= 8.5) return 4; if (x >= 8) return 3.5; if (x >= 7) return 3; if (x >= 6.5) return 2.5; if (x >= 5.5) return 2; if (x >= 5) return 1.5; if (x >= 4) return 1; return 0; }
  /* Điểm chữ dùng cùng mốc với quy đổi thang 4 ở trên */
  function letter(x) { x = r2(x); if (x >= 8.5) return 'A'; if (x >= 8) return 'B+'; if (x >= 7) return 'B'; if (x >= 6.5) return 'C+'; if (x >= 5.5) return 'C'; if (x >= 5) return 'D+'; if (x >= 4) return 'D'; return 'F'; }
  function diemOf(sv, subjId) { return (sv.diem || []).find(function (d) { return d.subjId === subjId; }); }
  /* Tổng hợp điểm của một sinh viên trên danh sách học phần (mỗi học phần có id, tc). */
  function agg(sv, list) {
    var s10 = 0, s4 = 0, tc = 0, pass = 0, n = 0;
    list.forEach(function (m) { var d = diemOf(sv, m.id); if (d) { var t = tk(d); s10 += t * m.tc; s4 += pts4(t) * m.tc; tc += m.tc; n++; if (t >= 4) pass += m.tc; } });
    return { n: n, tc: tc, pass: pass, avg10: tc ? r2(s10 / tc) : null, avg4: tc ? r2(s4 / tc) : null };
  }
  var api = { r2: r2, tk: tk, pts4: pts4, letter: letter, diemOf: diemOf, agg: agg };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Grade = api;
})(this);
