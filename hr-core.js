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

/** Escape HTML for safe innerHTML interpolation */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Redirect non-HR users away from HR-only pages (payroll, reports, etc.) */
function requireHrAdmin() {
  requireLogin();
  const user = getCurrentUser();
  if (!user) return;
  if (user.role !== 'MANAGER_HR' && user.role !== 'ADMIN') {
    alert('ไม่มีสิทธิ์เข้าถึงหน้านี้');
    window.location.href = 'index.html';
  }
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

  injectSkipLink();
  tagMainContent();

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

  // Show/hide role-gated elements — toggle .role-visible so CSS fallback works
  const allRoleEls = document.querySelectorAll('[class*="role-only"]');
  allRoleEls.forEach(el => {
    const show =
      (el.classList.contains('role-manager-only') && user.role === 'MANAGER_HR') ||
      (el.classList.contains('role-admin-only')   && (user.role === 'ADMIN' || user.role === 'MANAGER_HR')) ||
      (el.classList.contains('role-employee-only') && user.role === 'EMPLOYEE') ||
      (el.classList.contains('role-lawyer-only')  && user.role === 'LAWYER') ||
      (el.classList.contains('role-hr-admin-only') && (user.role === 'MANAGER_HR' || user.role === 'ADMIN'));
    el.classList.toggle('role-visible', show);
  });

  initSidebar();
}

// ── SIDEBAR (nav config + accordion + collapse + mobile slide) ───────────────

function injectSkipLink() {
  if (document.getElementById('skip-to-content')) return;
  const a = document.createElement('a');
  a.id = 'skip-to-content';
  a.href = '#main-content';
  a.className = 'skip-link';
  a.textContent = 'ข้ามไปเนื้อหาหลัก';
  document.body.insertBefore(a, document.body.firstChild);
}

function tagMainContent() {
  const main = document.querySelector('main.content') || document.querySelector('.content');
  if (main && !main.id) main.id = 'main-content';
}

const SIDEBAR_COLLAPSED_KEY = 'hrflow_sidebar_collapsed';
const SIDEBAR_SECTIONS_KEY = 'hrflow_nav_sections';
const SIDEBAR_MOBILE_BP = 768;
let _sidebarResizeTimer = null;

/** @type {{ id: string, label: string, collapsible?: boolean, sectionRoles?: string[], items: { href: string, icon: string, label: string, roles?: string[] }[] }[]} */
const SIDEBAR_NAV = [
  {
    id: 'main',
    label: 'หลัก',
    collapsible: false,
    items: [
      { href: 'index.html', icon: '📊', label: 'แดชบอร์ด' },
    ],
  },
  {
    id: 'work',
    label: 'การทำงาน',
    collapsible: true,
    items: [
      { href: 'attendance.html', icon: '⏱️', label: 'ลงเวลางาน' },
      { href: 'attendance-history.html', icon: '📋', label: 'บันทึกลงเวลารายเดือน' },
      { href: 'attendance.html#scan-history', icon: '📸', label: 'ประวัติสแกนใบหน้า' },
      { href: 'calendar.html', icon: '🗓️', label: 'ปฏิทิน' },
      { href: 'leave.html', icon: '📅', label: 'ขอหยุด' },
      { href: 'out-of-office.html', icon: '🚗', label: 'ออกนอกสถานที่' },
      { href: 'calendar.html?view=week', icon: '📆', label: 'แผนงานสัปดาห์' },
    ],
  },
  {
    id: 'hr',
    label: 'HR จัดการ',
    collapsible: true,
    sectionRoles: ['MANAGER_HR', 'ADMIN'],
    items: [
      { href: 'employees.html', icon: '👥', label: 'พนักงาน', roles: ['hr-admin'] },
      { href: 'settings.html#branches', icon: '🏢', label: 'จัดการสาขา', roles: ['admin'] },
      { href: 'employees.html#departments', icon: '🏛️', label: 'ฝ่าย/แผนก/ส่วนงาน', roles: ['hr-admin'] },
      { href: 'payroll.html', icon: '💰', label: 'เงินเดือน', roles: ['hr-admin'] },
      { href: 'reports.html', icon: '📈', label: 'รายงานรายเดือน', roles: ['hr-admin'] },
      { href: 'payslip.html', icon: '🧾', label: 'สลิปเงินเดือน', roles: ['hr-admin'] },
      { href: 'leave.html#approve', icon: '✅', label: 'อนุมัติ', roles: ['hr-admin'] },
    ],
  },
  {
    id: 'comm',
    label: 'สื่อสาร',
    collapsible: true,
    items: [
      { href: 'announcements.html', icon: '📢', label: 'ประกาศ' },
      { href: 'rules.html', icon: '📄', label: 'เอกสาร' },
      { href: 'warnings.html', icon: '🔔', label: 'แจ้งเตือน' },
    ],
  },
  {
    id: 'system',
    label: 'ระบบ',
    collapsible: true,
    items: [
      { href: 'settings.html', icon: '⚙️', label: 'ตั้งค่าระบบ', roles: ['hr-admin'] },
      { href: 'settings.html#permissions', icon: '🔐', label: 'สิทธิ์การใช้งาน', roles: ['admin'] },
      { href: 'line-oa.html', icon: '💬', label: 'LINE OA', roles: ['admin'] },
      { href: 'settings.html#profile', icon: '👤', label: 'โปรไฟล์' },
      { href: 'manual.html', icon: '📖', label: 'คู่มือการใช้งาน' },
    ],
  },
];

