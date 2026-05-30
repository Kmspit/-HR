/**
 * hr-core.js — เค เอ็ม เซอร์วิส พลัส shared utilities
 * Include this script in every page: <script src="hr-core.js"></script>
 */

// ── USER / RBAC ──────────────────────────────────────────────────────────────

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('hrflow_user')) || null; }
  catch { return null; }
}

function requireLogin() {
  if (!getCurrentUser()) window.location.href = 'login.html';
}

/**
 * Call once per page. Reads localStorage role and:
 * - Shows/hides elements with class role-manager, role-admin, role-employee, role-lawyer
 * - Updates sidebar user card name/role text
 * - Highlights active nav item based on current filename
 */
function initRole() {
  requireLogin();
  const user = getCurrentUser();
  if (!user) return;

  // Update sidebar user card
  const nameEl = document.querySelector('.user-name');
  const roleEl = document.querySelector('.user-role');
  const roleLabelMap = {
    MANAGER_HR: 'ผู้จัดการ / HR',
    ADMIN:      'Admin',
    EMPLOYEE:   'พนักงาน',
    LAWYER:     'ทนายความ',
  };
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = (roleLabelMap[user.role] || user.role) + (user.dept ? ' · ' + user.dept : '');

  // Show/hide role-gated elements
  const allRoleEls = document.querySelectorAll('[class*="role-only"]');
  allRoleEls.forEach(el => {
    const show =
      (el.classList.contains('role-manager-only') && user.role === 'MANAGER_HR') ||
      (el.classList.contains('role-admin-only')   && (user.role === 'ADMIN' || user.role === 'MANAGER_HR')) ||
      (el.classList.contains('role-employee-only') && user.role === 'EMPLOYEE') ||
      (el.classList.contains('role-lawyer-only')  && user.role === 'LAWYER') ||
      (el.classList.contains('role-hr-admin-only') && (user.role === 'MANAGER_HR' || user.role === 'ADMIN'));
    el.style.display = show ? '' : 'none';
  });

  // Active nav
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.classList.toggle('active', href === page);
  });
}

// ── MOCK LINE NOTIFICATION ────────────────────────────────────────────────────

function mockLineNotify(message, recipient = 'ทุกคน') {
  const box = document.createElement('div');
  box.style.cssText = `
    position: fixed; bottom: 80px; right: 20px; z-index: 9999;
    background: #06C755; color: #fff; border-radius: 14px;
    padding: 14px 18px; max-width: 320px; font-size: 13px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: slideInRight 0.35s ease;
  `;
  box.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="font-size:18px;">💬</span>
      <strong>LINE OA — แจ้งเตือน</strong>
    </div>
    <div style="margin-bottom:4px; opacity:0.85;">ถึง: ${recipient}</div>
    <div style="border-top:1px solid rgba(255,255,255,0.3); padding-top:8px; line-height:1.6;">${message}</div>
  `;
  document.body.appendChild(box);
  setTimeout(() => { box.style.opacity = '0'; box.style.transition = 'opacity 0.4s'; setTimeout(() => box.remove(), 400); }, 4000);
}

// ── LOCAL STORAGE HELPERS ─────────────────────────────────────────────────────

function lsGet(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem('hrflow_' + key)) ?? fallback; }
  catch { return fallback; }
}

function lsSet(key, value) {
  localStorage.setItem('hrflow_' + key, JSON.stringify(value));
}

function getCompanySettings() {
  return lsGet('settings', {
    companyName: 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
    lat: 13.7563, lng: 100.5018, radius: 200,
    workStart: '08:00', workEnd: '17:00', lateGrace: 15,
    sickDays: 30, vacDays: 10, personalDays: 3,
    lineToken: '',
  });
}

function getEmployees() {
  return lsGet('employees', [
    { id: 'e1', name: 'สมหญิง ประสาน', email: 'manager@demo.com', role: 'MANAGER_HR', dept: 'HR',        sso: 'IN_SSO',  lineId: '',  isCoworker: false, baseSalary: 45000 },
    { id: 'e2', name: 'สมชาย อนุมัติ',  email: 'admin@demo.com',   role: 'ADMIN',      dept: 'IT',        sso: 'IN_SSO',  lineId: '',  isCoworker: false, baseSalary: 35000 },
    { id: 'e3', name: 'มานี รักงาน',    email: 'employee@demo.com', role: 'EMPLOYEE',   dept: 'Marketing', sso: 'IN_SSO',  lineId: '',  isCoworker: false, baseSalary: 25000 },
    { id: 'e4', name: 'วิชัย กฎหมาย',  email: 'lawyer@demo.com',   role: 'LAWYER',     dept: 'Legal',     sso: 'OUT_SSO', lineId: '',  isCoworker: false, baseSalary: 50000 },
    { id: 'e5', name: 'ปิยะ ฟรีแลนซ์', email: 'cowork@demo.com',   role: 'EMPLOYEE',   dept: 'Design',    sso: 'OUT_SSO', lineId: '',  isCoworker: true,  baseSalary: 20000 },
  ]);
}

function getLeaveRequests() { return lsGet('leaves', []); }
function getWarnings()      { return lsGet('warnings', []); }
function getAnnouncements() { return lsGet('announcements', []); }
function getWeeklyPlans()   { return lsGet('weeklyPlans', []); }
function getAttendances()   { return lsGet('attendances', []); }

// ── DATE / FORMAT HELPERS ──────────────────────────────────────────────────────

function thDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function thTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function roleBadge(role) {
  const map = {
    MANAGER_HR: '<span class="tag blue">ผู้จัดการ/HR</span>',
    ADMIN:      '<span class="tag purple">Admin</span>',
    EMPLOYEE:   '<span class="tag">พนักงาน</span>',
    LAWYER:     '<span class="tag yellow">ทนายความ</span>',
  };
  return map[role] || `<span class="tag">${role}</span>`;
}

// ── CSS ANIMATION (injected once) ─────────────────────────────────────────────
(function injectCoreStyles() {
  if (document.getElementById('hrcore-style')) return;
  const s = document.createElement('style');
  s.id = 'hrcore-style';
  s.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55);
      z-index: 1000; display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.2s ease;
    }
    .modal-box {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--r2); padding: 28px; width: 520px; max-width: 95vw;
      max-height: 90vh; overflow-y: auto;
      animation: slideUp 0.25s ease;
    }
    .modal-box h3 { margin: 0 0 20px; font-size: 17px; }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .tab-bar { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
    .tab-btn {
      padding: 8px 16px; border: none; background: transparent;
      color: var(--text3); font-size: 13px; cursor: pointer;
      border-bottom: 2px solid transparent; transition: all 0.2s;
    }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
  `;
  document.head.appendChild(s);
})();

