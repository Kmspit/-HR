// ── CLOCK + DATE ──
const _DAY_NAMES=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const _MONTH_NAMES=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function tick(){
  const n=new Date();
  const clockEl=document.getElementById('clock');
  if(clockEl) clockEl.textContent=n.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const dateEl=document.getElementById('datestr');
  if(dateEl) dateEl.textContent=_DAY_NAMES[n.getDay()]+'ที่ '+n.getDate()+' '+_MONTH_NAMES[n.getMonth()]+' '+(n.getFullYear()+543);
}
tick();setInterval(tick,1000);

// ── GREETING ──
(function(){
  const h=new Date().getHours();
  const greet=h<12?'สวัสดีตอนเช้า':h<17?'สวัสดีตอนบ่าย':'สวัสดีตอนเย็น';
  const el=document.querySelector('.hero-text h2');
  if(!el) return;
  const user=typeof getCurrentUser==='function'?getCurrentUser():null;
  const name=user?user.name:'คุณสมหญิง';
  el.textContent=greet+', '+name+' 👋';
})();

function updateDashWorkTimer(){
  const wrap=document.getElementById('dash-work-timer');
  const labelEl=document.getElementById('dash-work-timer-label');
  const valEl=document.getElementById('dash-work-timer-value');
  if(!wrap||!labelEl||!valEl) return;
  const user=typeof getCurrentUser==='function'?getCurrentUser():null;
  const rec=user&&typeof getTodaySessionForUser==='function'?getTodaySessionForUser(user):null;
  if(!rec?.checkIn){ wrap.style.display='none'; return; }
  const s=typeof calcWorkTimeSummary==='function'?calcWorkTimeSummary(rec):null;
  if(!s){ wrap.style.display='none'; return; }
  wrap.style.display='block';
  labelEl.textContent=s.timerLabel;
  valEl.textContent=typeof formatDurationMinutes==='function'?formatDurationMinutes(s.timerMinutes):s.timerMinutes+' นาที';
  valEl.style.color=s.workPhase==='lunch_break'?'var(--orange)':s.workPhase==='checked_out'?'var(--accent)':'var(--green)';
}
updateDashWorkTimer();
setInterval(updateDashWorkTimer,30000);

function setActive(el,title){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('page-title').innerHTML=title+' <span class="topbar-subtitle">/ ภาพรวม</span>';
  closeSidebar();
}

// ── BAR CHART ──
const days=['จ','อ','พ','พฤ','ศ','ส','อา'];
const data=[
  [210,10,8,5],[198,14,12,8],[222,8,6,12],[215,12,10,6],
  [205,18,14,4],[198,20,16,7],[221,15,12,9]
];
const maxVal=250;
const chartEl=document.getElementById('chart');
data.forEach((d,i)=>{
  const g=document.createElement('div');
  g.className='bar-group';
  const total=d.reduce((a,b)=>a+b,0);
  const colors=['var(--accent)','var(--yellow)','var(--red)','var(--purple)'];
  const stack=document.createElement('div');
  stack.style.cssText='width:100%;display:flex;flex-direction:column-reverse;border-radius:4px;overflow:hidden;height:'+(total/maxVal*130)+'px';
  d.forEach((v,j)=>{
    const b=document.createElement('div');
    b.className='bar-stack';
    b.style.cssText='height:'+(v/total*100)+'%;background:'+colors[j]+';opacity:'+(j===0?.9:.75);
    stack.appendChild(b);
  });
  g.innerHTML='';
  g.appendChild(stack);
  const lbl=document.createElement('div');
  lbl.className='bar-label';
  lbl.textContent=days[i];
  g.appendChild(lbl);
  chartEl.appendChild(g);
});

// ── MINI CALENDAR ──
const CAL_HEADS=['อา','จ','อ','พ','พฤ','ศ','ส'];
let _calYear=new Date().getFullYear(), _calMonth=new Date().getMonth();

function renderMiniCal(year,month){
  const grid=document.getElementById('cal-grid');
  const monthLabel=document.querySelector('.cal-month');
  if(!grid) return;
  grid.innerHTML='';
  CAL_HEADS.forEach(h=>{
    const d=document.createElement('div');d.className='cal-head';d.textContent=h;grid.appendChild(d);
  });
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const prevDays=new Date(year,month,0).getDate();
  const today=new Date();
  const isCurMonth=today.getFullYear()===year&&today.getMonth()===month;
  for(let i=0;i<firstDay;i++){
    const d=document.createElement('div');d.className='cal-day other-month';
    d.textContent=prevDays-firstDay+i+1;grid.appendChild(d);
  }
  for(let d=1;d<=daysInMonth;d++){
    const el=document.createElement('div');
    el.className='cal-day'+(isCurMonth&&d===today.getDate()?' today':'');
    if([1,5,8,12,15,19,22].includes(d)) el.classList.add('has-event');
    if([3,10,17,24].includes(d)) el.classList.add('has-leave');
    el.textContent=d;grid.appendChild(el);
  }
  if(monthLabel) monthLabel.textContent=_MONTH_NAMES[month]+' '+(year+543);
}
renderMiniCal(_calYear,_calMonth);