function navRoleClass(roles) {
  if (!roles || !roles.length) return '';
  if (roles.includes('admin')) return 'role-admin-only';
  if (roles.includes('hr-admin')) return 'role-hr-admin-only';
  if (roles.includes('manager')) return 'role-manager-only';
  if (roles.includes('employee')) return 'role-employee-only';
  if (roles.includes('lawyer')) return 'role-lawyer-only';
  return '';
}

function navItemMatchesRole(el, user) {
  if (!user) return true;
  const hasGate = el.classList.contains('role-manager-only') ||
    el.classList.contains('role-admin-only') ||
    el.classList.contains('role-employee-only') ||
    el.classList.contains('role-lawyer-only') ||
    el.classList.contains('role-hr-admin-only');
  if (!hasGate) return true;
  return (
    (el.classList.contains('role-manager-only') && user.role === 'MANAGER_HR') ||
    (el.classList.contains('role-admin-only') && (user.role === 'ADMIN' || user.role === 'MANAGER_HR')) ||
    (el.classList.contains('role-employee-only') && user.role === 'EMPLOYEE') ||
    (el.classList.contains('role-lawyer-only') && user.role === 'LAWYER') ||
    (el.classList.contains('role-hr-admin-only') && (user.role === 'MANAGER_HR' || user.role === 'ADMIN'))
  );
}

function sectionMatchesRole(section, user) {
  if (!section.sectionRoles || !section.sectionRoles.length) return true;
  if (!user) return true;
  return section.sectionRoles.includes(user.role);
}

function navHrefMatchesPage(href) {
  const page = location.pathname.split('/').pop() || 'index.html';
  const hash = location.hash || '';
  const query = location.search || '';
  const base = href.split('#')[0].split('?')[0];
  const itemHash = href.includes('#') ? '#' + href.split('#')[1].split('?')[0] : '';
  const itemQuery = href.includes('?') ? '?' + href.split('?')[1] : '';
  if (base !== page) return false;
  if (itemHash && itemHash !== hash) return false;
  if (itemQuery && itemQuery !== query) return false;
  if (!itemHash && hash && href.indexOf('#') === -1) return hash === '';
  return true;
}

function renderSidebarNav() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  const html = SIDEBAR_NAV.map(function(section) {
    const collapsible = section.collapsible !== false && section.id !== 'main';
    const sectionCls = collapsible ? ' nav-section-collapsible' : '';
    const sectionRoles = section.sectionRoles ? ' data-section-roles="' + section.sectionRoles.join(',') + '"' : '';
    const itemsHtml = section.items.map(function(item) {
      const roleCls = navRoleClass(item.roles);
      const cls = 'nav-item' + (roleCls ? ' ' + roleCls : '');
      return '<a href="' + item.href + '" class="' + cls + '" data-nav-label="' + item.label + '" aria-label="' + item.label + '">' +
        '<span class="icon">' + item.icon + '</span> ' + item.label + '</a>';
    }).join('');
    if (collapsible) {
      return '<div class="nav-section' + sectionCls + '" data-section-id="' + section.id + '"' + sectionRoles + '>' +
        '<button type="button" class="nav-section-toggle" aria-expanded="false">' +
        '<span class="nav-toggle-label">' + section.label + '</span>' +
        '<span class="nav-toggle-arrow" aria-hidden="true">▶</span></button>' +
        '<div class="nav-section-body">' + itemsHtml + '</div></div>';
    }
    return '<div class="nav-section" data-section-id="' + section.id + '">' +
      '<div class="nav-label">' + section.label + '</div>' +
      '<div class="nav-section-body">' + itemsHtml + '</div></div>';
  }).join('');
  nav.innerHTML = html;
}

function applyNavRoleVisibility(user) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(el) {
    el.style.display = navItemMatchesRole(el, user) ? '' : 'none';
  });
  SIDEBAR_NAV.forEach(function(section) {
    const secEl = document.querySelector('.nav-section[data-section-id="' + section.id + '"]');
    if (!secEl) return;
    if (!sectionMatchesRole(section, user)) {
      secEl.style.display = 'none';
      return;
    }
    const anyVisible = Array.from(secEl.querySelectorAll('.nav-item')).some(function(el) {
      return el.style.display !== 'none';
    });
    secEl.style.display = anyVisible ? '' : 'none';
  });
}

