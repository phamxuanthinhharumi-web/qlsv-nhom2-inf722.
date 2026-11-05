/* Quản lý sinh viên - giao diện. Dữ liệu và đăng nhập do máy chủ (server.js) quản lý. */
(function(){
"use strict";
var PAGE_SIZE=10;

/* ---------- Trạng thái & gọi API ---------- */
var state={view:"dashboard",me:null,users:[],students:[],terms:[],subjects:[],classes:[],
  search:"",filterClass:"all",sortKey:"maSV",sortDir:1,page:1,
  showForm:false,editingId:null,scoreStudentId:"",
  showTermForm:false,editingTermId:null,editingSubjId:null,busy:false,pwForced:false,
  profileId:"",profile:null,family:[],requests:[],
  frameworks:[],drlTerm:"",drlClass:"all",drlList:[],drlOpen:"",
  reviewTerm:"",reviewList:[],reviewGpa:8,reviewDrl:80,reviewActive:true};

function ApiError(status,message){this.status=status;this.message=message;}
ApiError.prototype=Object.create(Error.prototype);

async function api(method,url,body){
  var opt={method:method,headers:{"X-Requested-With":"fetch"},credentials:"same-origin"};
  if(body!==undefined){opt.headers["Content-Type"]="application/json";opt.body=JSON.stringify(body);}
  var r;
  try{r=await fetch(url,opt);}catch(e){throw new ApiError(0,"Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.");}
  var data=null;
  try{data=await r.json();}catch(e){}
  if(!r.ok){
    if(r.status===401&&url!=="/api/login"&&url!=="/api/me")showLogin("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    if(r.status===403&&data&&data.code==="must_change")showPw(true);
    throw new ApiError(r.status,(data&&data.error)||("Có lỗi xảy ra ("+r.status+")."));
  }
  return data;
}
async function refresh(){
  var d=await api("GET","/api/data");
  state.students=d.students;state.terms=d.terms;state.subjects=d.subjects;state.classes=d.classes;
}
/* Chạy một thao tác ghi: gọi API, nạp lại dữ liệu, vẽ lại màn hình. Trả về true nếu thành công. */
async function mutate(fn,okMsg,after){
  if(state.busy)return false;
  state.busy=true;
  try{
    var res=await fn();
    await refresh();
    if(after)after(res);else render();
    if(okMsg)toast(okMsg);
    return true;
  }catch(err){
    if(!err||err.status!==401)toast((err&&err.message)||"Có lỗi xảy ra.",true);
    return false;
  }finally{state.busy=false;}
}

/* ---------- Tiện ích ---------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
var r2=Grade.r2;
function fmt(d){return d==null?"—":r2(d).toFixed(2);}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}


/* ---------- Tính điểm ---------- */
/* Quy tắc tính điểm nằm ở grade.js (hàm thuần, có kiểm thử đơn vị) */
var tk=Grade.tk,pts4=Grade.pts4,letter=Grade.letter,diemOf=Grade.diemOf,agg=Grade.agg;
function subjectsOf(termId){return state.subjects.filter(function(m){return m.termId===termId;});}
function aggTerm(sv,termId){return agg(sv,subjectsOf(termId));}
function aggCum(sv,idx){var m=[];for(var i=0;i<=idx&&i<state.terms.length;i++)m=m.concat(subjectsOf(state.terms[i].id));return agg(sv,m);}
function aggAll(sv){return agg(sv,state.subjects);}
function gpa(sv){return aggAll(sv).avg10;}
function xeploai(d){
  if(d==null)return {t:"Chưa có",c:"#64748b",bg:"rgba(100,116,139,.12)"};
  if(d>=9)return {t:"Xuất sắc",c:"#0f766e",bg:"rgba(15,118,110,.14)"};
  if(d>=8)return {t:"Giỏi",c:"#297a2e",bg:"rgba(41,122,46,.14)"};
  if(d>=7)return {t:"Khá",c:"#d97706",bg:"rgba(217,119,6,.14)"};
  if(d>=5)return {t:"Trung bình",c:"#2563eb",bg:"rgba(37,99,235,.12)"};
  return {t:"Yếu",c:"#dc2626",bg:"rgba(220,38,38,.12)"};
}
function pill(d){var x=xeploai(d);return '<span class="pill" style="color:'+x.c+';background:'+x.bg+'">'+x.t+'</span>';}

/* ---------- UI chung ---------- */
var content=document.getElementById("content");
function toast(msg,isErr){
  var box=document.getElementById("toastBox"),el=document.createElement("div");
  el.className="toast"+(isErr?" err":"");el.textContent=msg;box.appendChild(el);
  setTimeout(function(){el.style.transition="opacity .4s";el.style.opacity="0";setTimeout(function(){el.remove();},400);},isErr?3500:2000);
}
function confirmBox(title,msg,okText,noCancel){
  return new Promise(function(resolve){
    var m=document.getElementById("modal"),ok=document.getElementById("mOk"),no=document.getElementById("mCancel"),last=document.activeElement;
    document.getElementById("mTitle").textContent=title;document.getElementById("mMsg").textContent=msg;ok.textContent=okText||"Xác nhận";no.hidden=!!noCancel;
    m.hidden=false;(noCancel?ok:no).focus();
    function done(v){m.hidden=true;ok.onclick=no.onclick=null;document.removeEventListener("keydown",key);m.onclick=null;if(last&&last.focus)try{last.focus();}catch(e){}resolve(v);}
    function key(e){if(e.key==="Escape")done(false);}
    ok.onclick=function(){done(true);};no.onclick=function(){done(false);};
    m.onclick=function(e){if(e.target===m)done(false);};
    document.addEventListener("keydown",key);
  });
}
function header(title,sub,actions){return '<div class="page-head fade-in"><div><h1>'+esc(title)+'</h1><p class="sub">'+sub+'</p></div>'+(actions?'<div class="no-print">'+actions+'</div>':'')+'</div>';}
function emptyState(icon,title,text,acts){return '<div class="card empty"><i class="'+icon+'"></i><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p>'+(acts?'<div class="acts">'+acts+'</div>':'')+'</div>';}
function classOptions(sel,withAll){
  var o=withAll?'<option value="all">Tất cả lớp</option>':'';
  return o+state.classes.map(function(c){return '<option value="'+esc(c.ma)+'"'+(sel===c.ma?' selected':'')+'>'+esc(c.ma)+'</option>';}).join("");
}
var charts=[];
function destroyCharts(){charts.forEach(function(c){try{c.destroy();}catch(e){}});charts=[];}
function download(name,text,mime){
  var blob=new Blob([text],{type:mime}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
}
function today(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}

/* ---------- Tổng quan ---------- */
function renderDashboard(){
  destroyCharts();
  var svs=state.students,withG=svs.filter(function(s){return gpa(s)!==null;});
  var avg=withG.length?r2(withG.reduce(function(a,s){return a+gpa(s);},0)/withG.length):null;
  var gioi=withG.filter(function(s){return gpa(s)>=8;}).length;
  var last=state.terms[state.terms.length-1];
  var h=header("Tổng quan hệ thống",state.terms.length+" học kỳ · "+state.subjects.length+" môn học · GPA tính theo trọng số tín chỉ",last?'<span class="pill pill-accent">Năm học '+esc(last.nam)+'</span>':'');
  if(!svs.length){
    content.innerHTML=h+emptyState("ri-user-add-line","Chưa có sinh viên nào","Hãy thêm sinh viên đầu tiên hoặc nạp dữ liệu mẫu để xem thử.",'<button class="btn btn-primary" data-act="goto-add"><i class="ri-add-line"></i> Thêm sinh viên</button>'+(state.me.role==="admin"?'<button class="btn btn-secondary" data-act="demo"><i class="ri-magic-line"></i> Nạp dữ liệu mẫu</button>':''));
    return;
  }
  var nam=svs.filter(function(s){return s.gioiTinh==="Nam";}).length,nu=svs.length-nam;
  var metrics=[
    {i:"ri-user-3-fill",l:"Tổng sinh viên",v:svs.length,s:state.classes.length+" lớp học",c:"var(--accent)"},
    {i:"ri-calendar-2-fill",l:"Số học kỳ",v:state.terms.length,s:state.subjects.length+" môn học",c:"var(--blue)"},
    {i:"ri-star-fill",l:"GPA trung bình",v:fmt(avg),s:"thang điểm 10",c:"var(--accent2)"},
    {i:"ri-trophy-fill",l:"Sinh viên giỏi",v:gioi,s:"GPA ≥ 8.0",c:"var(--accent)"}];
  h+='<div class="grid">'+metrics.map(function(m){return '<div class="metric"><div class="mh"><div class="mi" style="color:'+m.c+'"><i class="'+m.i+'"></i></div><span class="ml">'+m.l+'</span></div><div class="mv">'+m.v+'</div><div class="ms">'+m.s+'</div></div>';}).join("")+'</div>';
  h+='<div class="grid"><div class="card" style="flex:2 1 340px;margin:0"><h3 style="margin-bottom:10px">Sĩ số &amp; GPA trung bình theo lớp</h3><div class="chart-box"><canvas id="chartBar" role="img" aria-label="Biểu đồ sĩ số và GPA theo lớp"></canvas></div></div>'
    +'<div class="card" style="flex:1 1 220px;margin:0"><h3 style="margin-bottom:10px">Tỷ lệ giới tính</h3><div class="chart-box"><canvas id="chartPie" role="img" aria-label="Biểu đồ tỷ lệ giới tính"></canvas></div></div></div>';
  var top=withG.slice().sort(function(a,b){return gpa(b)-gpa(a);}).slice(0,5);
  h+='<div class="card"><h2>Top 5 sinh viên GPA cao nhất</h2><p class="sub" style="margin-bottom:14px">Xếp theo điểm trung bình tích lũy (trọng số tín chỉ)</p><div class="tbl-wrap"><table style="min-width:560px"><thead><tr><th>Hạng</th><th>Sinh viên</th><th>Lớp</th><th class="r">Tín chỉ đạt</th><th class="r">GPA</th><th class="r">Xếp loại</th></tr></thead><tbody>'
    +(top.length?top.map(function(s,i){return '<tr class="tbl-row"><td style="font-weight:800;color:var(--accent2)">'+(i+1)+'</td><td style="font-weight:600">'+esc(s.hoTen)+' <span style="color:var(--muted);font-weight:400;font-size:12px">('+esc(s.maSV)+')</span></td><td>'+esc(s.lop)+'</td><td class="r num">'+aggAll(s).pass+'</td><td class="r num" style="font-weight:800;color:var(--accent)">'+fmt(gpa(s))+'</td><td class="r">'+pill(gpa(s))+'</td></tr>';}).join(""):'<tr><td colspan="6" class="c" style="color:var(--muted);padding:24px">Chưa có sinh viên nào được nhập điểm.</td></tr>')
    +'</tbody></table></div></div>';
  content.innerHTML=h;
  var labels=[],counts=[],avgs=[];
  state.classes.forEach(function(c){
    var mem=svs.filter(function(s){return s.lop===c.ma;});if(!mem.length)return;
    var g=mem.map(gpa).filter(function(x){return x!==null;});
    labels.push(c.ma);counts.push(mem.length);avgs.push(g.length?r2(g.reduce(function(a,b){return a+b;},0)/g.length):0);
  });
  (function init(n){
    var cb=document.getElementById("chartBar"),cp=document.getElementById("chartPie");
    if(!cb||!cp)return;
    if(typeof Chart==="undefined"){
      if(n<25){setTimeout(function(){init(n+1);},200);}
      else{[cb,cp].forEach(function(c){c.parentNode.innerHTML='<p class="sub c" style="padding:30px">Không tải được thư viện biểu đồ. Kiểm tra kết nối mạng.</p>';});}
      return;
    }
    charts.push(new Chart(cb,{type:"bar",data:{labels:labels,datasets:[{label:"Sĩ số",data:counts,backgroundColor:"rgba(41,122,46,.75)",borderRadius:6,yAxisID:"y"},{label:"GPA TB",data:avgs,type:"line",borderColor:"#d97706",backgroundColor:"#d97706",tension:.35,yAxisID:"y1",pointRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}},scales:{y:{beginAtZero:true,ticks:{precision:0},grid:{color:"rgba(15,23,42,.06)"}},y1:{position:"right",beginAtZero:true,max:10,grid:{display:false}},x:{grid:{display:false}}}}}));
    charts.push(new Chart(cp,{type:"doughnut",data:{labels:["Nam","Nữ"],datasets:[{data:[nam,nu],backgroundColor:["#2563eb","#d97706"],borderWidth:2,borderColor:"#fff"}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:"62%",plugins:{legend:{position:"bottom"}}}}));
  })(0);
}

/* ---------- Sinh viên ---------- */
function filteredStudents(){
  var kw=state.search.toLowerCase().trim();
  var list=state.students.filter(function(s){
    return (state.filterClass==="all"||s.lop===state.filterClass)&&(!kw||s.hoTen.toLowerCase().indexOf(kw)>=0||s.maSV.toLowerCase().indexOf(kw)>=0||s.email.toLowerCase().indexOf(kw)>=0);
  });
  var k=state.sortKey,d=state.sortDir;
  list.sort(function(a,b){
    var x,y;
    if(k==="gpa"){x=gpa(a);y=gpa(b);x=x==null?-1:x;y=y==null?-1:y;return (x-y)*d;}
    x=String(a[k]||"");y=String(b[k]||"");return x.localeCompare(y,"vi",{numeric:true})*d;
  });
  return list;
}
function th(key,label,cls){
  var ar=state.sortKey===key?(state.sortDir===1?" ▲":" ▼"):"";
  return '<th class="'+(cls||"")+'" aria-sort="'+(state.sortKey===key?(state.sortDir===1?"ascending":"descending"):"none")+'"><button class="sort-btn" data-sort="'+key+'">'+label+ar+'</button></th>';
}
function studentTable(){
  var list=filteredStudents(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  if(state.page>pages)state.page=pages;
  var from=(state.page-1)*PAGE_SIZE,slice=list.slice(from,from+PAGE_SIZE);
  var h='<div class="tbl-wrap"><table style="min-width:820px"><thead><tr>'+th("maSV","Mã SV")+th("hoTen","Họ tên")+th("gioiTinh","Giới tính")+th("lop","Lớp")+th("trangThai","Trạng thái")+'<th>Email</th><th class="r">Tín chỉ đạt</th>'+th("gpa","GPA","r")+'<th class="r no-print">Thao tác</th></tr></thead><tbody>';
  if(!slice.length)h+='<tr><td colspan="9" class="c" style="padding:30px;color:var(--muted)">Không tìm thấy sinh viên nào.</td></tr>';
  slice.forEach(function(s){
    var g=gpa(s),nm=s.gioiTinh==="Nam";
    h+='<tr class="tbl-row"><td style="font-weight:700;color:var(--accent)">'+esc(s.maSV)+'</td><td style="font-weight:600">'+esc(s.hoTen)+'</td>'
      +'<td><span class="pill" style="color:'+(nm?"#2563eb":"#d97706")+';background:'+(nm?"rgba(37,99,235,.12)":"rgba(217,119,6,.14)")+'">'+esc(s.gioiTinh)+'</span></td>'
      +'<td>'+esc(s.lop)+'</td><td>'+statusPill(s.trangThai)+'</td><td style="color:var(--muted);font-size:13px">'+esc(s.email)+'</td><td class="r num">'+aggAll(s).pass+'</td>'
      +'<td class="r num" style="font-weight:800;color:var(--accent)">'+fmt(g)+' '+pill(g)+'</td>'
      +'<td class="r no-print" style="white-space:nowrap"><button class="btn btn-edit" data-profile="'+esc(s.maSV)+'" title="Xem hồ sơ" aria-label="Hồ sơ '+esc(s.hoTen)+'"><i class="ri-profile-line"></i></button><button class="btn btn-edit" data-score="'+esc(s.maSV)+'" title="Xem bảng điểm"><i class="ri-file-list-3-line"></i></button><button class="btn btn-edit" data-edit="'+esc(s.maSV)+'" aria-label="Sửa '+esc(s.hoTen)+'"><i class="ri-edit-line"></i> Sửa</button><button class="btn btn-danger" data-del="'+esc(s.maSV)+'" aria-label="Xóa '+esc(s.hoTen)+'"><i class="ri-delete-bin-line"></i> Xóa</button></td></tr>';
  });
  h+='</tbody></table></div>';
  var info=list.length?('Hiển thị '+(from+1)+'–'+(from+slice.length)+' / '+list.length):'0 kết quả';
  h+='<div class="pager no-print"><span>'+info+'</span><div class="pg"><button data-page="'+(state.page-1)+'"'+(state.page<=1?' disabled':'')+' aria-label="Trang trước"><i class="ri-arrow-left-s-line"></i></button>';
  for(var p=1;p<=pages;p++){if(pages>7&&p!==1&&p!==pages&&Math.abs(p-state.page)>1){if(p===2||p===pages-1)h+='<button disabled>…</button>';continue;}h+='<button data-page="'+p+'" class="'+(p===state.page?'on':'')+'">'+p+'</button>';}
  h+='<button data-page="'+(state.page+1)+'"'+(state.page>=pages?' disabled':'')+' aria-label="Trang sau"><i class="ri-arrow-right-s-line"></i></button></div></div>';
  return h;
}
function studentForm(){
  var s=state.editingId?state.students.find(function(x){return x.maSV===state.editingId;}):null;
  if(!state.classes.length)return '<div class="form-panel warm"><p>Bạn cần tạo ít nhất một lớp trước khi thêm sinh viên. <button class="btn btn-secondary btn-sm" data-act="goto-classes">Đến mục Lớp học</button></p></div>';
  var v=function(k){return s?esc(s[k]):"";};
  return '<div class="form-panel"><h3><i class="ri-'+(s?"edit":"add")+'-line"></i> '+(s?"Sửa thông tin sinh viên":"Thêm sinh viên mới")+'</h3><form id="svForm" class="frow">'
    +'<div style="flex:1 1 140px"><label class="f-lbl" for="f_ma">Mã sinh viên</label><input class="inp" id="f_ma" name="maSV" required maxlength="30" value="'+v("maSV")+'"'+(s?" readonly":"")+'></div>'
    +'<div style="flex:2 1 220px"><label class="f-lbl" for="f_ten">Họ và tên</label><input class="inp" id="f_ten" name="hoTen" required maxlength="100" value="'+v("hoTen")+'"></div>'
    +'<div style="flex:1 1 110px"><label class="f-lbl" for="f_gt">Giới tính</label><select class="inp" id="f_gt" name="gioiTinh"><option'+(s&&s.gioiTinh==="Nam"?" selected":"")+'>Nam</option><option'+(s&&s.gioiTinh==="Nữ"?" selected":"")+'>Nữ</option></select></div>'
    +'<div style="flex:1 1 120px"><label class="f-lbl" for="f_lop">Lớp</label><select class="inp" id="f_lop" name="lop">'+classOptions(s?s.lop:state.filterClass,false)+'</select></div>'
    +'<div style="flex:2 1 200px"><label class="f-lbl" for="f_mail">Email</label><input class="inp" id="f_mail" type="email" name="email" required maxlength="120" value="'+v("email")+'"></div>'
    +'<div style="flex:1 1 140px"><label class="f-lbl" for="f_sdt">Số điện thoại</label><input class="inp" id="f_sdt" name="sdt" inputmode="tel" pattern="^(0|\\+84)[0-9]{9}$" title="Ví dụ: 0901234567" value="'+v("sdt")+'"></div>'
    +'<div style="flex:1 1 100%;display:flex;gap:10px"><button type="submit" class="btn btn-primary"><i class="ri-save-line"></i> '+(s?"Lưu thay đổi":"Thêm sinh viên")+'</button><button type="button" class="btn btn-secondary" data-act="cancel-form">Hủy</button></div></form></div>';
}
function renderStudents(){
  destroyCharts();
  var h=header("Quản lý sinh viên",'<span id="stCount">'+state.students.length+'</span> sinh viên',
    '<button class="btn btn-secondary" data-act="export-csv" style="margin-right:8px"><i class="ri-download-2-line"></i> Xuất CSV</button><button class="btn btn-primary" id="addBtn"><i class="ri-add-line"></i> Thêm sinh viên</button>');
  if(state.showForm)h+=studentForm();
  h+='<div class="card"><div class="toolbar no-print"><div class="search-wrap"><i class="ri-search-line"></i><input class="inp" id="searchInp" type="search" aria-label="Tìm sinh viên" placeholder="Tìm theo mã, tên, email..." value="'+esc(state.search)+'"></div>'
    +'<div style="flex:0 0 170px"><select class="inp" id="classFilter" aria-label="Lọc theo lớp">'+classOptions(state.filterClass,true)+'</select></div></div>'
    +'<div id="stTable">'+studentTable()+'</div></div>';
  content.innerHTML=h;
}
function refreshStudentTable(){var t=document.getElementById("stTable");if(t)t.innerHTML=studentTable();var c=document.getElementById("stCount");if(c)c.textContent=filteredStudents().length+" / "+state.students.length;}

/* ---------- Bảng điểm ---------- */
function renderScores(){
  destroyCharts();
  var isStaff=state.me.role!=="student";
  var svOpts=state.students.map(function(s){return '<option value="'+esc(s.maSV)+'"'+(state.scoreStudentId===s.maSV?" selected":"")+'>'+esc(s.maSV)+' - '+esc(s.hoTen)+' ('+esc(s.lop)+')</option>';}).join("");
  var h=header("Bảng điểm & GPA",isStaff?"Chọn sinh viên để xem và nhập điểm chi tiết theo từng học kỳ":"Kết quả học tập của bạn theo từng học kỳ");
  if(!state.students.length){content.innerHTML=h+emptyState("ri-user-add-line","Chưa có sinh viên","Hãy thêm sinh viên trước khi nhập điểm.",'<button class="btn btn-primary" data-act="goto-add"><i class="ri-add-line"></i> Thêm sinh viên</button>');return;}
  if(isStaff)h+='<div class="card no-print"><label class="f-lbl" for="scoreSelect">Chọn sinh viên</label><select class="inp" id="scoreSelect" style="max-width:480px"><option value="">-- Chọn sinh viên --</option>'+svOpts+'</select></div>';
  var cur=state.students.find(function(x){return x.maSV===state.scoreStudentId;});
  if(!cur){content.innerHTML=h;return;}
  var all=aggAll(cur),g=all.avg10;
  h+='<div class="card" style="border-color:var(--accent)"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px">'
    +'<div><h2>'+esc(cur.hoTen)+' <span style="color:var(--muted);font-weight:500;font-size:14px">('+esc(cur.maSV)+' · '+esc(cur.lop)+')</span></h2>'
    +'<p class="sub">Tín chỉ đã tích lũy (đạt): <strong style="color:var(--text)">'+all.pass+'</strong> / '+all.tc+' tín chỉ đã có điểm</p>'
    +'<button class="btn btn-secondary btn-sm no-print" data-act="print" style="margin-top:10px"><i class="ri-printer-line"></i> In bảng điểm</button></div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap"><div style="text-align:center;background:var(--accent-soft);border:1px solid var(--accent);border-radius:14px;padding:12px 22px;min-width:130px"><div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">GPA hệ 10</div><div class="num" style="font-size:34px;font-weight:800;line-height:1.1;color:var(--accent)">'+fmt(g)+'</div>'+pill(g)+'</div>'
    +'<div style="text-align:center;background:var(--accent2-soft);border:1px solid var(--accent2);border-radius:14px;padding:12px 22px;min-width:130px"><div style="font-size:11px;font-weight:700;color:var(--accent2);text-transform:uppercase;letter-spacing:.08em">GPA hệ 4</div><div class="num" style="font-size:34px;font-weight:800;line-height:1.1;color:var(--accent2)">'+fmt(all.avg4)+'</div></div></div></div>'
    +'<h4 style="margin:0 0 10px;font-size:13px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Tổng hợp theo học kỳ</h4><div class="tbl-wrap"><table style="min-width:640px"><thead><tr><th>Học kỳ · Năm học</th><th class="c">Số môn</th><th class="c">Tín chỉ</th><th class="c">TB học kỳ (10)</th><th class="c">TB học kỳ (4)</th><th class="c">TB tích lũy (10)</th><th class="c">Xếp loại HK</th></tr></thead><tbody>';
  if(!state.terms.length)h+='<tr><td colspan="7" class="c" style="color:var(--muted);padding:20px">Chưa có học kỳ nào.</td></tr>';
  state.terms.forEach(function(t,i){
    var a=aggTerm(cur,t.id),cu=aggCum(cur,i);
    h+='<tr class="tbl-row"><td style="font-weight:800">'+esc(t.ten)+' <span style="color:var(--muted);font-weight:500;font-size:12px">· '+esc(t.nam)+'</span></td><td class="c num">'+a.n+'/'+subjectsOf(t.id).length+'</td><td class="c num">'+a.tc+'</td><td class="c num" style="font-weight:800;color:var(--accent2)">'+fmt(a.avg10)+'</td><td class="c num">'+fmt(a.avg4)+'</td><td class="c num" style="font-weight:800;color:var(--accent)">'+fmt(cu.avg10)+'</td><td class="c">'+pill(a.avg10)+'</td></tr>';
  });
  h+='</tbody></table></div><p class="sub" style="font-size:12px;margin-top:10px"><i class="ri-information-line"></i> Điểm TK môn = 0.4 × điểm QT + 0.6 × điểm thi. Điểm TB = Σ(điểm TK × tín chỉ) / Σ tín chỉ. Môn đạt khi điểm TK ≥ 4.0. Điểm chữ: A ≥ 8.5, B+ ≥ 8.0, B ≥ 7.0, C+ ≥ 6.5, C ≥ 5.5, D+ ≥ 5.0, D ≥ 4.0, F &lt; 4.0.</p></div>';
  if(!isStaff){
    h+='<div class="card"><h3 style="margin-bottom:14px"><i class="ri-file-list-3-line"></i> Chi tiết điểm từng môn</h3>';
    state.terms.forEach(function(t){
      var mons=subjectsOf(t.id).filter(function(m){return diemOf(cur,m.id);});
      if(!mons.length)return;
      h+='<div class="hk-panel"><div class="hk-title"><strong>'+esc(t.ten)+' <span style="color:var(--muted);font-weight:500;font-size:13px">· '+esc(t.nam)+'</span></strong></div><div class="tbl-wrap"><table style="min-width:520px"><thead><tr><th>Môn học</th><th class="c">Tín chỉ</th><th class="c">QT</th><th class="c">Thi</th><th class="c">Điểm TK</th><th class="c">Điểm chữ</th><th class="c">Thang 4</th></tr></thead><tbody>';
      mons.forEach(function(m){var d=diemOf(cur,m.id),x=tk(d);h+='<tr><td style="font-weight:600">'+esc(m.ten)+'</td><td class="c">'+m.tc+'</td><td class="c num">'+d.qt+'</td><td class="c num">'+d.thi+'</td><td class="c num" style="font-weight:800;color:var(--accent)">'+fmt(x)+'</td><td class="c" style="font-weight:800">'+letter(x)+'</td><td class="c num">'+pts4(x)+'</td></tr>';});
      h+='</tbody></table></div></div>';
    });
    h+='</div>';
  }
  if(isStaff){
  h+='<div class="card no-print"><h3 style="margin-bottom:14px"><i class="ri-edit-box-line"></i> Nhập / chỉnh sửa điểm chi tiết</h3><form id="scoreForm">';
  state.terms.forEach(function(t){
    var mons=subjectsOf(t.id),a=aggTerm(cur,t.id);
    h+='<div class="hk-panel"><div class="hk-title"><strong style="font-size:15px"><i class="ri-calendar-2-line" style="color:var(--accent)"></i> '+esc(t.ten)+' <span style="color:var(--muted);font-weight:500;font-size:13px">· '+esc(t.nam)+'</span></strong><span style="font-size:13px;color:var(--muted)">TB học kỳ: <strong style="color:var(--accent2);font-size:15px">'+fmt(a.avg10)+'</strong> '+pill(a.avg10)+'</span></div>';
    if(!mons.length)h+='<p class="sub" style="font-style:italic">Học kỳ này chưa có môn học. Hãy thêm môn ở mục “Học kỳ &amp; Môn học”.</p>';
    else{
      h+='<div class="tbl-wrap"><table style="min-width:580px"><thead><tr><th>Môn học</th><th class="c">Tín chỉ</th><th class="c">Điểm QT (40%)</th><th class="c">Điểm thi (60%)</th><th class="r">Điểm TK</th><th class="c">Điểm chữ</th></tr></thead><tbody>';
      mons.forEach(function(m){
        var d=diemOf(cur,m.id);
        h+='<tr><td style="font-weight:600">'+esc(m.ten)+'</td><td class="c" style="color:var(--muted)">'+m.tc+'</td>'
          +'<td class="c"><input class="inp" type="number" step="0.1" min="0" max="10" name="qt_'+esc(m.id)+'" aria-label="Điểm quá trình '+esc(m.ten)+'" style="max-width:100px" value="'+(d?d.qt:"")+'" placeholder="0-10"></td>'
          +'<td class="c"><input class="inp" type="number" step="0.1" min="0" max="10" name="thi_'+esc(m.id)+'" aria-label="Điểm thi '+esc(m.ten)+'" style="max-width:100px" value="'+(d?d.thi:"")+'" placeholder="0-10"></td>'
          +'<td class="r num" data-tk="'+esc(m.id)+'" style="font-weight:800;color:var(--accent)">'+(d?fmt(tk(d)):"—")+'</td><td class="c" data-letter="'+esc(m.id)+'" style="font-weight:800">'+(d?letter(tk(d)):"—")+'</td></tr>';
      });
      h+='</tbody></table></div>';
    }
    h+='</div>';
  });
  h+='<button type="submit" class="btn btn-primary"><i class="ri-save-line"></i> Lưu tất cả điểm</button> <span class="sub" style="font-size:12px;margin-left:8px">Để trống cả hai ô nếu môn chưa có điểm.</span></form></div>';
  }
  content.innerHTML=h;
}

/* ---------- Học kỳ & môn học ---------- */
function renderTerms(){
  destroyCharts();
  var h=header("Học kỳ & môn học","Thêm, sửa, xóa học kỳ (kèm năm học) và môn học. Thứ tự học kỳ ảnh hưởng đến điểm tích lũy lũy kế.",'<button class="btn btn-primary" id="addTermBtn"><i class="ri-add-line"></i> Thêm học kỳ</button>');
  if(state.showTermForm&&!state.editingTermId){
    h+='<div class="form-panel warm"><h3><i class="ri-add-line"></i> Thêm học kỳ mới</h3><form id="termForm" class="frow">'
      +'<div style="flex:1 1 200px"><label class="f-lbl" for="t_ten">Tên học kỳ</label><input class="inp" id="t_ten" name="tenHK" required maxlength="60" placeholder="Ví dụ: Học kỳ 2 / Học kỳ hè"></div>'
      +'<div style="flex:1 1 180px"><label class="f-lbl" for="t_nam">Năm học</label><input class="inp" id="t_nam" name="namHoc" required pattern="\\d{4}-\\d{4}" title="Định dạng: 2025-2026" placeholder="2025-2026"></div>'
      +'<button type="submit" class="btn btn-primary"><i class="ri-save-line"></i> Thêm học kỳ</button><button type="button" class="btn btn-secondary" data-act="cancel-term">Hủy</button></form></div>';
  }
  if(!state.terms.length)h+=emptyState("ri-calendar-2-line","Chưa có học kỳ nào","Tạo học kỳ đầu tiên, sau đó thêm các môn học vào học kỳ đó.");
  state.terms.forEach(function(t){
    var mon=subjectsOf(t.id),tongTC=mon.reduce(function(a,m){return a+m.tc;},0);
    h+='<div class="term-card"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
    if(state.editingTermId===t.id){
      h+='<form id="termForm" class="frow" data-termid="'+esc(t.id)+'" style="flex:1"><div style="flex:1 1 180px"><label class="f-lbl">Tên học kỳ</label><input class="inp" name="tenHK" required maxlength="60" value="'+esc(t.ten)+'"></div>'
        +'<div style="flex:1 1 150px"><label class="f-lbl">Năm học</label><input class="inp" name="namHoc" required pattern="\\d{4}-\\d{4}" title="Định dạng: 2025-2026" value="'+esc(t.nam)+'"></div>'
        +'<button type="submit" class="btn btn-primary btn-sm"><i class="ri-check-line"></i> Lưu</button><button type="button" class="btn btn-secondary btn-sm" data-act="cancel-term">Hủy</button></form>';
    }else{
      h+='<div><h3>'+esc(t.ten)+' <span class="pill pill-accent" style="margin-left:6px">Năm học '+esc(t.nam)+'</span></h3><p class="sub">'+mon.length+' môn học · '+tongTC+' tín chỉ</p></div>'
        +'<div style="white-space:nowrap"><button class="btn btn-edit" data-editterm="'+esc(t.id)+'"><i class="ri-edit-line"></i> Sửa</button><button class="btn btn-danger" data-delterm="'+esc(t.id)+'"><i class="ri-delete-bin-line"></i> Xóa</button></div>';
    }
    h+='</div><div class="tbl-wrap"><table style="min-width:480px"><thead><tr><th>STT</th><th>Tên môn học</th><th class="c">Số tín chỉ</th><th class="r">Thao tác</th></tr></thead><tbody>';
    if(!mon.length)h+='<tr><td colspan="4" class="c" style="color:var(--muted);font-style:italic;padding:14px">Chưa có môn học nào - thêm môn bên dưới.</td></tr>';
    mon.forEach(function(m,j){
      if(state.editingSubjId===m.id){
        h+='<tr><td>'+(j+1)+'</td><td colspan="3"><form class="subjEditForm frow" data-id="'+esc(m.id)+'"><div style="flex:2 1 200px"><input class="inp" name="tenMon" required maxlength="120" aria-label="Tên môn" value="'+esc(m.ten)+'"></div><div style="flex:0 0 90px"><input class="inp" type="number" name="soTC" min="1" max="10" required aria-label="Số tín chỉ" value="'+m.tc+'"></div><button class="btn btn-primary btn-sm" type="submit">Lưu</button><button class="btn btn-secondary btn-sm" type="button" data-act="cancel-subj">Hủy</button></form></td></tr>';
      }else{
        h+='<tr class="tbl-row"><td>'+(j+1)+'</td><td style="font-weight:600">'+esc(m.ten)+'</td><td class="c num">'+m.tc+'</td><td class="r" style="white-space:nowrap"><button class="btn btn-edit" data-editsubj="'+esc(m.id)+'"><i class="ri-edit-line"></i> Sửa</button><button class="btn btn-danger" data-delsubj="'+esc(m.id)+'"><i class="ri-delete-bin-line"></i> Xóa</button></td></tr>';
      }
    });
    h+='</tbody></table></div><form class="monForm frow" data-termid="'+esc(t.id)+'" style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)">'
      +'<div style="flex:2 1 240px"><label class="f-lbl">Tên môn học mới</label><input class="inp" name="tenMon" required maxlength="120" placeholder="Ví dụ: Trí tuệ nhân tạo"></div>'
      +'<div style="flex:0 0 120px"><label class="f-lbl">Số tín chỉ</label><input class="inp" type="number" name="soTC" min="1" max="10" required value="3"></div>'
      +'<button type="submit" class="btn btn-secondary" style="border-color:var(--accent);color:var(--accent)"><i class="ri-add-line"></i> Thêm môn</button></form></div>';
  });
  content.innerHTML=h;
}

/* ---------- Lớp học ---------- */
function renderClasses(){
  destroyCharts();
  var h=header("Danh sách lớp học","Thống kê sĩ số và GPA theo từng lớp");
  h+='<div class="card no-print"><h3 style="margin-bottom:12px"><i class="ri-add-circle-line"></i> Thêm lớp mới</h3><form id="classForm" class="frow"><div style="flex:1 1 160px"><label class="f-lbl" for="c_ma">Mã lớp</label><input class="inp" id="c_ma" name="ma" required maxlength="30" placeholder="Ví dụ: CNTT3"></div><div style="flex:2 1 240px"><label class="f-lbl" for="c_khoa">Khoa / Ngành</label><input class="inp" id="c_khoa" name="khoa" maxlength="80" placeholder="Ví dụ: Công nghệ thông tin"></div><button class="btn btn-primary" type="submit"><i class="ri-add-line"></i> Thêm lớp</button></form></div>';
  if(!state.classes.length){content.innerHTML=h+emptyState("ri-school-line","Chưa có lớp nào","Thêm lớp đầu tiên ở form phía trên.");return;}
  h+='<div class="grid">';
  state.classes.forEach(function(c){
    var mem=state.students.filter(function(s){return s.lop===c.ma;}),g=mem.map(gpa).filter(function(x){return x!==null;});
    var avg=g.length?r2(g.reduce(function(a,b){return a+b;},0)/g.length):null,gioi=g.filter(function(x){return x>=8;}).length;
    h+='<div class="class-card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div class="brand-ico" style="width:40px;height:40px;font-size:20px"><i class="ri-team-line"></i></div><div><div style="font-weight:800;font-size:17px">Lớp '+esc(c.ma)+'</div><div class="sub" style="font-size:12px;margin:0">'+esc(c.khoa||"—")+'</div></div></div>'
      +'<div class="kv" style="border-top:1px solid var(--border)"><span>Sĩ số</span><strong>'+mem.length+'</strong></div><div class="kv"><span>GPA trung bình</span><strong class="num">'+fmt(avg)+'</strong></div><div class="kv" style="border:none"><span>SV giỏi (GPA ≥ 8)</span><strong>'+gioi+' / '+mem.length+'</strong></div>'
      +'<div style="margin:6px 0 12px">'+pill(avg)+'</div><div class="no-print" style="display:flex;gap:8px"><button class="btn btn-secondary btn-sm" data-viewclass="'+esc(c.ma)+'"><i class="ri-user-3-line"></i> Xem sinh viên</button><button class="btn btn-danger" data-delclass="'+esc(c.ma)+'"><i class="ri-delete-bin-line"></i> Xóa</button></div></div>';
  });
  content.innerHTML=h+'</div>';
}

/* ---------- Dữ liệu & sao lưu ---------- */
function renderData(){
  destroyCharts();
  var admin=state.me.role==="admin";
  var h=header("Dữ liệu & sao lưu",admin?"Dữ liệu được lưu trên máy chủ. Hãy tải bản sao lưu định kỳ để phòng sự cố.":"Xuất danh sách sinh viên ra file CSV.");
  h+='<div class="data-grid">';
  if(admin){
    h+='<div class="card"><h3><i class="ri-download-cloud-2-line"></i> Sao lưu (JSON)</h3><p>Tải toàn bộ dữ liệu học vụ (sinh viên, điểm, học kỳ, môn học, lớp) về máy. Không gồm tài khoản đăng nhập.</p><button class="btn btn-primary" data-act="export-json"><i class="ri-download-2-line"></i> Tải bản sao lưu</button></div>'
      +'<div class="card"><h3><i class="ri-upload-cloud-2-line"></i> Khôi phục từ file</h3><p>Nạp lại file sao lưu JSON. Dữ liệu học vụ hiện tại sẽ được thay thế.</p><button class="btn btn-secondary" data-act="import-json"><i class="ri-upload-2-line"></i> Chọn file sao lưu</button></div>';
  }
  h+='<div class="card"><h3><i class="ri-file-excel-2-line"></i> Xuất danh sách (CSV)</h3><p>Xuất danh sách sinh viên kèm GPA để mở bằng Excel hoặc Google Sheets.</p><button class="btn btn-secondary" data-act="export-csv"><i class="ri-file-download-line"></i> Xuất CSV</button></div>';
  if(admin){
    h+='<div class="card"><h3><i class="ri-magic-line"></i> Dữ liệu mẫu</h3><p>Nạp bộ dữ liệu mẫu để dùng thử. Dữ liệu học vụ hiện tại sẽ bị thay thế.</p><button class="btn btn-secondary" data-act="demo"><i class="ri-refresh-line"></i> Nạp dữ liệu mẫu</button></div>'
      +'<div class="card" style="border-color:#fecaca"><h3 style="color:var(--danger)"><i class="ri-error-warning-line"></i> Xóa toàn bộ dữ liệu</h3><p>Xóa sạch sinh viên, điểm, học kỳ, môn học và lớp để bắt đầu mới. Không thể hoàn tác.</p><button class="btn btn-danger" data-act="clear"><i class="ri-delete-bin-line"></i> Xóa tất cả</button></div>';
  }
  content.innerHTML=h+'</div>';
}
function csvCell(v){v=String(v==null?"":v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
function exportCSV(){
  var rows=[["Mã SV","Họ tên","Giới tính","Lớp","Trạng thái","Email","SĐT","Tín chỉ đạt","GPA (hệ 10)","GPA (hệ 4)","Xếp loại"]];
  state.students.forEach(function(s){var a=aggAll(s);rows.push([s.maSV,s.hoTen,s.gioiTinh,s.lop,s.trangThai,s.email,s.sdt,a.pass,a.avg10==null?"":a.avg10,a.avg4==null?"":a.avg4,xeploai(a.avg10).t]);});
  download("danh-sach-sinh-vien-"+today()+".csv","\uFEFF"+rows.map(function(r){return r.map(csvCell).join(",");}).join("\r\n"),"text/csv;charset=utf-8");
  toast("Đã xuất file CSV");
}


/* ---------- Tài khoản (quản trị) ---------- */
var ROLE_LABEL={admin:"Quản trị",teacher:"Giảng viên",student:"Sinh viên"};
async function renderUsers(){
  destroyCharts();
  var title="Tài khoản",sub="Tạo và quản lý tài khoản đăng nhập cho quản trị viên, giảng viên và sinh viên.";
  content.innerHTML=header(title,sub)+'<div class="card"><p class="sub">Đang tải…</p></div>';
  var list;
  try{list=(await api("GET","/api/users")).users;}catch(e){if(e.status!==401)toast(e.message,true);return;}
  if(state.view!=="users")return;
  state.users=list;
  var has={};list.forEach(function(u){if(u.maSV)has[u.maSV.toLowerCase()]=1;});
  var free=state.students.filter(function(s){return !has[s.maSV.toLowerCase()];});
  var svOpts=free.length?free.map(function(s){return '<option value="'+esc(s.maSV)+'">'+esc(s.maSV)+' - '+esc(s.hoTen)+'</option>';}).join(""):'<option value="" disabled selected>Mọi sinh viên đều đã có tài khoản</option>';
  var h=header(title,sub);
  h+='<div class="card no-print"><h3 style="margin-bottom:12px"><i class="ri-user-add-line"></i> Tạo tài khoản mới</h3><form id="userForm" class="frow">'
    +'<div style="flex:1 1 150px"><label class="f-lbl" for="u_name">Tên đăng nhập</label><input class="inp" id="u_name" name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._\\-]+" autocomplete="off" title="Chữ không dấu, số và các ký tự . _ -"></div>'
    +'<div style="flex:2 1 200px"><label class="f-lbl" for="u_full">Họ tên</label><input class="inp" id="u_full" name="fullName" required maxlength="100" autocomplete="off"></div>'
    +'<div style="flex:1 1 140px"><label class="f-lbl" for="u_role">Vai trò</label><select class="inp" id="u_role" name="role"><option value="teacher">Giảng viên</option><option value="admin">Quản trị</option><option value="student">Sinh viên</option></select></div>'
    +'<div id="u_svwrap" style="flex:1 1 220px" hidden><label class="f-lbl" for="u_sv">Sinh viên</label><select class="inp" id="u_sv" name="maSV">'+svOpts+'</select></div>'
    +'<div style="flex:1 1 220px"><label class="f-lbl" for="u_pw">Mật khẩu tạm</label><div style="display:flex;gap:6px"><input class="inp" id="u_pw" name="password" required minlength="8" maxlength="128" autocomplete="new-password"><button type="button" class="btn btn-secondary btn-sm" data-act="genpw" title="Tạo mật khẩu ngẫu nhiên" aria-label="Tạo mật khẩu ngẫu nhiên"><i class="ri-magic-line"></i></button></div></div>'
    +'<div style="flex:1 1 100%"><button class="btn btn-primary" type="submit"><i class="ri-add-line"></i> Tạo tài khoản</button><span class="sub" style="font-size:12px;margin-left:10px">Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên.</span></div></form></div>';
  h+='<div class="card"><div class="tbl-wrap"><table style="min-width:680px"><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Mã SV</th><th>Trạng thái</th><th class="r no-print">Thao tác</th></tr></thead><tbody>';
  list.forEach(function(u){
    var self=u.id===state.me.id;
    var st=(u.active?'<span class="pill" style="color:#297a2e;background:rgba(41,122,46,.14)">Hoạt động</span>':'<span class="pill" style="color:#dc2626;background:rgba(220,38,38,.12)">Đã khóa</span>')
      +(u.mustChange?' <span class="pill" style="color:#d97706;background:rgba(217,119,6,.14)">Chờ đổi mật khẩu</span>':'');
    var acts=self?'<span class="sub">(tài khoản của bạn)</span>'
      :'<button class="btn btn-edit" data-resetpw="'+u.id+'" data-uname="'+esc(u.username)+'"><i class="ri-key-2-line"></i> Đặt lại MK</button>'
      +'<button class="btn btn-edit" data-toggleuser="'+u.id+'" data-active="'+(u.active?1:0)+'" data-uname="'+esc(u.username)+'"><i class="ri-'+(u.active?'lock':'lock-unlock')+'-line"></i> '+(u.active?'Khóa':'Mở khóa')+'</button>'
      +'<button class="btn btn-danger" data-deluser="'+u.id+'" data-uname="'+esc(u.username)+'"><i class="ri-delete-bin-line"></i> Xóa</button>';
    h+='<tr class="tbl-row"><td style="font-weight:700;color:var(--accent)">'+esc(u.username)+'</td><td>'+esc(u.fullName)+'</td><td><span class="pill pill-accent">'+ROLE_LABEL[u.role]+'</span></td><td>'+esc(u.maSV||"—")+'</td><td>'+st+'</td><td class="r no-print" style="white-space:nowrap">'+acts+'</td></tr>';
  });
  content.innerHTML=h+'</tbody></table></div></div>';
}

/* ---------- Hồ sơ sinh viên ---------- */
var STATUS_COLOR={"Đang học":["#297a2e","rgba(41,122,46,.14)"],"Bảo lưu":["#d97706","rgba(217,119,6,.14)"],"Thôi học":["#dc2626","rgba(220,38,38,.12)"],"Đã tốt nghiệp":["#2563eb","rgba(37,99,235,.12)"]};
function statusPill(t){var m=STATUS_COLOR[t]||["#64748b","rgba(100,116,139,.12)"];return '<span class="pill" style="color:'+m[0]+';background:'+m[1]+'">'+esc(t||"—")+'</span>';}
var PROFILE_FIELDS=[["ngaySinh","Ngày sinh","date",10],["noiSinh","Nơi sinh","text",100],["queQuan","Quê quán","text",150],["cccd","Số CCCD","text",12],["danToc","Dân tộc","text",40],["tonGiao","Tôn giáo","text",40],["dienChinhSach","Diện chính sách","text",100],["ngayNhapHoc","Ngày nhập học","date",10],["diaChi","Địa chỉ thường trú","text",200]];
var REQ_LABEL={email:"Email",sdt:"Số điện thoại",diaChi:"Địa chỉ thường trú",queQuan:"Quê quán",dienChinhSach:"Diện chính sách"};
var REQ_MAX={email:120,sdt:20,diaChi:200,queQuan:150,dienChinhSach:100},FAMILY_MAX=10;
function nv(x){return x==null||x===""?"—":x;}
function dmy(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");return m?m[3]+"/"+m[2]+"/"+m[1]:nv(s);}
function dateOf(ms){return ms?new Date(ms).toLocaleDateString("vi-VN"):"—";}
function findStudent(ma){ma=String(ma||"").toLowerCase();return state.students.find(function(x){return x.maSV.toLowerCase()===ma;});}
function profileHeader(){return header("Hồ sơ sinh viên",state.me.role!=="student"?"Lý lịch, thân nhân, trạng thái học tập và yêu cầu cập nhật hồ sơ của sinh viên":"Thông tin lý lịch của bạn. Muốn sửa thông tin liên hệ, hãy gửi yêu cầu để cán bộ duyệt.");}
async function renderProfile(){
  destroyCharts();
  if(state.me.role==="student")state.profileId=state.me.maSV||"";
  content.innerHTML=profileHeader()+'<div class="card"><p class="sub">Đang tải…</p></div>';
  state.profile=null;state.family=[];
  try{
    state.requests=(await api("GET","/api/profile-requests")).requests;
    if(state.profileId){var d=await api("GET","/api/students/"+encodeURIComponent(state.profileId)+"/profile");state.profile=d.profile;state.family=d.family;}
  }catch(e){if(e.status===401)return;toast(e.message,true);}
  if(state.view!=="profile")return;
  drawProfile();
}
function requestText(r){
  return Object.keys(r.changes).map(function(k){return '<div><b>'+esc(REQ_LABEL[k]||k)+':</b> <span style="color:var(--muted);text-decoration:line-through">'+esc(r.hienTai[k]||"(trống)")+'</span> → '+esc(r.changes[k]||"(để trống)")+'</div>';}).join("");
}
function drawProfile(){
  var isStaff=state.me.role!=="student",h=profileHeader();
  if(isStaff){
    var pend=state.requests.filter(function(r){return r.trangThai==="Chờ duyệt";});
    if(pend.length){
      h+='<div class="card no-print" style="border-color:var(--accent2)"><h3 style="margin-bottom:12px"><i class="ri-inbox-line"></i> Yêu cầu cập nhật chờ duyệt ('+pend.length+')</h3><div class="tbl-wrap"><table style="min-width:760px"><thead><tr><th>Sinh viên</th><th>Nội dung thay đổi</th><th>Lý do</th><th>Ngày gửi</th><th>Phản hồi và xử lý</th></tr></thead><tbody>';
      pend.forEach(function(r){
        h+='<tr><td style="font-weight:600">'+esc(r.hoTen)+'<div class="sub" style="font-size:12px;margin:0">'+esc(r.maSV)+'</div></td><td style="font-size:13px">'+requestText(r)+'</td><td style="font-size:13px">'+esc(r.lyDo||"—")+'</td><td class="num">'+dateOf(r.createdAt)+'</td>'
          +'<td style="min-width:240px"><input class="inp" id="rq_'+r.id+'" maxlength="300" placeholder="Phản hồi (bắt buộc khi từ chối)" aria-label="Phản hồi cho '+esc(r.hoTen)+'" style="margin-bottom:6px"><button class="btn btn-edit" data-reqok="'+r.id+'"><i class="ri-check-line"></i> Duyệt</button><button class="btn btn-danger" data-reqno="'+r.id+'"><i class="ri-close-line"></i> Từ chối</button></td></tr>';
      });
      h+='</tbody></table></div></div>';
    }
    var opts=state.students.map(function(s){return '<option value="'+esc(s.maSV)+'"'+(state.profileId===s.maSV?" selected":"")+'>'+esc(s.maSV)+' - '+esc(s.hoTen)+' ('+esc(s.lop)+')</option>';}).join("");
    h+='<div class="card no-print"><label class="f-lbl" for="profileSelect">Chọn sinh viên</label><select class="inp" id="profileSelect" style="max-width:480px"><option value="">-- Chọn sinh viên --</option>'+opts+'</select></div>';
  }
  var cur=findStudent(state.profileId),p=state.profile;
  if(!cur||!p){
    if(!isStaff)h+=emptyState("ri-link-unlink","Chưa liên kết hồ sơ","Tài khoản của bạn chưa được liên kết với mã sinh viên. Hãy liên hệ quản trị viên.");
    content.innerHTML=h;return;
  }
  h+='<div class="card" style="border-color:var(--accent)"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px"><div><h2>'+esc(cur.hoTen)+' <span style="color:var(--muted);font-weight:500;font-size:14px">('+esc(cur.maSV)+' · '+esc(cur.lop)+' · '+esc(cur.gioiTinh)+')</span></h2><p class="sub">Email: '+esc(nv(cur.email))+' · SĐT: '+esc(nv(cur.sdt))+'</p></div>'+statusPill(p.trangThai)+'</div>';
  if(isStaff){
    h+='<form id="profileForm" class="frow">';
    PROFILE_FIELDS.forEach(function(f){
      h+='<div style="flex:1 1 '+(f[0]==="diaChi"?"100%":"200px")+'"><label class="f-lbl" for="pf_'+f[0]+'">'+f[1]+'</label><input class="inp" id="pf_'+f[0]+'" name="'+f[0]+'" type="'+(f[2]||"text")+'"'
        +(f[0]==="cccd"?' inputmode="numeric" pattern="\\d{12}" title="Gồm đúng 12 chữ số"':'')+(f[2]==="date"?' min="1950-01-01" max="'+today()+'"':'')+' maxlength="'+f[3]+'" value="'+esc(p[f[0]])+'"></div>';
    });
    h+='<div style="flex:1 1 200px"><label class="f-lbl" for="pf_trangThai">Trạng thái học tập</label><select class="inp" id="pf_trangThai" name="trangThai">'+Object.keys(STATUS_COLOR).map(function(s){return '<option'+(p.trangThai===s?" selected":"")+'>'+s+'</option>';}).join("")+'</select></div>'
      +'<div style="flex:1 1 100%"><button type="submit" class="btn btn-primary"><i class="ri-save-line"></i> Lưu hồ sơ</button></div></form>';
  }else{
    h+='<div class="kv-grid">'+PROFILE_FIELDS.map(function(f){var v=p[f[0]];return '<div class="kv"><span>'+f[1]+'</span><strong>'+esc(f[2]==="date"?dmy(v):nv(v))+'</strong></div>';}).join("")+'</div>';
  }
  h+='</div><div class="card"><h3 style="margin-bottom:12px"><i class="ri-parent-line"></i> Thân nhân và liên hệ khẩn cấp</h3>';
  if(isStaff){
    h+='<form id="familyForm"><datalist id="qhList"><option>Bố</option><option>Mẹ</option><option>Anh</option><option>Chị</option><option>Em</option><option>Vợ</option><option>Chồng</option><option>Người giám hộ</option></datalist>'
      +'<div class="tbl-wrap"><table style="min-width:780px"><thead><tr><th>Quan hệ</th><th>Họ tên</th><th>Năm sinh</th><th>Nghề nghiệp</th><th>Số điện thoại</th><th class="c">Khẩn cấp</th><th></th></tr></thead><tbody>';
    h+=state.family.concat(state.family.length<FAMILY_MAX?[{}]:[]).map(famRow).join("");
    h+='</tbody></table></div><div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:center"><button type="button" class="btn btn-secondary" data-act="fam-add"><i class="ri-add-line"></i> Thêm dòng</button><button type="submit" class="btn btn-primary"><i class="ri-save-line"></i> Lưu thân nhân</button><span class="sub" style="font-size:12px;margin:0">Dòng để trống sẽ được bỏ qua. Đánh dấu “Khẩn cấp” cho người cần liên hệ khi có sự cố.</span></div></form>';
  }else if(!state.family.length){
    h+='<p class="sub">Chưa có thông tin thân nhân. Hãy liên hệ cán bộ quản lý để bổ sung.</p>';
  }else{
    h+='<div class="tbl-wrap"><table style="min-width:620px"><thead><tr><th>Quan hệ</th><th>Họ tên</th><th class="c">Năm sinh</th><th>Nghề nghiệp</th><th>Số điện thoại</th><th class="c">Khẩn cấp</th></tr></thead><tbody>'
      +state.family.map(function(f){return '<tr><td>'+esc(f.quanHe)+'</td><td style="font-weight:600">'+esc(f.hoTen)+'</td><td class="c num">'+nv(f.namSinh)+'</td><td>'+esc(nv(f.ngheNghiep))+'</td><td class="num">'+esc(nv(f.sdt))+'</td><td class="c">'+(f.khanCap?'<span style="color:var(--accent);font-weight:700"><i class="ri-checkbox-circle-fill"></i> Có</span>':'')+'</td></tr>';}).join("")
      +'</tbody></table></div>';
  }
  h+='</div>';
  if(!isStaff){
    var pending=state.requests.some(function(r){return r.trangThai==="Chờ duyệt";}),now={email:cur.email,sdt:cur.sdt,diaChi:p.diaChi,queQuan:p.queQuan,dienChinhSach:p.dienChinhSach};
    h+='<div class="card no-print"><h3 style="margin-bottom:6px"><i class="ri-edit-box-line"></i> Gửi yêu cầu cập nhật</h3><p class="sub" style="margin-bottom:14px">Chỉ điền ô cần đổi; cán bộ quản lý duyệt xong thông tin mới được cập nhật. Sửa họ tên, ngày sinh, số CCCD cần nộp giấy tờ trực tiếp.</p>';
    if(pending)h+='<div class="form-err" style="margin:0">Bạn đang có một yêu cầu chờ duyệt. Hãy chờ cán bộ xử lý trước khi gửi yêu cầu mới.</div>';
    else{
      h+='<form id="reqForm" class="frow">'+Object.keys(REQ_LABEL).map(function(k){return '<div style="flex:1 1 '+(k==="diaChi"?"100%":"220px")+'"><label class="f-lbl" for="rq_'+k+'">'+REQ_LABEL[k]+'</label><input class="inp" id="rq_'+k+'" name="'+k+'" maxlength="'+REQ_MAX[k]+'" placeholder="Hiện tại: '+esc(nv(now[k]))+'"'+(k==="email"?' type="email"':k==="sdt"?' inputmode="tel"':'')+'></div>';}).join("")
        +'<div style="flex:1 1 100%"><label class="f-lbl" for="rq_lyDo">Lý do</label><input class="inp" id="rq_lyDo" name="lyDo" maxlength="300" placeholder="Ví dụ: đổi số điện thoại, chuyển nơi ở"></div>'
        +'<div style="flex:1 1 100%"><button type="submit" class="btn btn-primary"><i class="ri-send-plane-line"></i> Gửi yêu cầu</button></div></form>';
    }
    if(state.requests.length){
      h+='<h4 style="margin:18px 0 8px;font-size:13px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Yêu cầu đã gửi</h4><div class="tbl-wrap"><table style="min-width:600px"><thead><tr><th>Ngày gửi</th><th>Nội dung</th><th>Trạng thái</th><th>Phản hồi</th></tr></thead><tbody>'
        +state.requests.map(function(r){return '<tr><td class="num">'+dateOf(r.createdAt)+'</td><td style="font-size:13px">'+requestText(r)+'</td><td>'+esc(r.trangThai)+'</td><td style="font-size:13px">'+esc(nv(r.phanHoi))+'</td></tr>';}).join("")
        +'</tbody></table></div>';
    }
    h+='</div>';
  }
  content.innerHTML=h;
}
function famRow(f){
  return '<tr data-frow><td><input class="inp" name="quanHe" list="qhList" maxlength="40" value="'+esc(f.quanHe||"")+'" aria-label="Quan hệ" style="min-width:110px"></td>'
    +'<td><input class="inp" name="hoTen" maxlength="100" value="'+esc(f.hoTen||"")+'" aria-label="Họ tên thân nhân"></td>'
    +'<td><input class="inp" name="namSinh" type="number" min="1900" max="'+new Date().getFullYear()+'" value="'+(f.namSinh==null?"":f.namSinh)+'" aria-label="Năm sinh" style="max-width:100px"></td>'
    +'<td><input class="inp" name="ngheNghiep" maxlength="100" value="'+esc(f.ngheNghiep||"")+'" aria-label="Nghề nghiệp"></td>'
    +'<td><input class="inp" name="sdt" inputmode="tel" maxlength="20" value="'+esc(f.sdt||"")+'" aria-label="Số điện thoại thân nhân" style="max-width:150px"></td>'
    +'<td class="c"><input type="checkbox" name="khanCap"'+(f.khanCap?" checked":"")+' aria-label="Liên hệ khẩn cấp"></td>'
    +'<td><button type="button" class="btn btn-danger" data-famdel aria-label="Xóa dòng"><i class="ri-delete-bin-line"></i> Xóa</button></td></tr>';
}
function readFamilyForm(keepEmpty){
  var out=[],rows=content.querySelectorAll("[data-frow]");
  for(var i=0;i<rows.length;i++){
    var r=rows[i],v=function(n){return r.querySelector('[name="'+n+'"]').value.trim();};
    var f={quanHe:v("quanHe"),hoTen:v("hoTen"),namSinh:v("namSinh"),ngheNghiep:v("ngheNghiep"),sdt:v("sdt"),khanCap:r.querySelector('[name="khanCap"]').checked};
    if(!keepEmpty&&!f.quanHe&&!f.hoTen&&!f.namSinh&&!f.ngheNghiep&&!f.sdt)continue;
    f.namSinh=f.namSinh===""?null:parseInt(f.namSinh,10);
    out.push(f);
  }
  return out;
}

/* ---------- Điểm rèn luyện ---------- */
var DRL_COLOR={"Chờ lớp đánh giá":["#d97706","rgba(217,119,6,.14)"],"Chờ khoa duyệt":["#2563eb","rgba(37,99,235,.12)"],"Đã duyệt":["#297a2e","rgba(41,122,46,.14)"]};
function drlPill(t){var m=DRL_COLOR[t]||["#64748b","rgba(100,116,139,.12)"];return '<span class="pill" style="color:'+m[0]+';background:'+m[1]+'">'+esc(t||"Chưa có phiếu")+'</span>';}
function nguongText(ng){return ng.map(function(n,i){return esc(n.ten)+(n.min>0?" ≥ "+n.min:" dưới "+ng[i-1].min);}).join(", ");}
function activeFw(){return state.frameworks.find(function(f){return f.dangDung;})||state.frameworks[0];}
function fwById(id){return state.frameworks.find(function(f){return f.id===id;})||activeFw();}
function evalOf(list,ma){ma=String(ma||"").toLowerCase();return list.find(function(e){return e.maSV.toLowerCase()===ma;});}
function termOptions(sel){return state.terms.map(function(t){return '<option value="'+esc(t.id)+'"'+(t.id===sel?" selected":"")+'>'+esc(t.ten)+' · '+esc(t.nam)+'</option>';}).join("");}
function termLabel(id){var t=state.terms.find(function(x){return x.id===id;});return t?t.ten+" · "+t.nam:"";}
function pickTerm(cur){return cur&&state.terms.some(function(t){return t.id===cur;})?cur:(state.terms.length?state.terms[state.terms.length-1].id:"");}
async function loadDrl(termId){
  if(!state.frameworks.length)state.frameworks=(await api("GET","/api/drl/frameworks")).frameworks;
  return (await api("GET","/api/drl?termId="+encodeURIComponent(termId))).evaluations;
}
function drlHeader(){return header("Điểm rèn luyện",state.me.role==="student"?"Tự đánh giá theo từng tiêu chí; lớp đánh giá rồi khoa duyệt.":"Sinh viên tự đánh giá → lớp (cố vấn học tập) đánh giá → khoa duyệt. Mỗi phiếu giữ khung đánh giá tại thời điểm tạo.");}
async function renderDrl(){
  destroyCharts();
  state.drlTerm=pickTerm(state.drlTerm);
  if(!state.drlTerm){content.innerHTML=drlHeader()+emptyState("ri-calendar-2-line","Chưa có học kỳ nào","Cần tạo học kỳ trước khi đánh giá rèn luyện.");return;}
  content.innerHTML=drlHeader()+'<div class="card"><p class="sub">Đang tải…</p></div>';
  try{state.drlList=await loadDrl(state.drlTerm);}catch(e){if(e.status!==401)toast(e.message,true);return;}
  if(state.view!=="drl")return;
  if(state.me.role==="student")state.drlOpen=state.me.maSV||"";
  drawDrl();
}
function drawDrl(){
  var role=state.me.role,isStaff=role!=="student",h=drlHeader();
  // Sinh viên xem khung của chính phiếu mình (phiếu cũ giữ khung lúc tạo); cán bộ xem khung áp dụng cho phiếu mới.
  var fw=isStaff?activeFw():fwById((evalOf(state.drlList,state.me.maSV)||{}).frameworkId);
  h+='<div class="card no-print"><div class="frow"><div style="flex:1 1 220px"><label class="f-lbl" for="drlTermSel">Học kỳ</label><select class="inp" id="drlTermSel">'+termOptions(state.drlTerm)+'</select></div>'
    +(isStaff?'<div style="flex:1 1 160px"><label class="f-lbl" for="drlClassSel">Lớp</label><select class="inp" id="drlClassSel">'+classOptions(state.drlClass,true)+'</select></div>':'')+'</div>'
    +'<p class="sub" style="font-size:12px;margin-top:12px"><i class="ri-information-line"></i> '+(isStaff?"Khung áp dụng cho phiếu mới":"Khung đánh giá")+': <b>'+esc(fw.ten)+'</b> ('+esc(fw.canCu)+'). Điểm cuối = '+(fw.cachTinh==="khoa"?"điểm khoa duyệt":"trung bình điểm lớp và điểm khoa, làm tròn")+'. Xếp loại: '+nguongText(fw.nguong)+'.</p>';
  if(role==="admin"){
    h+='<div class="frow" style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)"><div style="flex:1 1 280px"><label class="f-lbl" for="fwSel">Khung đánh giá cho phiếu tạo mới</label><select class="inp" id="fwSel">'
      +state.frameworks.map(function(f){return '<option value="'+esc(f.id)+'"'+(f.dangDung?" selected":"")+'>'+esc(f.ten)+'</option>';}).join("")+'</select></div><button class="btn btn-secondary" data-act="set-fw"><i class="ri-check-line"></i> Áp dụng</button></div>';
  }
  h+='</div>';
  if(state.drlOpen)h+=drlPanel();
  if(isStaff)h+=drlTable();
  content.innerHTML=h;
}
function drlTable(){
  var list=state.students.filter(function(s){return state.drlClass==="all"||s.lop===state.drlClass;}),cnt={},fin=[];
  var rows=list.map(function(s){
    var e=evalOf(state.drlList,s.maSV),st=e?e.trangThai:"Chưa có phiếu";
    cnt[st]=(cnt[st]||0)+1;if(e&&e.diemCuoi!=null)fin.push(e.diemCuoi);
    return '<tr class="tbl-row"><td style="font-weight:700;color:var(--accent)">'+esc(s.maSV)+'</td><td style="font-weight:600">'+esc(s.hoTen)+'</td><td>'+esc(s.lop)+'</td>'
      +'<td class="c num">'+nv(e&&e.diemSV)+'</td><td class="c num">'+nv(e&&e.diemLop)+'</td><td class="c num">'+nv(e&&e.diemKhoa)+'</td>'
      +'<td class="c num" style="font-weight:800;color:var(--accent)">'+nv(e&&e.diemCuoi)+'</td><td>'+esc(nv(e&&e.xepLoai))+'</td><td>'+drlPill(e&&e.trangThai)+'</td>'
      +'<td class="r no-print"><button class="btn btn-edit" data-drl="'+esc(s.maSV)+'"><i class="ri-file-edit-line"></i> Mở phiếu</button></td></tr>';
  }).join("");
  var avg=fin.length?Math.round(fin.reduce(function(a,b){return a+b;},0)/fin.length*10)/10:null;
  var sum=["Chưa có phiếu","Chờ lớp đánh giá","Chờ khoa duyệt","Đã duyệt"].map(function(k){return esc(k)+': <b>'+(cnt[k]||0)+'</b>';}).join(" · ");
  return '<div class="card"><h3 style="margin-bottom:4px">Danh sách phiếu '+esc(termLabel(state.drlTerm))+'</h3><p class="sub" style="margin-bottom:14px">'+sum+(avg!=null?' · Điểm cuối trung bình: <b>'+avg+'</b>':'')+'</p>'
    +'<div class="tbl-wrap"><table style="min-width:860px"><thead><tr><th>Mã SV</th><th>Họ tên</th><th>Lớp</th><th class="c">SV tự ĐG</th><th class="c">Lớp ĐG</th><th class="c">Khoa duyệt</th><th class="c">Điểm cuối</th><th>Xếp loại</th><th>Trạng thái</th><th class="r no-print">Thao tác</th></tr></thead><tbody>'
    +(rows||'<tr><td colspan="10" class="c" style="color:var(--muted);padding:24px">Không có sinh viên nào.</td></tr>')+'</tbody></table></div></div>';
}
function drlPanel(){
  var role=state.me.role,s=findStudent(state.drlOpen);
  if(!s)return role==="student"?emptyState("ri-link-unlink","Chưa liên kết hồ sơ","Tài khoản của bạn chưa được liên kết với mã sinh viên."):"";
  var e=evalOf(state.drlList,s.maSV),fw=fwById(e&&e.frameworkId),st=e?e.trangThai:null,it=e?e.items:{sv:{},lop:{},khoa:{}},cap=null;
  if(role==="student"){if(!e||st==="Chờ lớp đánh giá")cap="sv";}
  else if(st!=="Đã duyệt")cap=role==="admin"&&st==="Chờ khoa duyệt"?"khoa":"lop";
  var prev=cap==="lop"?it.sv:cap==="khoa"?it.lop:{},cols=[["sv","SV tự đánh giá"],["lop","Lớp đánh giá"],["khoa","Khoa duyệt"]],capSum=0,capFull=true;
  var h='<div class="card" id="drlPanel" style="border-color:var(--accent)"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px"><div><h2>Phiếu rèn luyện: '+esc(s.hoTen)+' <span style="color:var(--muted);font-weight:500;font-size:14px">('+esc(s.maSV)+' · '+esc(s.lop)+')</span></h2><p class="sub">'+esc(termLabel(state.drlTerm))+' · Khung: '+esc(fw.ten)+'</p></div>'
    +'<div style="display:flex;gap:8px;align-items:center">'+drlPill(st)+(role!=="student"?'<button class="btn btn-secondary btn-sm no-print" data-act="drl-close"><i class="ri-close-line"></i> Đóng</button>':'')+'</div></div>';
  h+='<form id="drlForm" data-cap="'+(cap||"")+'" data-ma="'+esc(s.maSV)+'"><div class="tbl-wrap"><table style="min-width:680px"><thead><tr><th>Mã</th><th>Tiêu chí</th><th class="c">Tối đa</th>'
    +cols.map(function(c){return '<th class="c"'+(c[0]===cap?' style="color:var(--accent)"':'')+'>'+c[1]+'</th>';}).join("")+'</tr></thead><tbody>';
  fw.criteria.forEach(function(c){
    h+='<tr><td style="font-weight:700">'+esc(c.ma)+'</td><td>'+esc(c.ten)+'</td><td class="c num">'+c.max+'</td>';
    cols.forEach(function(col){
      var val=it[col[0]][c.ma];
      if(col[0]!==cap){h+='<td class="c num">'+nv(val)+'</td>';return;}
      var def=val!=null?val:(prev[c.ma]!=null?prev[c.ma]:"");
      if(def==="")capFull=false;else capSum+=def;
      h+='<td class="c"><input class="inp num" type="number" min="0" max="'+c.max+'" step="1" required name="drl_'+esc(c.ma)+'" value="'+def+'" aria-label="'+esc(col[1]+" "+c.ma)+'" style="max-width:84px;text-align:center"></td>';
    });
    h+='</tr>';
  });
  var tot={sv:e&&e.diemSV,lop:e&&e.diemLop,khoa:e&&e.diemKhoa};
  h+='<tr style="font-weight:800"><td></td><td>Tổng</td><td class="c num">'+fw.criteria.reduce(function(a,c){return a+c.max;},0)+'</td>'
    +cols.map(function(col){return col[0]===cap?'<td class="c num" data-drltotal style="color:var(--accent)">'+(capFull?capSum:"—")+'</td>':'<td class="c num">'+nv(tot[col[0]])+'</td>';}).join("")+'</tr></tbody></table></div>';
  if(e&&e.diemCuoi!=null)h+='<div class="kv" style="border:none;margin-top:8px;font-size:15px"><span>Điểm rèn luyện cuối cùng</span><strong><span class="num" style="font-size:20px;color:var(--accent)">'+e.diemCuoi+'</span> · '+esc(e.xepLoai)+'</strong></div>';
  if(e&&e.ghiChu)h+='<p class="sub" style="margin-top:8px"><i class="ri-sticky-note-line"></i> Ghi chú: '+esc(e.ghiChu)+'</p>';
  if(cap==="lop"&&(!e||e.diemSV==null))h+='<p class="sub" style="margin-top:8px;color:var(--accent2)"><i class="ri-error-warning-line"></i> Sinh viên chưa tự đánh giá.</p>';
  if(cap==="lop"||cap==="khoa")h+='<div class="fld no-print" style="margin-top:12px"><label class="f-lbl" for="drlNote">Ghi chú (biên bản họp lớp, lý do điều chỉnh)</label><input class="inp" id="drlNote" name="ghiChu" maxlength="300" value="'+esc(e?e.ghiChu:"")+'"></div>';
  h+='<div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center">';
  if(cap)h+='<button type="submit" class="btn btn-primary"><i class="ri-save-line"></i> '+({sv:"Nộp phiếu tự đánh giá",lop:"Lưu đánh giá của lớp",khoa:"Duyệt phiếu"})[cap]+'</button>';
  if(role==="admin"&&st==="Đã duyệt")h+='<button type="button" class="btn btn-secondary" data-act="drl-reopen"><i class="ri-arrow-go-back-line"></i> Mở lại phiếu</button>';
  if(!cap&&role==="student")h+='<span class="sub">Phiếu đã chuyển cho lớp đánh giá nên bạn không sửa được nữa.</span>';
  if(!cap&&role==="teacher")h+='<span class="sub">Phiếu đã được khoa duyệt.</span>';
  h+='</div></form></div>';
  return h;
}

/* ---------- Xét chọn khen thưởng ---------- */
function reviewHeader(){return header("Xét chọn khen thưởng","Lọc sinh viên theo kết quả học tập và rèn luyện của một học kỳ để lập danh sách đề cử học bổng, Sinh viên 5 tốt.");}
async function renderReview(){
  destroyCharts();
  // Mặc định là học kỳ gần nhất đã có điểm (học kỳ đang học thường chưa có điểm để xét).
  if(!state.reviewTerm){var graded=state.terms.filter(function(t){return state.students.some(function(s){return aggTerm(s,t.id).avg10!=null;});});if(graded.length)state.reviewTerm=graded[graded.length-1].id;}
  state.reviewTerm=pickTerm(state.reviewTerm);
  if(!state.reviewTerm){content.innerHTML=reviewHeader()+emptyState("ri-calendar-2-line","Chưa có học kỳ nào","Cần có học kỳ, điểm học tập và điểm rèn luyện để xét chọn.");return;}
  content.innerHTML=reviewHeader()+'<div class="card"><p class="sub">Đang tải…</p></div>';
  try{state.reviewList=await loadDrl(state.reviewTerm);}catch(e){if(e.status!==401)toast(e.message,true);return;}
  if(state.view!=="review")return;
  drawReview();
}
function reviewRows(){
  var out=[];
  state.students.forEach(function(s){
    if(state.reviewActive&&s.trangThai!=="Đang học")return;
    var a=aggTerm(s,state.reviewTerm),e=evalOf(state.reviewList,s.maSV);
    if(a.avg10==null||!e||e.diemCuoi==null||a.avg10<state.reviewGpa||e.diemCuoi<state.reviewDrl)return;
    out.push({s:s,g:a.avg10,tc:a.tc,d:e.diemCuoi,x:e.xepLoai});
  });
  return out.sort(function(a,b){return b.g-a.g||b.d-a.d;});
}
function reviewTable(){
  var list=reviewRows();
  var h='<p class="sub" style="margin-bottom:12px"><b>'+list.length+'</b> sinh viên đạt cả hai ngưỡng trong '+esc(termLabel(state.reviewTerm))+'.</p><div class="tbl-wrap"><table style="min-width:760px"><thead><tr><th>STT</th><th>Mã SV</th><th>Họ tên</th><th>Lớp</th><th class="c">Tín chỉ HK</th><th class="c">TB học kỳ</th><th>Xếp loại học tập</th><th class="c">Điểm RL</th><th>Xếp loại RL</th></tr></thead><tbody>';
  if(!list.length)h+='<tr><td colspan="9" class="c" style="color:var(--muted);padding:24px">Không có sinh viên nào đạt. Thử hạ ngưỡng hoặc kiểm tra phiếu rèn luyện đã được khoa duyệt chưa.</td></tr>';
  list.forEach(function(r,i){h+='<tr class="tbl-row"><td>'+(i+1)+'</td><td style="font-weight:700;color:var(--accent)">'+esc(r.s.maSV)+'</td><td style="font-weight:600">'+esc(r.s.hoTen)+'</td><td>'+esc(r.s.lop)+'</td><td class="c num">'+r.tc+'</td><td class="c num" style="font-weight:800">'+fmt(r.g)+'</td><td>'+pill(r.g)+'</td><td class="c num" style="font-weight:800;color:var(--accent)">'+r.d+'</td><td>'+esc(r.x)+'</td></tr>';});
  return h+'</tbody></table></div>';
}
function drawReview(){
  var h=reviewHeader();
  h+='<div class="card no-print"><div class="frow"><div style="flex:1 1 220px"><label class="f-lbl" for="revTermSel">Học kỳ</label><select class="inp" id="revTermSel">'+termOptions(state.reviewTerm)+'</select></div>'
    +'<div style="flex:0 1 170px"><label class="f-lbl" for="revGpa">TB học kỳ tối thiểu</label><input class="inp" id="revGpa" type="number" min="0" max="10" step="0.1" value="'+state.reviewGpa+'"></div>'
    +'<div style="flex:0 1 170px"><label class="f-lbl" for="revDrl">Điểm rèn luyện tối thiểu</label><input class="inp" id="revDrl" type="number" min="0" max="100" step="1" value="'+state.reviewDrl+'"></div>'
    +'<label style="display:flex;gap:6px;align-items:center;font-size:14px;padding-bottom:10px"><input type="checkbox" id="revActive"'+(state.reviewActive?" checked":"")+'> Chỉ sinh viên đang học</label>'
    +'<button class="btn btn-secondary" data-act="export-review"><i class="ri-file-download-line"></i> Xuất CSV</button></div>'
    +'<p class="sub" style="font-size:12px;margin-top:12px"><i class="ri-information-line"></i> Ngưỡng mặc định (8,0 và 80) chỉ để minh họa; hãy nhập theo quy chế học bổng và tiêu chí Sinh viên 5 tốt đang áp dụng. Chỉ tính phiếu rèn luyện đã được khoa duyệt; TB học kỳ tính theo trọng số tín chỉ.</p></div>';
  content.innerHTML=h+'<div class="card"><div id="revTable">'+reviewTable()+'</div></div>';
}
function exportReview(){
  var rows=[["STT","Mã SV","Họ tên","Lớp","Tín chỉ HK","TB học kỳ","Xếp loại học tập","Điểm rèn luyện","Xếp loại rèn luyện"]];
  reviewRows().forEach(function(r,i){rows.push([i+1,r.s.maSV,r.s.hoTen,r.s.lop,r.tc,r.g,xeploai(r.g).t,r.d,r.x]);});
  download("xet-chon-"+state.reviewTerm+"-"+today()+".csv","﻿"+rows.map(function(r){return r.map(csvCell).join(",");}).join("\r\n"),"text/csv;charset=utf-8");
  toast("Đã xuất danh sách xét chọn");
}

/* ---------- Điều hướng ---------- */
var NAV={dashboard:["ri-dashboard-line","Tổng quan"],students:["ri-user-3-line","Sinh viên"],profile:["ri-profile-line","Hồ sơ sinh viên"],scores:["ri-file-list-3-line","Bảng điểm &amp; GPA"],
  drl:["ri-medal-line","Điểm rèn luyện"],review:["ri-award-line","Xét chọn khen thưởng"],terms:["ri-calendar-2-line","Học kỳ &amp; Môn học"],classes:["ri-school-line","Lớp học"],data:["ri-database-2-line","Dữ liệu &amp; Sao lưu"],users:["ri-shield-user-line","Tài khoản"]};
var ROLE_VIEWS={admin:["dashboard","students","profile","scores","drl","review","terms","classes","data","users"],teacher:["dashboard","students","profile","scores","drl","review","terms","classes","data"],student:["scores","profile","drl"]};
function el(id){return document.getElementById(id);}
function buildNav(){
  el("nav").innerHTML=ROLE_VIEWS[state.me.role].map(function(v){return '<button class="nav-item" data-view="'+v+'"><i class="'+NAV[v][0]+'"></i>'+NAV[v][1]+'</button>';}).join("");
}
function render(){
  var items=document.querySelectorAll("#nav .nav-item");
  for(var i=0;i<items.length;i++){var on=items[i].getAttribute("data-view")===state.view;items[i].classList.toggle("active",on);if(on)items[i].setAttribute("aria-current","page");else items[i].removeAttribute("aria-current");}
  ({dashboard:renderDashboard,students:renderStudents,profile:renderProfile,scores:renderScores,drl:renderDrl,review:renderReview,terms:renderTerms,classes:renderClasses,data:renderData,users:renderUsers})[state.view]();
}
function go(view){
  if(!state.me||ROLE_VIEWS[state.me.role].indexOf(view)<0)return;
  state.view=view;state.showForm=false;state.editingId=null;state.showTermForm=false;state.editingTermId=null;state.editingSubjId=null;state.drlOpen="";
  render();window.scrollTo(0,0);
}

/* ---------- Màn hình đăng nhập / đổi mật khẩu ---------- */
function showOnly(which){["boot","authScreen","pwScreen","appShell"].forEach(function(id){el(id).hidden=(id!==which);});}
function showLogin(msg){
  state.me=null;state.students=[];state.terms=[];state.subjects=[];state.classes=[];state.users=[];state.scoreStudentId="";
  state.profileId="";state.profile=null;state.family=[];state.requests=[];state.frameworks=[];state.drlTerm="";state.drlClass="all";state.drlList=[];state.drlOpen="";state.reviewTerm="";state.reviewList=[];
  destroyCharts();content.innerHTML="";
  showOnly("authScreen");
  el("loginErr").textContent=msg||"";el("loginErr").hidden=!msg;
  el("loginPass").value="";
  el(el("loginUser").value?"loginPass":"loginUser").focus();
}
function showPw(forced){
  showOnly("pwScreen");
  el("pwForm").reset();el("pwErr").hidden=true;
  state.pwForced=!!forced;
  el("pwCancel").hidden=!!forced;
  el("pwIntro").textContent=forced?"Bạn cần đặt mật khẩu mới trước khi sử dụng (đăng nhập lần đầu hoặc mật khẩu vừa được đặt lại).":"Nhập mật khẩu hiện tại và mật khẩu mới của bạn.";
  el("pwCur").focus();
}
async function enter(user){
  state.me=user;
  if(user.mustChange){showPw(true);return;}
  showOnly("appShell");
  el("uName").textContent=user.fullName;
  el("uRole").textContent=ROLE_LABEL[user.role]+" · "+user.username;
  buildNav();
  try{await refresh();}catch(e){if(e.status!==401)toast(e.message,true);return;}
  state.view=user.role==="student"?"scores":"dashboard";
  state.scoreStudentId=user.role==="student"?(user.maSV||""):"";
  state.search="";state.filterClass="all";state.page=1;state.showForm=false;state.editingId=null;
  render();
}
async function logout(){
  try{await api("POST","/api/logout");}catch(e){}
  el("loginUser").value="";
  showLogin();
}

el("loginForm").addEventListener("submit",async function(e){
  e.preventDefault();
  var btn=e.target.querySelector("button[type=submit]");btn.disabled=true;
  try{
    var r=await api("POST","/api/login",{username:el("loginUser").value,password:el("loginPass").value});
    el("loginPass").value="";el("loginErr").hidden=true;
    await enter(r.user);
  }catch(err){
    el("loginErr").textContent=err.message;el("loginErr").hidden=false;el("loginPass").value="";el("loginPass").focus();
  }finally{btn.disabled=false;}
});
el("pwForm").addEventListener("submit",async function(e){
  e.preventDefault();
  var cur=el("pwCur").value,nw=el("pwNew").value,cf=el("pwConfirm").value,err=el("pwErr");
  function fail(m){err.textContent=m;err.hidden=false;}
  if(nw.length<8)return fail("Mật khẩu mới phải có ít nhất 8 ký tự.");
  if(nw!==cf)return fail("Mật khẩu nhập lại không khớp.");
  var btn=e.target.querySelector("button[type=submit]");btn.disabled=true;
  try{
    var r=await api("POST","/api/change-password",{current:cur,next:nw});
    el("pwForm").reset();
    if(state.pwForced)await enter(r.user);
    else{state.me=r.user;showOnly("appShell");toast("Đã đổi mật khẩu");}
  }catch(ex){if(ex.status!==401)fail(ex.message);}
  finally{btn.disabled=false;}
});
el("pwCancel").addEventListener("click",function(){showOnly("appShell");});
el("btnPw").addEventListener("click",function(){showPw(false);});
el("btnLogout").addEventListener("click",logout);
el("logoutFromPw").addEventListener("click",logout);

el("nav").addEventListener("click",function(e){var b=e.target.closest(".nav-item");if(b)go(b.getAttribute("data-view"));});

/* ---------- Sự kiện trong nội dung ---------- */
content.addEventListener("input",function(e){
  var t=e.target;
  if(t.id==="searchInp"){state.search=t.value;state.page=1;refreshStudentTable();return;}
  if(t.name&&(t.name.indexOf("qt_")===0||t.name.indexOf("thi_")===0)){
    var id=t.name.replace(/^(qt_|thi_)/,""),f=t.form,q=f.elements["qt_"+id],c=f.elements["thi_"+id];
    var cell=f.querySelector('[data-tk="'+id+'"]');
    var a=parseFloat(q.value),b=parseFloat(c.value),ok=!isNaN(a)&&!isNaN(b),v=ok?clamp(a,0,10)*0.4+clamp(b,0,10)*0.6:0;
    if(cell)cell.textContent=ok?fmt(v):"—";
    var lc=f.querySelector('[data-letter="'+id+'"]');if(lc)lc.textContent=ok?letter(v):"—";
    return;
  }
  if(t.name&&t.name.indexOf("drl_")===0){
    var ins=t.form.querySelectorAll('input[name^="drl_"]'),sum=0,full=true;
    for(var i=0;i<ins.length;i++){var x=ins[i].value.trim();if(x===""||!ins[i].checkValidity())full=false;else sum+=+x;}
    var tc=t.form.querySelector("[data-drltotal]");if(tc)tc.textContent=full?sum:"—";
    return;
  }
  if(t.id==="revGpa"||t.id==="revDrl"){
    var n=parseFloat(t.value);if(isNaN(n))return;
    if(t.id==="revGpa")state.reviewGpa=clamp(n,0,10);else state.reviewDrl=clamp(n,0,100);
    el("revTable").innerHTML=reviewTable();
  }
});
content.addEventListener("change",function(e){
  var t=e.target;
  if(t.id==="classFilter"){state.filterClass=t.value;state.page=1;refreshStudentTable();}
  if(t.id==="scoreSelect"){state.scoreStudentId=t.value;renderScores();}
  if(t.id==="u_role"){var isSv=t.value==="student";el("u_svwrap").hidden=!isSv;el("u_sv").required=isSv;}
  if(t.id==="profileSelect"){state.profileId=t.value;renderProfile();}
  if(t.id==="drlTermSel"){state.drlTerm=t.value;if(state.me.role!=="student")state.drlOpen="";renderDrl();}
  if(t.id==="drlClassSel"){state.drlClass=t.value;drawDrl();}
  if(t.id==="revTermSel"){state.reviewTerm=t.value;renderReview();}
  if(t.id==="revActive"){state.reviewActive=t.checked;el("revTable").innerHTML=reviewTable();}
});
el("importFile").addEventListener("change",function(e){
  var f=e.target.files[0];e.target.value="";if(!f)return;
  if(f.size>10*1024*1024){toast("File quá lớn (tối đa 10MB).",true);return;}
  var rd=new FileReader();
  rd.onload=async function(){
    var o=null;try{o=JSON.parse(rd.result);}catch(x){}
    if(!o||!Array.isArray(o.students)||!Array.isArray(o.terms)||!Array.isArray(o.subjects)){toast("File không hợp lệ. Hãy chọn file sao lưu của ứng dụng này.",true);return;}
    if(await confirmBox("Khôi phục dữ liệu?","Sẽ thay thế toàn bộ dữ liệu hiện tại bằng "+o.students.length+" sinh viên, "+o.terms.length+" học kỳ, "+o.subjects.length+" môn học trong file.\nTài khoản sinh viên có mã không còn trong file sẽ bị khóa.","Khôi phục")){
      state.scoreStudentId="";
      mutate(function(){return api("POST","/api/admin/import",o);},"Đã khôi phục dữ liệu");
    }
  };
  rd.onerror=function(){toast("Không đọc được file.",true);};
  rd.readAsText(f);
});

content.addEventListener("click",async function(e){
  var t=e.target,el2;
  if((el2=t.closest("[data-sort]"))){var k=el2.getAttribute("data-sort");if(state.sortKey===k)state.sortDir*=-1;else{state.sortKey=k;state.sortDir=1;}state.page=1;refreshStudentTable();return;}
  if((el2=t.closest("[data-page]"))){if(!el2.disabled){state.page=parseInt(el2.getAttribute("data-page"),10)||1;refreshStudentTable();}return;}
  if(t.closest("#addBtn")){state.showForm=true;state.editingId=null;renderStudents();var f0=el("f_ma");if(f0)f0.focus();return;}
  if((el2=t.closest("[data-edit]"))){state.editingId=el2.getAttribute("data-edit");state.showForm=true;renderStudents();window.scrollTo(0,0);return;}
  if((el2=t.closest("[data-score]"))){state.scoreStudentId=el2.getAttribute("data-score");go("scores");return;}
  if((el2=t.closest("[data-profile]"))){state.profileId=el2.getAttribute("data-profile");go("profile");return;}
  // Hồ sơ: duyệt yêu cầu, xóa dòng thân nhân
  if((el2=t.closest("[data-reqok],[data-reqno]"))){
    var ok=el2.hasAttribute("data-reqok"),rid=el2.getAttribute(ok?"data-reqok":"data-reqno"),inp=el("rq_"+rid),ph=inp?inp.value.trim():"";
    if(!ok&&!ph){toast("Hãy ghi lý do từ chối để sinh viên biết cần bổ sung gì.",true);if(inp)inp.focus();return;}
    mutate(function(){return api("PUT","/api/profile-requests/"+encodeURIComponent(rid),{duyet:ok,phanHoi:ph});},ok?"Đã duyệt và cập nhật hồ sơ":"Đã từ chối yêu cầu",renderProfile);
    return;
  }
  if((el2=t.closest("[data-famdel]"))){el2.closest("tr").remove();return;}
  // Điểm rèn luyện: mở phiếu
  if((el2=t.closest("[data-drl]"))){
    state.drlOpen=el2.getAttribute("data-drl");drawDrl();
    var pn=el("drlPanel");if(pn){pn.scrollIntoView({block:"start"});var fi=pn.querySelector("input.num");if(fi)fi.focus({preventScroll:true});}
    return;
  }
  if((el2=t.closest("[data-del]"))){
    var id=el2.getAttribute("data-del"),sv=state.students.find(function(x){return x.maSV===id;});
    if(sv&&await confirmBox("Xóa sinh viên?","Xóa “"+sv.hoTen+"” ("+sv.maSV+") cùng toàn bộ điểm và tài khoản đăng nhập của sinh viên này?","Xóa")){
      mutate(function(){return api("DELETE","/api/students/"+encodeURIComponent(id));},"Đã xóa sinh viên",function(){if(state.scoreStudentId===id)state.scoreStudentId="";renderStudents();});
    }
    return;
  }
  if(t.closest("#addTermBtn")){state.showTermForm=true;state.editingTermId=null;renderTerms();var tf=el("t_ten");if(tf)tf.focus();return;}
  if((el2=t.closest("[data-editterm]"))){state.editingTermId=el2.getAttribute("data-editterm");state.showTermForm=false;renderTerms();return;}
  if((el2=t.closest("[data-delterm]"))){
    var tid=el2.getAttribute("data-delterm"),term=state.terms.find(function(x){return x.id===tid;});
    var nMon=subjectsOf(tid).length;
    if(term&&await confirmBox("Xóa học kỳ?","Xóa “"+term.ten+" · "+term.nam+"”?\nSẽ xóa luôn "+nMon+" môn học và toàn bộ điểm liên quan của sinh viên.","Xóa")){
      mutate(function(){return api("DELETE","/api/terms/"+encodeURIComponent(tid));},"Đã xóa học kỳ",renderTerms);
    }
    return;
  }
  if((el2=t.closest("[data-editsubj]"))){state.editingSubjId=el2.getAttribute("data-editsubj");renderTerms();return;}
  if((el2=t.closest("[data-delsubj]"))){
    var sid=el2.getAttribute("data-delsubj"),subj=state.subjects.find(function(x){return x.id===sid;});
    if(subj&&await confirmBox("Xóa môn học?","Xóa môn “"+subj.ten+"”? Điểm của môn này sẽ bị xóa với toàn bộ sinh viên.","Xóa")){
      mutate(function(){return api("DELETE","/api/subjects/"+encodeURIComponent(sid));},"Đã xóa môn học",renderTerms);
    }
    return;
  }
  if((el2=t.closest("[data-viewclass]"))){state.filterClass=el2.getAttribute("data-viewclass");state.search="";state.page=1;go("students");return;}
  if((el2=t.closest("[data-delclass]"))){
    var cm=el2.getAttribute("data-delclass"),n=state.students.filter(function(s){return s.lop===cm;}).length;
    if(n){toast("Lớp "+cm+" còn "+n+" sinh viên. Hãy chuyển hoặc xóa sinh viên trước.",true);return;}
    if(await confirmBox("Xóa lớp?","Xóa lớp “"+cm+"”?","Xóa")){
      mutate(function(){return api("DELETE","/api/classes/"+encodeURIComponent(cm));},"Đã xóa lớp",function(){if(state.filterClass===cm)state.filterClass="all";renderClasses();});
    }
    return;
  }
  // Tài khoản
  if((el2=t.closest("[data-resetpw]"))){
    var ru=el2.getAttribute("data-resetpw"),rn=el2.getAttribute("data-uname");
    if(await confirmBox("Đặt lại mật khẩu?","Tạo mật khẩu tạm mới cho “"+rn+"”. Mật khẩu cũ và các phiên đăng nhập hiện có sẽ bị hủy.","Đặt lại")){
      mutate(function(){return api("PUT","/api/users/"+ru,{resetPassword:true});},null,function(res){
        renderUsers();
        confirmBox("Mật khẩu tạm thời","Tài khoản: "+rn+"\nMật khẩu: "+res.password+"\n\nHãy ghi lại và gửi cho người dùng ngay. Mật khẩu này chỉ hiển thị một lần; người dùng sẽ phải đổi khi đăng nhập.","Đã ghi lại",true);
      });
    }
    return;
  }
  if((el2=t.closest("[data-toggleuser]"))){
    var tu=el2.getAttribute("data-toggleuser"),nowActive=el2.getAttribute("data-active")==="1",un=el2.getAttribute("data-uname");
    if(!nowActive||await confirmBox("Khóa tài khoản?","“"+un+"” sẽ bị đăng xuất và không thể đăng nhập cho đến khi được mở khóa.","Khóa")){
      mutate(function(){return api("PUT","/api/users/"+tu,{active:!nowActive});},nowActive?"Đã khóa tài khoản":"Đã mở khóa tài khoản",renderUsers);
    }
    return;
  }
  if((el2=t.closest("[data-deluser]"))){
    var du=el2.getAttribute("data-deluser"),dn=el2.getAttribute("data-uname");
    if(await confirmBox("Xóa tài khoản?","Xóa tài khoản “"+dn+"”? Dữ liệu sinh viên (nếu có) không bị ảnh hưởng.","Xóa")){
      mutate(function(){return api("DELETE","/api/users/"+du);},"Đã xóa tài khoản",renderUsers);
    }
    return;
  }
  if((el2=t.closest("[data-act]"))){
    var a=el2.getAttribute("data-act");
    if(a==="cancel-form"){state.showForm=false;state.editingId=null;renderStudents();}
    else if(a==="cancel-term"){state.showTermForm=false;state.editingTermId=null;renderTerms();}
    else if(a==="cancel-subj"){state.editingSubjId=null;renderTerms();}
    else if(a==="goto-add"){state.view="students";state.showForm=true;state.editingId=null;render();}
    else if(a==="goto-classes"){go("classes");}
    else if(a==="print"){window.print();}
    else if(a==="export-csv"){exportCSV();}
    else if(a==="export-review"){exportReview();}
    else if(a==="fam-add"){
      var tb=content.querySelector("#familyForm tbody");
      if(tb.querySelectorAll("[data-frow]").length>=FAMILY_MAX){toast("Tối đa "+FAMILY_MAX+" thân nhân.",true);return;}
      tb.insertAdjacentHTML("beforeend",famRow({}));tb.lastElementChild.querySelector("input").focus();
    }
    else if(a==="drl-close"){state.drlOpen="";drawDrl();}
    else if(a==="set-fw"){
      var fid=el("fwSel").value,cur0=activeFw();
      if(cur0&&cur0.id===fid){toast("Khung này đang được dùng.");return;}
      if(await confirmBox("Đổi khung đánh giá?","Các phiếu tạo từ bây giờ sẽ dùng khung “"+fwById(fid).ten+"”.\nPhiếu đã có giữ nguyên khung cũ để không làm sai điểm đã chấm.","Đổi khung")){
        mutate(function(){return api("PUT","/api/drl/frameworks/active",{id:fid});},"Đã đổi khung đánh giá",function(){state.frameworks=[];renderDrl();});
      }
    }
    else if(a==="drl-reopen"){
      var rf=el("drlForm"),rma=rf.getAttribute("data-ma");
      if(await confirmBox("Mở lại phiếu?","Điểm khoa duyệt của "+rma+" sẽ bị xóa, phiếu quay về trạng thái “Chờ khoa duyệt” để lớp hoặc khoa chấm lại.","Mở lại")){
        mutate(function(){return api("POST","/api/drl/"+encodeURIComponent(rma)+"/"+encodeURIComponent(state.drlTerm)+"/reopen");},"Đã mở lại phiếu",renderDrl);
      }
    }
    else if(a==="genpw"){
      var chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789",buf=new Uint32Array(12),pw="";
      crypto.getRandomValues(buf);for(var i=0;i<buf.length;i++)pw+=chars[buf[i]%chars.length];
      el("u_pw").value=pw;
    }
    else if(a==="export-json"){
      try{var d=await api("GET","/api/export");download("sao-luu-qlsv-"+today()+".json",JSON.stringify(d,null,2),"application/json");toast("Đã tải bản sao lưu");}
      catch(err){if(err.status!==401)toast(err.message,true);}
    }
    else if(a==="import-json"){el("importFile").click();}
    else if(a==="demo"){
      if(!state.students.length&&!state.terms.length||await confirmBox("Nạp dữ liệu mẫu?","Dữ liệu học vụ hiện tại sẽ bị thay thế bằng dữ liệu mẫu. Tài khoản sinh viên đang có sẽ bị khóa nếu mã SV không còn tồn tại.","Nạp dữ liệu mẫu")){
        state.scoreStudentId="";state.filterClass="all";state.search="";
        mutate(function(){return api("POST","/api/admin/demo");},"Đã nạp dữ liệu mẫu");
      }
    }
    else if(a==="clear"){
      if(await confirmBox("Xóa toàn bộ dữ liệu?","Toàn bộ sinh viên, điểm, học kỳ, môn học và lớp sẽ bị xóa vĩnh viễn (tài khoản đăng nhập của sinh viên sẽ bị khóa). Hãy tải bản sao lưu trước nếu cần.","Xóa tất cả")){
        state.scoreStudentId="";state.filterClass="all";state.search="";
        mutate(function(){return api("POST","/api/admin/clear");},"Đã xóa toàn bộ dữ liệu");
      }
    }
  }
});

content.addEventListener("submit",function(e){
  e.preventDefault();
  var f=e.target,fd;
  if(f.id==="svForm"){
    fd=new FormData(f);
    var obj={maSV:String(fd.get("maSV")).trim(),hoTen:String(fd.get("hoTen")).trim(),gioiTinh:fd.get("gioiTinh"),lop:fd.get("lop"),email:String(fd.get("email")).trim(),sdt:String(fd.get("sdt")).trim()};
    var editing=state.editingId;
    mutate(function(){return editing?api("PUT","/api/students/"+encodeURIComponent(editing),obj):api("POST","/api/students",obj);},
      editing?"Đã cập nhật thông tin":"Đã thêm sinh viên mới",function(){state.showForm=false;state.editingId=null;renderStudents();});
    return;
  }
  if(f.id==="scoreForm"){
    var cur=state.students.find(function(x){return x.maSV===state.scoreStudentId;});if(!cur)return;
    var nd=[],bad=null;
    state.subjects.forEach(function(m){
      var q=f.elements["qt_"+m.id],c=f.elements["thi_"+m.id];if(!q||!c)return;
      var qv=q.value.trim(),cv=c.value.trim();
      if(qv===""&&cv==="")return;
      if(qv===""||cv===""||isNaN(+qv)||isNaN(+cv)||+qv<0||+qv>10||+cv<0||+cv>10){if(!bad)bad={m:m,el:qv===""||isNaN(+qv)||+qv<0||+qv>10?q:c};return;}
      nd.push({subjId:m.id,qt:+qv,thi:+cv});
    });
    if(bad){toast("Môn “"+bad.m.ten+"”: cần nhập đủ cả hai điểm (0–10) hoặc để trống cả hai.",true);bad.el.focus();return;}
    mutate(function(){return api("PUT","/api/students/"+encodeURIComponent(cur.maSV)+"/scores",{diem:nd});},"Đã lưu điểm - GPA đã cập nhật",renderScores);
    return;
  }
  if(f.id==="termForm"){
    fd=new FormData(f);var tb={ten:String(fd.get("tenHK")).trim(),nam:String(fd.get("namHoc")).trim()},eid=state.editingTermId;
    mutate(function(){return eid?api("PUT","/api/terms/"+encodeURIComponent(eid),tb):api("POST","/api/terms",tb);},
      eid?"Đã cập nhật học kỳ":"Đã thêm học kỳ mới",function(){state.showTermForm=false;state.editingTermId=null;renderTerms();});
    return;
  }
  if(f.classList.contains("monForm")){
    fd=new FormData(f);var mb={ten:String(fd.get("tenMon")).trim(),tc:parseInt(fd.get("soTC"),10),termId:f.getAttribute("data-termid")};
    mutate(function(){return api("POST","/api/subjects",mb);},"Đã thêm môn “"+mb.ten+"”",renderTerms);
    return;
  }
  if(f.classList.contains("subjEditForm")){
    fd=new FormData(f);var sb={ten:String(fd.get("tenMon")).trim(),tc:parseInt(fd.get("soTC"),10)},sj=f.getAttribute("data-id");
    mutate(function(){return api("PUT","/api/subjects/"+encodeURIComponent(sj),sb);},"Đã cập nhật môn học",function(){state.editingSubjId=null;renderTerms();});
    return;
  }
  if(f.id==="classForm"){
    fd=new FormData(f);var cb={ma:String(fd.get("ma")).trim(),khoa:String(fd.get("khoa")).trim()};
    mutate(function(){return api("POST","/api/classes",cb);},"Đã thêm lớp "+cb.ma.toUpperCase(),renderClasses);
    return;
  }
  if(f.id==="profileForm"){
    fd=new FormData(f);var pb={trangThai:fd.get("trangThai")};
    PROFILE_FIELDS.forEach(function(x){pb[x[0]]=String(fd.get(x[0])||"").trim();});
    var pma=state.profileId;
    mutate(function(){return api("PUT","/api/students/"+encodeURIComponent(pma)+"/profile",pb);},"Đã lưu hồ sơ",renderProfile);
    return;
  }
  if(f.id==="familyForm"){
    var fam=readFamilyForm(false),fma=state.profileId;
    if(fam.length>FAMILY_MAX){toast("Tối đa "+FAMILY_MAX+" thân nhân.",true);return;}
    mutate(function(){return api("PUT","/api/students/"+encodeURIComponent(fma)+"/family",{family:fam});},"Đã lưu thông tin thân nhân",renderProfile);
    return;
  }
  if(f.id==="reqForm"){
    fd=new FormData(f);var ch={};
    Object.keys(REQ_LABEL).forEach(function(k){var v=String(fd.get(k)||"").trim();if(v)ch[k]=v;});
    if(!Object.keys(ch).length){toast("Hãy điền ít nhất một thông tin cần cập nhật.",true);return;}
    mutate(function(){return api("POST","/api/profile-requests",{changes:ch,lyDo:String(fd.get("lyDo")||"").trim()});},"Đã gửi yêu cầu, chờ cán bộ duyệt",renderProfile);
    return;
  }
  if(f.id==="drlForm"){
    var cap=f.getAttribute("data-cap"),dma=f.getAttribute("data-ma"),items={},ins=f.querySelectorAll('input[name^="drl_"]');
    if(!cap)return;
    for(var i=0;i<ins.length;i++)items[ins[i].name.slice(4)]=parseInt(ins[i].value,10);
    var db={items:items};if(f.elements.ghiChu)db.ghiChu=f.elements.ghiChu.value.trim();
    var path={sv:"self",lop:"class",khoa:"faculty"}[cap];
    mutate(function(){return api("PUT","/api/drl/"+encodeURIComponent(dma)+"/"+encodeURIComponent(state.drlTerm)+"/"+path,db);},
      {sv:"Đã nộp phiếu tự đánh giá",lop:"Đã lưu đánh giá của lớp",khoa:"Đã duyệt phiếu rèn luyện"}[cap],renderDrl);
    return;
  }
  if(f.id==="userForm"){
    fd=new FormData(f);
    var ub={username:String(fd.get("username")).trim(),fullName:String(fd.get("fullName")).trim(),role:fd.get("role"),password:String(fd.get("password"))};
    if(ub.role==="student")ub.maSV=fd.get("maSV");
    mutate(function(){return api("POST","/api/users",ub);},"Đã tạo tài khoản “"+ub.username.toLowerCase()+"”",renderUsers);
    return;
  }
});

el("yr").textContent=new Date().getFullYear();
(async function boot(){
  try{var r=await api("GET","/api/me");await enter(r.user);}
  catch(e){if(e.status===0){showOnly("authScreen");el("loginErr").textContent=e.message;el("loginErr").hidden=false;}else showLogin();}
})();
})();