document.addEventListener('DOMContentLoaded',function(){
  const btns=document.querySelectorAll('.cal-btn');
  if(btns[0]) btns[0].addEventListener('click',function(){
    _calMonth--;if(_calMonth<0){_calMonth=11;_calYear--;}
    renderMiniCal(_calYear,_calMonth);
  });
  if(btns[1]) btns[1].addEventListener('click',function(){
    _calMonth++;if(_calMonth>11){_calMonth=0;_calYear++;}
    renderMiniCal(_calYear,_calMonth);
  });
});

// ── APPROVE / REJECT ──
function approve(btn){
  const row=btn.closest('.leave-row');
  const name=(row.querySelector('.leave-name')||{}).textContent||'พนักงาน';
  const tag=(row.querySelector('.tag')||{}).textContent||'ลา';
  const dates=(row.querySelector('.leave-dates')||{}).textContent||'';
  row.style.opacity='.4';row.style.pointerEvents='none';
  btn.textContent='✓ อนุมัติแล้ว';btn.style.background='rgba(16,185,129,.3)';
  // ส่ง LINE notification จริง
  if(typeof sendLineOAMsg==='function') {
    sendLineOAMsg('✅ HR อนุมัติใบลา\nพนักงาน: '+name+'\nประเภท: '+tag+'\n'+dates, null).catch(()=>{});
  }
  pushNotification({ icon:'✅', title:'อนุมัติใบลา '+name, body:tag+' '+dates, link:'leave.html' });
  setTimeout(()=>row.remove(),1200);
}
function reject(btn){
  const row=btn.closest('.leave-row');
  const name=(row.querySelector('.leave-name')||{}).textContent||'พนักงาน';
  row.style.opacity='.4';row.style.pointerEvents='none';
  if(typeof sendLineOAMsg==='function') {
    sendLineOAMsg('❌ HR ไม่อนุมัติใบลาของ '+name, null).catch(()=>{});
  }
  pushNotification({ icon:'❌', title:'ไม่อนุมัติใบลา '+name, body:'', link:'leave.html' });
  setTimeout(()=>row.remove(),800);
}