function highlightActiveNav() {
  document.querySelectorAll('.nav-item').forEach(function(a) {
    const href = a.getAttribute('href') || '';
    a.classList.toggle('active', navHrefMatchesPage(href));
  });
}

function loadNavSectionState() {
  try {
    return JSON.parse(localStorage.getItem(SIDEBAR_SECTIONS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveNavSectionState(state) {
  localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(state));
}

function setNavSectionOpen(sectionEl, open, save) {
  if (!sectionEl || !sectionEl.classList.contains('nav-section-collapsible')) return;
  sectionEl.classList.toggle('is-open', open);
  const btn = sectionEl.querySelector('.nav-section-toggle');
  const body = sectionEl.querySelector('.nav-section-body');
  if (btn) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const arrow = btn.querySelector('.nav-toggle-arrow');
    if (arrow) arrow.textContent = open ? '▼' : '▶';
  }
  if (body) body.style.maxHeight = open ? (body.scrollHeight + 'px') : '0px';
  if (save) {
    const id = sectionEl.getAttribute('data-section-id');
    if (!id) return;
    const state = loadNavSectionState();
    state[id] = open;
    saveNavSectionState(state);
  }
}

function initNavAccordion() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.dataset.accordionInit === '1') return;
  nav.dataset.accordionInit = '1';
  const saved = loadNavSectionState();
  nav.querySelectorAll('.nav-section-collapsible').forEach(function(sectionEl) {
    const id = sectionEl.getAttribute('data-section-id');
    const hasActive = !!sectionEl.querySelector('.nav-item.active');
    const open = hasActive || (id && saved[id] === true);
    setNavSectionOpen(sectionEl, open, false);
    const btn = sectionEl.querySelector('.nav-section-toggle');
    if (btn) {
      btn.addEventListener('click', function() {
        const isOpen = sectionEl.classList.contains('is-open');
        setNavSectionOpen(sectionEl, !isOpen, true);
      });
    }
  });
  nav.querySelectorAll('.nav-section:not(.nav-section-collapsible) .nav-section-body').forEach(function(body) {
    body.style.maxHeight = 'none';
  });
}

function isSidebarMobile() {
  return window.innerWidth <= SIDEBAR_MOBILE_BP;
}

function openSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  if (sb) sb.classList.add('open');
  if (ov) ov.style.display = 'block';
}

function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.style.display = 'none';
}

function updateSidebarToggleIcon() {
  const btn = document.getElementById('sidebar-toggle');
  if (!btn) return;
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  btn.textContent = collapsed ? '»' : '«';
  btn.setAttribute('aria-label', collapsed ? 'ขยายเมนู' : 'หุบเมนู');
  btn.title = collapsed ? 'ขยายเมนู' : 'หุบเมนู';
}

function applySidebarCollapsed() {
  if (isSidebarMobile()) {
    document.body.classList.remove('sidebar-collapsed');
    updateSidebarToggleIcon();
    return;
  }
  const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  updateSidebarToggleIcon();
}

function toggleSidebarCollapse() {
  if (isSidebarMobile()) return;
  const next = !document.body.classList.contains('sidebar-collapsed');
  document.body.classList.toggle('sidebar-collapsed', next);
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
  updateSidebarToggleIcon();
}

function setNavTooltips() {
  document.querySelectorAll('.nav-item').forEach(function(a) {
    const label = a.dataset.navLabel || a.textContent.replace(/\s+/g, ' ').trim();
    a.dataset.navLabel = label;
    a.title = label;
  });
}

function injectSidebarToggle() {
  if (document.getElementById('sidebar-toggle')) return;
  const logo = document.querySelector('.sidebar-logo');
  if (!logo) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'sidebar-toggle';
  btn.className = 'sidebar-toggle';
  btn.textContent = '«';
  btn.setAttribute('aria-label', 'หุบเมนู');
  btn.addEventListener('click', toggleSidebarCollapse);
  logo.appendChild(btn);
}

function onSidebarResize() {
  clearTimeout(_sidebarResizeTimer);
  _sidebarResizeTimer = setTimeout(applySidebarCollapsed, 120);
}

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  if (document.body.dataset.navRendered !== '1') {
    renderSidebarNav();
    document.body.dataset.navRendered = '1';
  }

  const user = getCurrentUser();
  applyNavRoleVisibility(user);
  highlightActiveNav();
  initNavAccordion();
  renderMobileNav();

  if (document.body.dataset.sidebarInit === '1') return;
  document.body.dataset.sidebarInit = '1';
  injectSidebarToggle();
  setNavTooltips();
  applySidebarCollapsed();
  window.addEventListener('resize', onSidebarResize);
  initManualTopbarLink();
}