// ── MODAL HELPERS ──────────────────────────────────────────────────────────────

function openModal(html, onClose) {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `<div class="modal-box">${html}</div>`;
  bd.addEventListener('click', e => { if (e.target === bd) { bd.remove(); if (onClose) onClose(); } });
  document.body.appendChild(bd);
  return bd;
}

function closeModal(bd) { if (bd) bd.remove(); }

// ── CLOUDINARY UPLOAD ─────────────────────────────────────────────────────────

function _dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const raw = atob(parts[1]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Uploads a dataURL to Cloudinary using an unsigned upload preset.
 * Settings required: cloudinaryCloud, cloudinaryPreset
 * Returns Cloudinary response JSON ({ secure_url, public_id, ... }) or throws.
 */
async function uploadToCloudinary(dataUrl, opts) {
  const s = getCompanySettings();
  const cloud = (s.cloudinaryCloud || '').trim();
  const preset = (s.cloudinaryPreset || '').trim();
  if (!cloud || !preset) throw new Error('Cloudinary ยังไม่ได้ตั้งค่า (cloud name / upload preset)');
  const fd = new FormData();
  fd.append('file', _dataUrlToBlob(dataUrl), 'face.jpg');
  fd.append('upload_preset', preset);
  if (opts && opts.folder) fd.append('folder', opts.folder);
  if (opts && opts.tags)   fd.append('tags', opts.tags);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + encodeURIComponent(cloud) + '/image/upload', {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '' + res.status);
    throw new Error('Cloudinary ' + res.status + ': ' + txt);
  }
  return await res.json();
}

// ── LINE OA NOTIFICATION ───────────────────────────────────────────────────────

const _LINE_QUEUE_KEY = 'lineNotifyQueue';

/**
 * Builds the Thai attendance notification message per the LINE OA template.
 */
function buildLineAttMsg(d) {
  return '\nพนักงานลงเวลาแล้ว\n\n' +
    'ชื่อ: ' + d.employeeName + '\n' +
    'รหัส: ' + d.employeeCode + '\n' +
    'ประเภท: ' + d.scanType + '\n\n' +
    'วันที่: ' + d.date + '\n' +
    'เวลา: ' + d.time + '\n\n' +
    'มาสาย: ' + d.lateStatus + '\n\n' +
    'สาขา: ' + d.branch + '\n' +
    'แผนก: ' + d.department + '\n\n' +
    'สถานที่:\n' + d.location;
}

/**
 * Sends a LINE notification.
 * Tries: (1) configured webhook relay (avoids browser CORS), (2) LINE Notify direct.
 * Returns { ok: boolean, reason: string }.
 */
async function sendLineOAMsg(message, imageUrl) {
  const s = getCompanySettings();
  const token = (s.lineToken || '').trim();
  const relay = (s.lineWebhookRelay || '').trim();

  // 1. Webhook relay (user-hosted serverless/proxy — no CORS issue)
  if (relay) {
    try {
      const res = await fetch(relay, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, message, imageUrl: imageUrl || null }),
      });
      if (res.ok) return { ok: true };
    } catch {}
  }

  // 2. LINE Notify direct (works in some environments; may be CORS-blocked in others)
  if (token) {
    const fd = new FormData();
    fd.append('message', message);
    if (imageUrl) {
      fd.append('imageFullsize', imageUrl);
      fd.append('imageThumbnail', imageUrl);
    }
    try {
      const res = await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd,
      });
      if (res.ok) return { ok: true };
      return { ok: false, reason: 'line_' + res.status };
    } catch (err) {
      return { ok: false, reason: (err && err.message) || 'network_error' };
    }
  }

  return { ok: false, reason: 'no_config' };
}

/** Saves a failed notification to the offline retry queue. */
function queueLineNotification(item) {
  const q = lsGet(_LINE_QUEUE_KEY, []);
  q.push(Object.assign({}, item, { queuedAt: new Date().toISOString(), retries: 0 }));
  lsSet(_LINE_QUEUE_KEY, q);
}

/** Retries all queued notifications. Call on 'online' event. */
async function flushLineQueue() {
  const q = lsGet(_LINE_QUEUE_KEY, []);
  if (!q.length) return;
  const remaining = [];
  for (const item of q) {
    if ((item.retries || 0) >= 5) continue; // discard after 5 attempts
    const result = await sendLineOAMsg(item.message, item.imageUrl || null);
    if (!result.ok) remaining.push(Object.assign({}, item, { retries: (item.retries || 0) + 1 }));
  }
  lsSet(_LINE_QUEUE_KEY, remaining);
}