// ── NOTIFICATION SYSTEM ──
const _NOTIF_KEY = 'hrflow_notifications';
function getNotifications() { return (typeof lsGet==='function')?lsGet('notifications',[]):JSON.parse(localStorage.getItem('hrflow_notifications')||'[]'); }
function saveNotifications(n) { if(typeof lsSet==='function') lsSet('notifications',n); else localStorage.setItem('hrflow_notifications',JSON.stringify(n)); }
function pushNotification(item) {
  const list=getNotifications();
  list.unshift({ id:Date.now().toString(36), ...item, read:false, createdAt:new Date().toISOString() });
  saveNotifications(list.slice(0,50));
  renderNotifDot();
}
function renderNotifDot() {
  const unread=getNotifications().filter(n=>!n.read).length;
  const dot=document.getElementById('notif-dot');
  if(dot) dot.style.display=unread>0?'block':'none';
}
function renderNotifList() {
  const list=getNotifications();
  const el=document.getElementById('notif-list');
  if(!el) return;
  if(!list.length){ el.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">ไม่มีการแจ้งเตือน</div>'; return; }
  el.innerHTML=list.slice(0,20).map(n=>`
    <div onclick="openNotifItem('${n.id}')" style="padding:10px 16px;cursor:pointer;background:${n.read?'':'rgba(59,130,246,.06)'};border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start;">
      <span style="font-size:18px;flex-shrink:0;">${n.icon||'🔔'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:${n.read?'400':'600'};color:var(--text);">${escapeHtmlDash(n.title)}</div>
        ${n.body?`<div style="font-size:11px;color:var(--text3);margin-top:2px;">${escapeHtmlDash(n.body)}</div>`:''}
        <div style="font-size:10px;color:var(--text3);margin-top:3px;">${thDate&&thDate(n.createdAt)||n.createdAt}</div>
      </div>
    </div>`).join('');
}
function escapeHtmlDash(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function openNotifItem(id) {
  const list=getNotifications();
  const n=list.find(x=>x.id===id);
  if(!n) return;
  n.read=true;
  saveNotifications(list);
  renderNotifDot();
  renderNotifList();
  if(n.link) window.location.href=n.link;
}
function markAllNotifRead() {
  const list=getNotifications().map(n=>({...n,read:true}));
  saveNotifications(list);
  renderNotifDot();
  renderNotifList();
}
function toggleNotifPanel() {
  const panel=document.getElementById('notif-panel');
  if(!panel) return;
  const visible=panel.style.display==='block';
  panel.style.display=visible?'none':'block';
  if(!visible) renderNotifList();
}
document.addEventListener('click', function(e) {
  const panel=document.getElementById('notif-panel');
  const bell=document.getElementById('notif-bell');
  if(panel&&panel.style.display==='block'&&!panel.contains(e.target)&&!bell.contains(e.target)) {
    panel.style.display='none';
  }
});

// ── MODAL LOGIC ──
let camStream = null;
function showCheckin(){
  document.getElementById('checkin-modal').style.display = 'flex';
  startCamera();
}

async function startCamera() {
  const video = document.getElementById('video-feed');
  const status = document.getElementById('checkin-face-status');
  if (status) status.textContent = '';
  try {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    }
    video.srcObject = camStream;
    await video.play().catch(() => {});
    if (typeof FaceCore !== 'undefined') FaceCore.loadModels().catch(() => {});
  } catch (err) {
    console.error("Error accessing camera:", err);
    alert("ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการเข้าถึง");
  }
}

// Real face verification on the dashboard, then route to the authoritative
// check-in page (attendance.html) which owns GPS + record keeping.
async function verifyAndCheckin() {
  const video = document.getElementById('video-feed');
  const status = document.getElementById('checkin-face-status');
  const btn = document.getElementById('checkin-verify-btn');
  if (!video?.srcObject) { alert('เปิดกล้องก่อน'); return; }
  if (typeof FaceCore === 'undefined') { window.location.href = 'attendance.html'; return; }

  btn.disabled = true;
  const setMsg = (t, c) => { status.textContent = t; status.style.color = c || 'var(--text2)'; };
  try {
    setMsg('⏳ กำลังเตรียมระบบ...', 'var(--text2)');
    await FaceCore.loadModels();

    setMsg('กำลังตรวจสอบคุณภาพภาพ...', 'var(--text2)');
    const quality = await FaceCore.assessQuality(video);
    if (!quality.ok) { setMsg('⚠ ' + quality.message, 'var(--orange)'); return; }

    setMsg('กำลังเทียบใบหน้า...', 'var(--text2)');
    const still = FaceCore.captureStill(video, { quality: 0.92 });
    const empId = FaceCore.getCurrentEmployeeId();
    const result = await FaceCore.matchFace(empId, still.canvas, {
      capturedImage: FaceCore.thumbnail(still.canvas, 128, 0.6),
    });

    if (result.decision === 'accept' || result.userConfirmed) {
      setMsg('✓ ยืนยันตัวตนสำเร็จ — กำลังไปหน้าลงเวลา...', 'var(--green)');
      setTimeout(() => { window.location.href = 'attendance.html'; }, 700);
    } else if (result.decision === 'confirm') {
      setMsg(`⚠ ${result.message}`, 'var(--orange)');
      if (confirm('ความมั่นใจปานกลาง — ยืนยันการลงเวลาและไปหน้าลงเวลาหรือไม่?')) {
        window.location.href = 'attendance.html';
      }
    } else if (result.reason === 'not_registered') {
      setMsg('ยังไม่ได้ลงทะเบียนใบหน้า — ไปลงทะเบียนที่หน้าตั้งค่า', 'var(--orange)');
      if (confirm('ยังไม่ได้ลงทะเบียนใบหน้า ต้องการไปหน้าตั้งค่าเพื่อลงทะเบียนหรือไม่?')) {
        window.location.href = 'settings.html#face';
      }
    } else {
      setMsg('✕ ' + result.message + ' — กรุณาสแกนใหม่', 'var(--red)');
    }
  } catch (err) {
    console.error('verify error', err);
    setMsg('เกิดข้อผิดพลาด: ' + (err?.message || err), 'var(--red)');
  } finally {
    btn.disabled = false;
  }
}

function closeCheckinModal() {
  document.getElementById('checkin-modal').style.display = 'none';
  const status = document.getElementById('checkin-face-status');
  if (status) status.textContent = '';
  if (camStream) {
    camStream.getTracks().forEach(track => track.stop());
  }
}

// init
if (typeof initRole === 'function') initRole();
renderNotifDot();
// push welcome notification for pending items
(function() {
  const leaves = (typeof getLeaveRequests === 'function') ? getLeaveRequests().filter(r => r.status === 'PENDING') : [];
  if (leaves.length) pushNotification({ icon: '📅', title: `ใบลารออนุมัติ ${leaves.length} รายการ`, body: '', link: 'leave.html' });
})();