var MANUAL_SECTION_BY_PAGE = {
  'index.html': 'dashboard',
  'attendance.html': 'attendance',
  'attendance-history.html': 'attendance',
  'leave.html': 'leave',
  'out-of-office.html': 'weekly-plan',
  'payroll.html': 'payroll',
  'payslip.html': 'payslip',
  'announcements.html': 'announcements',
  'employees.html': 'employees',
  'settings.html': 'settings',
  'reports.html': 'reports',
  'warnings.html': 'warnings',
  'calendar.html': 'calendar',
  'line-oa.html': 'line-oa',
  'rules.html': 'rules',
};

function manualSectionFromPage() {
  var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  return MANUAL_SECTION_BY_PAGE[path] || '';
}

function initManualTopbarLink() {
  if (/manual\.html/i.test(location.pathname)) return;
  var topbar = document.querySelector('.topbar');
  if (!topbar || topbar.querySelector('.manual-topbar-link')) return;
  var section = manualSectionFromPage();
  var href = 'manual.html' + (section ? '?section=' + encodeURIComponent(section) : '');
  var link = document.createElement('a');
  link.href = href;
  link.className = 'manual-topbar-link btn-outline';
  link.setAttribute('title', 'คู่มือการใช้งาน');
  link.innerHTML = '📖 <span class="manual-link-label">คู่มือ</span>';
  var actions = topbar.querySelector('.topbar-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'topbar-actions';
    topbar.appendChild(actions);
  }
  actions.insertBefore(link, actions.firstChild);
}

document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('sidebar')) initSidebar();
});

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
    <div style="margin-bottom:4px; opacity:0.85;">ถึง: ${escapeHtml(recipient)}</div>
    <div style="border-top:1px solid rgba(255,255,255,0.3); padding-top:8px; line-height:1.6;">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
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
  try {
    localStorage.setItem('hrflow_' + key, JSON.stringify(value));
    if (key === 'settings') _settingsCache = null;
    return true;
  } catch (e) {
    console.warn('[lsSet] localStorage write failed:', key, e);
    return false;
  }
}

// Cache parsed settings for 5 s — avoids repeated JSON.parse on every GPS tick
let _settingsCache = null;
let _settingsCacheAt = 0;

function getCompanySettings() {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < 5000) return _settingsCache;
  _settingsCache = lsGet('settings', {
    companyName: 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
    lat: 13.7563, lng: 100.5018, radius: 200,
    workStart: '08:30', workEnd: '17:30', lateGrace: 5,
    sickDays: 30, vacDays: 10, personalDays: 3,
    lineToken: '',
  });
  _settingsCacheAt = now;
  return _settingsCache;
}

function getEmployees() {
  // baseSalary ถูกลบออกจาก default — เก็บเฉพาะใน HR settings ที่ปลอดภัย
  return lsGet('employees', [
    { id: 'e1', name: 'สมหญิง ประสาน', email: 'manager@demo.com', role: 'MANAGER_HR', dept: 'HR',        sso: 'IN_SSO',  lineId: '',  isCoworker: false },
    { id: 'e2', name: 'สมชาย อนุมัติ',  email: 'admin@demo.com',   role: 'ADMIN',      dept: 'IT',        sso: 'IN_SSO',  lineId: '',  isCoworker: false },
    { id: 'e3', name: 'มานี รักงาน',    email: 'employee@demo.com', role: 'EMPLOYEE',   dept: 'Marketing', sso: 'IN_SSO',  lineId: '',  isCoworker: false },
    { id: 'e4', name: 'วิชัย กฎหมาย',  email: 'lawyer@demo.com',   role: 'LAWYER',     dept: 'Legal',     sso: 'OUT_SSO', lineId: '',  isCoworker: false },
    { id: 'e5', name: 'ปิยะ ฟรีแลนซ์', email: 'cowork@demo.com',   role: 'EMPLOYEE',   dept: 'Design',    sso: 'OUT_SSO', lineId: '',  isCoworker: true  },
  ]);
}

function getLeaveRequests() { return lsGet('leaves', []); }
function getWarnings()      { return lsGet('warnings', []); }
function getAnnouncements() { return lsGet('announcements', []); }
function getWeeklyPlans()   { return lsGet('weeklyPlans', []); }
function getAttendances()   { return lsGet('attendances', []); }

