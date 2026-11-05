'use strict';
// Quy tắc điểm rèn luyện (ĐRL). Không phụ thuộc CSDL để kiểm thử đơn vị được.

// Trạng thái phiếu: SV tự đánh giá → lớp (CVHT) đánh giá → khoa duyệt.
const ST = { CHO_LOP: 'Chờ lớp đánh giá', CHO_KHOA: 'Chờ khoa duyệt', DA_DUYET: 'Đã duyệt' };

// Khung đánh giá có sẵn. Quản trị chọn khung đang dùng; phiếu đã tạo giữ nguyên khung của nó.
// cachTinh: 'khoa' = điểm cuối là điểm khoa duyệt; 'tb_lop_khoa' = trung bình điểm lớp và khoa, làm tròn.
// nguong: xếp loại theo điểm cuối, xét từ trên xuống, lấy mức đầu tiên có điểm >= min.
const FRAMEWORKS = [
  {
    id: 'tt16',
    ten: 'Thông tư 16/2015/TT-BGDĐT',
    canCu: 'Thông tư 16/2015/TT-BGDĐT, Điều 4–9',
    cachTinh: 'khoa',
    nguong: [
      { min: 90, ten: 'Xuất sắc' }, { min: 80, ten: 'Tốt' }, { min: 65, ten: 'Khá' },
      { min: 50, ten: 'Trung bình' }, { min: 35, ten: 'Yếu' }, { min: 0, ten: 'Kém' },
    ],
    criteria: [
      { ma: 'TC1', ten: 'Ý thức tham gia học tập', max: 20 },
      { ma: 'TC2', ten: 'Ý thức chấp hành nội quy, quy chế, quy định trong nhà trường', max: 25 },
      { ma: 'TC3', ten: 'Ý thức tham gia hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm và tệ nạn xã hội', max: 20 },
      { ma: 'TC4', ten: 'Ý thức công dân trong quan hệ cộng đồng', max: 25 },
      { ma: 'TC5', ten: 'Ý thức, kết quả tham gia công tác cán bộ lớp, đoàn thể hoặc thành tích đặc biệt', max: 10 },
    ],
  },
  {
    id: 'nhom',
    ten: 'Khung đề xuất của nhóm (5 tiêu chí × 20 điểm)',
    canCu: 'Đề xuất của nhóm, chưa đối chiếu được với văn bản của trường',
    cachTinh: 'tb_lop_khoa',
    nguong: [
      { min: 90, ten: 'Xuất sắc' }, { min: 80, ten: 'Giỏi' }, { min: 65, ten: 'Khá' },
      { min: 50, ten: 'Trung bình' }, { min: 0, ten: 'Yếu' },
    ],
    criteria: [
      { ma: 'TC1', ten: 'Ý thức học tập', max: 20 },
      { ma: 'TC2', ten: 'Hoạt động tập thể', max: 20 },
      { ma: 'TC3', ten: 'Đạo đức lối sống', max: 20 },
      { ma: 'TC4', ten: 'Kỷ luật nhà trường', max: 20 },
      { ma: 'TC5', ten: 'Phong trào Đoàn – Hội', max: 20 },
    ],
  },
];

function classify(nguong, score) {
  if (score == null) return '';
  for (const n of nguong) if (score >= n.min) return n.ten;
  return nguong[nguong.length - 1].ten;
}

function finalScore(cachTinh, lop, khoa) {
  return cachTinh === 'khoa' ? khoa : Math.round((lop + khoa) / 2);
}

/** Kiểm tra điểm từng tiêu chí của một cấp đánh giá. Ném RangeError nếu sai. */
function sumItems(items, criteria) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) throw new RangeError('Thiếu điểm các tiêu chí.');
  const known = new Set(criteria.map((c) => c.ma));
  for (const k of Object.keys(items)) if (!known.has(k)) throw new RangeError('Tiêu chí "' + k + '" không thuộc khung đánh giá.');
  const rows = [];
  let total = 0;
  for (const c of criteria) {
    const v = items[c.ma];
    if (!Number.isInteger(v) || v < 0 || v > c.max) throw new RangeError(c.ma + ': điểm phải là số nguyên từ 0 đến ' + c.max + '.');
    rows.push([c.ma, v]);
    total += v;
  }
  return { rows, total };
}

/** Tính tổng từng cấp, trạng thái, điểm cuối và xếp loại từ điểm chi tiết. items = { sv, lop, khoa } (cấp nào chưa có thì bỏ trống). */
function evalSummary(fw, items) {
  const total = (cap) => (items[cap] && Object.keys(items[cap]).length ? Object.values(items[cap]).reduce((a, b) => a + b, 0) : null);
  const diemSV = total('sv');
  const diemLop = total('lop');
  const diemKhoa = diemLop == null ? null : total('khoa');
  const diemCuoi = diemKhoa == null ? null : finalScore(fw.cachTinh, diemLop, diemKhoa);
  const trangThai = diemKhoa != null ? ST.DA_DUYET : diemLop != null ? ST.CHO_KHOA : ST.CHO_LOP;
  return { diemSV, diemLop, diemKhoa, diemCuoi, xepLoai: classify(fw.nguong, diemCuoi), trangThai };
}

module.exports = { ST, FRAMEWORKS, classify, finalScore, sumItems, evalSummary };