/** Sync hrflow_today_* sessions into hrflow_attendances for payroll/reports */
function syncTodaySessionsToAttendances(email, day, sessions) {
  if (!email || !Array.isArray(sessions)) return;
  const emp = getEmployees().find(function(e) { return e.email === email; });
  const user = getCurrentUser();
  const empName = (emp && emp.name) || (user && user.name) || email;
  const list = getAttendances();
  sessions.forEach(function(s) {
    if (!s.checkIn) return;
    const id = email + '_' + day + '_' + (s.sessionIndex || 1);
    const rec = {
      id: id,
      empName: empName,
      userEmail: email,
      day: day,
      checkIn: s.checkIn,
      checkOut: s.checkOut || null,
      isLate: !!s.isLate,
      lateMinutes: s.lateMinutes || 0,
      sessionIndex: s.sessionIndex || 1,
    };
    const idx = list.findIndex(function(a) { return a.id === id; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], rec);
    else list.push(rec);
  });
  lsSet('attendances', list);
}

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

/** แปลง lateMinutes เป็น "0 ชั่วโมง 15 นาที" (display only) */
function formatLateMinutes(totalMinutes) {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(m / 60);
  const mins = String(m % 60).padStart(2, '0');
  return hours + ' ชั่วโมง ' + mins + ' นาที';
}

/** ป้ายมาสายพร้อม duration เช่น "มาสาย 1 ชั่วโมง 20 นาที" */
function formatLateLabel(totalMinutes) {
  return 'มาสาย ' + formatLateMinutes(totalMinutes);
}

const LATE_WARN_THRESHOLD = 3;
const LATE_WARN_CEO = 'ท.เฉลิม (CEO)';

/** อ่านนโยบายมาสายจาก settings — ไม่ hardcode เวลา */
function getLatePolicy(settings) {
  const s = settings || getCompanySettings();
  const workStartStr = s.workStart || '08:30';
  const parts = workStartStr.split(':');
  const workH = parseInt(parts[0], 10);
  const workM = parseInt(parts[1], 10) || 0;
  const lateGrace = Math.max(0, parseInt(s.lateGrace, 10));
  const graceMin = Number.isFinite(lateGrace) ? lateGrace : 5;
  return { workStartStr, workH, workM, lateGrace: graceMin };
}

function toBangkokDate(time) {
  return new Date(new Date(time).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
}

/** เวลาสุดท้ายที่ยังไม่ถือว่าสาย = workStart + lateGrace */
function getLateDeadlineDate(time, settings) {
  const policy = getLatePolicy(settings);
  const bkk = toBangkokDate(time);
  const deadline = new Date(bkk);
  deadline.setHours(policy.workH, policy.workM, 0, 0);
  deadline.setMinutes(deadline.getMinutes() + policy.lateGrace);
  return deadline;
}

function formatLateDeadlineTime(settings) {
  const policy = getLatePolicy(settings);
  const ref = new Date();
  ref.setHours(policy.workH, policy.workM, 0, 0);
  ref.setMinutes(ref.getMinutes() + policy.lateGrace);
  return ref.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * คำนวณมาสาย — lateMinutes = checkIn - (workStart + grace), ถ้า < 0 เป็น 0
 */
function calcLateInfoCore(time, settings) {
  const bkk = toBangkokDate(time);
  const deadline = getLateDeadlineDate(time, settings);
  const diffMs = bkk.getTime() - deadline.getTime();
  const lateMinutes = diffMs > 0 ? Math.round(diffMs / 60000) : 0;
  const isLate = lateMinutes > 0;
  const policy = getLatePolicy(settings);
  const checkInTime = bkk.toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  });
  const lateStatus = isLate ? formatLateLabel(lateMinutes) : 'ตรงเวลา';
  return {
    isLate,
    lateMinutes,
    lateStatus,
    checkInTime,
    workStart: policy.workStartStr,
    lateGrace: policy.lateGrace,
    lateDeadline: formatLateDeadlineTime(settings),
  };
}

/** นับวันมาสายในเดือน (จาก localStorage sessions) */
function countLateCheckinsForEmail(empEmail, month, year) {
  if (!empEmail) return 0;
  let count = 0;
  const prefix = 'hrflow_today_' + empEmail + '_';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const m = key.match(/(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) continue;
    if (parseInt(m[2], 10) !== month || parseInt(m[1], 10) !== year) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      (data.sessions || []).forEach(function(s) {
        if (s.checkIn && s.isLate) count++;
      });
    } catch { /* skip */ }
  }
  return count;
}

function countLateCheckinsThisMonth(empEmail) {
  const now = new Date();
  return countLateCheckinsForEmail(empEmail, now.getMonth() + 1, now.getFullYear());
}

/** นับมาสายสำหรับ payroll ตามชื่อพนักงาน */
function countLateDaysForEmployee(empName, month, year) {
  const emp = getEmployees().find(function(e) { return e.name === empName; });
  if (emp && emp.email) return countLateCheckinsForEmail(emp.email, month, year);
  return getAttendances().filter(function(a) {
    const d = new Date(a.checkIn);
    return a.empName === empName && a.isLate && d.getMonth() + 1 === month && d.getFullYear() === year;
  }).length;
}

/** มาสายครบ 3 ครั้ง/เดือน → สร้าง draft ใบเตือน รอ CEO อนุมัติ */
function maybeCreateLateWarningDraft(user) {
  if (!user || !user.email || !user.name) return null;
  const count = countLateCheckinsThisMonth(user.email);
  if (count < LATE_WARN_THRESHOLD) return null;

  const warns = getWarnings();
  const monthKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  const existing = warns.find(function(w) {
    return w.empName === user.name && w.isAuto && w.status === 'draft_pending_ceo' && w.lateWarnMonth === monthKey;
  });
  if (existing) return existing;

  const issued = warns.filter(function(w) {
    return w.empName === user.name && w.status !== 'draft_pending_ceo';
  });
  const draft = {
    id: uid(),
    empName: user.name,
    reason: 'มาสาย ' + count + ' ครั้งในเดือนนี้ (หลัง Grace Period ' + formatLateDeadlineTime() + ') — รออนุมัติจาก ' + LATE_WARN_CEO,
    cumulative: issued.length + 1,
    isAuto: true,
    status: 'draft_pending_ceo',
    approver: LATE_WARN_CEO,
    lateWarnMonth: monthKey,
    lateCount: count,
    createdAt: new Date().toISOString(),
  };
  warns.push(draft);
  lsSet('warnings', warns);
  return draft;
}

/** แสดง duration ทั่วไป (เวลาทำงาน/พัก) — รูปแบบเดียวกับ formatLateMinutes */
function formatDurationMinutes(totalMinutes) {
  return formatLateMinutes(totalMinutes);
}

const STANDARD_WORK_MINUTES = 480; // 8 ชั่วโมง

/**
 * คำนวณเวลาทำงานจริง — นับเฉพาะช่วง working (ไม่นับพักเที่ยง)
 * @returns {{ workPhase, totalWorkMinutes, totalBreakMinutes, overtimeMinutes, timerLabel, timerMinutes, timerMode }}
 */
function calcWorkTimeSummary(rec, asOf) {
  const empty = {
    workPhase: null,
    totalWorkMinutes: 0,
    totalBreakMinutes: 0,
    overtimeMinutes: 0,
    timerLabel: '—',
    timerMinutes: 0,
    timerMode: null,
    checkInTime: null,
    lunchOutTime: null,
    lunchInTime: null,
    checkOutTime: null,
  };
  if (!rec || !rec.checkIn) return empty;

  const t = function(iso) { return new Date(iso).getTime(); };
  const now = asOf instanceof Date ? asOf.getTime() : new Date(asOf || Date.now()).getTime();

  let workPhase = 'working';
  if (rec.checkOut) workPhase = 'checked_out';
  else if (rec.lunchOut && !rec.lunchIn) workPhase = 'lunch_break';

  let totalWorkMinutes = 0;
  const ci = t(rec.checkIn);
  if (rec.lunchOut) {
    totalWorkMinutes += Math.max(0, Math.round((t(rec.lunchOut) - ci) / 60000));
    if (rec.lunchIn) {
      const workEnd = rec.checkOut ? t(rec.checkOut) : now;
      totalWorkMinutes += Math.max(0, Math.round((workEnd - t(rec.lunchIn)) / 60000));
    }
  } else {
    const workEnd = rec.checkOut ? t(rec.checkOut) : now;
    totalWorkMinutes += Math.max(0, Math.round((workEnd - ci) / 60000));
  }

  let totalBreakMinutes = 0;
  if (rec.lunchOut) {
    if (rec.lunchIn) {
      totalBreakMinutes = Math.max(0, Math.round((t(rec.lunchIn) - t(rec.lunchOut)) / 60000));
    } else {
      const breakEnd = rec.checkOut ? t(rec.checkOut) : now;
      totalBreakMinutes = Math.max(0, Math.round((breakEnd - t(rec.lunchOut)) / 60000));
    }
  }

  const timerMode = workPhase === 'lunch_break' ? 'break' : 'work';
  const timerMinutes = timerMode === 'break' ? totalBreakMinutes : totalWorkMinutes;
  const timerLabel = workPhase === 'lunch_break' ? 'กำลังพัก'
    : workPhase === 'checked_out' ? 'เวลาทำงานวันนี้' : 'กำลังทำงาน';
  const overtimeMinutes = workPhase === 'checked_out'
    ? Math.max(0, totalWorkMinutes - STANDARD_WORK_MINUTES) : 0;

  return {
    workPhase,
    totalWorkMinutes,
    totalBreakMinutes,
    overtimeMinutes,
    timerLabel,
    timerMinutes,
    timerMode,
    checkInTime: rec.checkInTime || thTime(rec.checkIn),
    lunchOutTime: rec.lunchOut ? (rec.lunchOutTime || thTime(rec.lunchOut)) : null,
    lunchInTime: rec.lunchIn ? (rec.lunchInTime || thTime(rec.lunchIn)) : null,
    checkOutTime: rec.checkOut ? (rec.checkOutTime || thTime(rec.checkOut)) : null,
  };
}

/** อัปเดต workPhase / totalWorkMinutes บน record (backward compatible) */
function syncWorkTimeFields(rec, asOf) {
  const s = calcWorkTimeSummary(rec, asOf);
  if (!rec) return s;
  rec.workPhase = s.workPhase;
  rec.totalWorkMinutes = s.totalWorkMinutes;
  rec.totalBreakMinutes = s.totalBreakMinutes;
  rec.overtimeMinutes = s.overtimeMinutes;
  if (rec.lunchOut) rec.lunchOutTime = s.lunchOutTime;
  if (rec.lunchIn) rec.lunchInTime = s.lunchInTime;
  return s;
}

/** อ่าน session วันนี้ของ user จาก localStorage (ใช้ dashboard) */
function getTodaySessionForUser(user) {
  if (!user || !user.email) return null;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const key = 'hrflow_today_' + user.email + '_' + day;
  try {
    const data = JSON.parse(localStorage.getItem(key) || 'null');
    if (!data || !Array.isArray(data.sessions) || !data.sessions.length) return null;
    return data.sessions.find(function(s) { return s.checkIn && !s.checkOut; })
      || data.sessions[data.sessions.length - 1];
  } catch { return null; }
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
const DEFAULT_LINE_OA_ID = '@593qdkpk';
const DEFAULT_LINE_NOTIFY_API = 'https://hrflow-app-gamma.vercel.app';

const _ATT_LINE_QUEUE_TYPES = ['checkin-company', 'checkin-outside', 'lunch-out', 'lunch-in', 'checkout'];

/** ลบรายการแจ้งเตือนลงเวลาที่ค้างใน queue (หลังปิด attendance LINE notify) */
function purgeAttendanceLineQueue() {
  const q = lsGet(_LINE_QUEUE_KEY, []);
  const filtered = q.filter(function(item) {
    return !_ATT_LINE_QUEUE_TYPES.includes(item.queuedFor);
  });
  if (filtered.length !== q.length) lsSet(_LINE_QUEUE_KEY, filtered);
}

/** Base URL ของแอป Next.js สำหรับส่ง LINE ผ่าน server (หลีกเลี่ยง CORS) */
function getLineNotifyApiBase() {
  const s = getCompanySettings();
  if (s.lineNotifyApiBase) return String(s.lineNotifyApiBase).replace(/\/$/, '');
  if (typeof location !== 'undefined' && location.protocol !== 'file:') {
    // ถ้า serve ผ่าน HTTP/HTTPS (Vercel, localhost ฯลฯ) — ใช้ same origin เสมอ
    return location.origin.replace(/\/prototype.*$/, '');
  }
  return DEFAULT_LINE_NOTIFY_API;
}

/**
 * Sends a LINE notification.
 * Order: (1) server API on hrflow-app, (2) Cloudflare relay, (3) direct (CORS มักล้ม)
 * Returns { ok: boolean, reason?: string, sent?: number }.
 */
async function sendLineOAMsg(message, imageUrl) {
  const s = getCompanySettings();
  const token = (s.lineToken || '').trim();
  const relay = (s.lineWebhookRelay || '').trim();

  const messages = [{ type: 'text', text: message }];
  if (imageUrl) {
    messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
  }

  // 1. Server-side relay (ใช้ token บน Vercel — ไม่มี CORS)
  try {
    const apiBase = getLineNotifyApiBase();
    const res = await fetch(apiBase + '/api/line/prototype-notify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, imageUrl: imageUrl || null }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.ok) return { ok: true, sent: data.sent, via: 'server' };
      if (data.reason === 'no_hr_linked') return { ok: false, reason: 'no_hr_linked' };
      if (data.reason === 'line_not_configured') return { ok: false, reason: 'no_config' };
    }
  } catch (err) {
    console.warn('[LINE] server relay failed', err);
  }

  // 2. Make.com relay — ส่ง lineBody เป็น JSON string สำเร็จรูป
  if (relay) {
    try {
      const res = await fetch(relay, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          lineBody: JSON.stringify({ messages }),
        }),
      });
      if (res.ok) return { ok: true, via: 'relay' };
    } catch (e) {
      console.error('[hr-core] Make.com relay failed:', e);
    }
  }

  // 3. LINE Messaging API direct (มักถูก CORS บล็อกใน browser)
  if (token) {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ messages }),
      });
      if (res.ok) return { ok: true, via: 'direct' };
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
  purgeAttendanceLineQueue();
  const q = lsGet(_LINE_QUEUE_KEY, []);
  if (!q.length) return;
  const remaining = [];
  for (const item of q) {
    if (_ATT_LINE_QUEUE_TYPES.includes(item.queuedFor)) continue;
    if ((item.retries || 0) >= 5) continue; // discard after 5 attempts
    const result = await sendLineOAMsg(item.message, item.imageUrl || null);
    if (!result.ok) remaining.push(Object.assign({}, item, { retries: (item.retries || 0) + 1 }));
  }
  lsSet(_LINE_QUEUE_KEY, remaining);
}

/** เปิดแชท LINE OA (@593qdkpk) — ใช้หลังสแกน/ผูกบัญชี */
function openLineOaChat(basicId) {
  const id = String(basicId || DEFAULT_LINE_OA_ID).replace(/^@/, '');
  const url = 'https://line.me/R/ti/p/@' + encodeURIComponent(id);
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ── MOBILE NAV (dynamic from SIDEBAR_NAV) ─────────────────────────────────────

/** @type {{ href: string, icon: string, label: string, roles?: string[] }[]} */
const MOBILE_NAV = [
  { href: 'index.html',           icon: '📊', label: 'หน้าหลัก' },
  { href: 'attendance.html',      icon: '⏱️', label: 'เช็คอิน' },
  { href: 'leave.html',           icon: '📅', label: 'ลา' },
  { href: 'out-of-office.html',   icon: '🚗', label: 'OOO' },
  { href: 'payroll.html',         icon: '💰', label: 'เงินเดือน', roles: ['hr-admin'] },
  { href: 'settings.html',        icon: '⚙️', label: 'ตั้งค่า' },
];

function renderMobileNav() {
  const nav = document.querySelector('.mobile-nav .mobile-nav-grid');
  if (!nav) return;
  const user = getCurrentUser();
  const page = location.pathname.split('/').pop() || 'index.html';
  const isOooPage = page === 'out-of-office.html';

  const picked = [];
  MOBILE_NAV.forEach(function(item) {
    if (item.href === 'settings.html') return;
    if (item.href === 'payroll.html' && isOooPage) return;
    if (item.href === 'out-of-office.html' && !isOooPage) return;
    if (item.roles && item.roles.includes('hr-admin')) {
      if (!user || (user.role !== 'MANAGER_HR' && user.role !== 'ADMIN')) return;
    }
    picked.push(item);
  });

  const settingsItem = MOBILE_NAV.find(function(i) { return i.href === 'settings.html'; });
  const items = picked.slice(0, 4).concat(settingsItem ? [settingsItem] : []);

  nav.innerHTML = items.map(function(item) {
    const base = item.href.split('#')[0].split('?')[0];
    const active = base === page ? ' active' : '';
    return '<a href="' + item.href + '" class="mnav-item' + active + '" aria-label="' + item.label + '">' +
      '<span class="icon" aria-hidden="true">' + item.icon + '</span>' + item.label + '</a>';
  }).join('');
}

// ── DEEP LINK / HASH SCROLL ───────────────────────────────────────────────────

function scrollToHashTarget() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash) return;
  const el = document.getElementById(hash);
  if (!el) return;
  setTimeout(function() {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('hash-highlight');
    setTimeout(function() { el.classList.remove('hash-highlight'); }, 2000);
  }, 120);
}

// ── API LAYER (Prisma-backed — fallback to localStorage) ───────────────────────

const HR_API_BASE = (typeof location !== 'undefined' && location.protocol !== 'file:')
  ? location.origin.replace(/\/prototype.*$/, '')
  : '';

function useHrApi() {
  return !!HR_API_BASE;
}

async function apiFetch(path, options) {
  if (!useHrApi()) return null;
  try {
    const res = await fetch(HR_API_BASE + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
    if (!res.ok) {
      console.error('[apiFetch] HTTP error:', res.status, path);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('[apiFetch] network/parse error:', path, e);
    return null;
  }
}

async function fetchLeaveRequestsApi() {
  const data = await apiFetch('/api/leaves');
  return data && Array.isArray(data.items) ? data.items : null;
}

async function fetchAttendancesApi() {
  const data = await apiFetch('/api/attendances');
  return data && Array.isArray(data.items) ? data.items : null;
}

async function syncFromApi() {
  const leaves = await fetchLeaveRequestsApi();
  if (leaves) lsSet('leaves', leaves);
  const atts = await fetchAttendancesApi();
  if (atts) lsSet('attendances', atts);
}

document.addEventListener('DOMContentLoaded', function() {
  scrollToHashTarget();
  renderMobileNav();
  if (useHrApi()) syncFromApi().catch(function() {});
});

(function() {
  if (document.getElementById('hr-hash-highlight-style')) return;
  const st = document.createElement('style');
  st.id = 'hr-hash-highlight-style';
  st.textContent = '.hash-highlight{outline:2px solid var(--accent);outline-offset:4px;transition:outline .3s}';
  document.head.appendChild(st);
})();

