// ── ลงเวลา (face matching อย่างเดียว — ไม่มี liveness/motion) ──
let faceCaptured = false;        // true เมื่อสแกนผ่าน (accept หรือยืนยัน mid-confidence)
let faceMatch = null;            // ผลลัพธ์ MatchResult ล่าสุด
let lastCapturedPhoto = null;    // ภาพคุณภาพสูงที่ใช้บันทึก (un-mirrored)
let autoScanActive = false;      // ลูปตรวจจับ+capture อัตโนมัติกำลังทำงานอยู่
let autoScanTimer = null;
let alignedSince = null;         // เวลาที่ใบหน้าเริ่มอยู่ในตำแหน่งเหมาะสม (สำหรับหน่วง 1-2 วิ)
let matching = false;
const STABLE_MS = 250;           // อยู่ตรงกล้องนิ่งต่อเนื่องเท่านี้ก่อน capture อัตโนมัติ
let activePanel = null; // checkin-company | checkin-outside | lunch-out | lunch-in | checkout
let checkinLocationMode = 'company'; // company | outside — ใช้ตอนขั้นเช็คอิน
let _submitting = false; // ป้องกัน double-tap / race condition

const ACTION_FLOW = [
  { key: 'checkin', label: 'เช็คอิน', panelCompany: 'checkin-company', panelOutside: 'checkin-outside', cls: 'checkin', icon: '🟢' },
  { key: 'lunch-out', label: 'พักกลางวัน', panel: 'lunch-out', cls: 'lunch-out', icon: '☕' },
  { key: 'lunch-in', label: 'เลิกพักกลางวัน', panel: 'lunch-in', cls: 'lunch-in', icon: '🔔' },
  { key: 'checkout', label: 'เช็คเอาท์', panel: 'checkout', cls: 'checkout', icon: '🔵' },
];

function isDayAttendanceComplete() {
  return getTodayData().sessions.some(s => s.checkIn && s.checkOut);
}

function getTodayDisplayRecord() {
  const active = getActiveSession();
  if (active) return active;
  const sessions = getTodayData().sessions.filter(s => s.checkIn);
  return sessions.length ? sessions[sessions.length - 1] : null;
}

function getNextActionKey() {
  if (isDayAttendanceComplete()) return null;
  const rec = getActiveSession();
  if (!rec?.checkIn) {
    if (getTodayData().sessions.some(s => s.checkIn)) return null;
    return 'checkin';
  }
  if (!rec.lunchOut && !rec.checkOut) return 'lunch-out';
  if (rec.lunchOut && !rec.lunchIn && !rec.checkOut) return 'lunch-in';
  if (!rec.checkOut) return 'checkout';
  return null;
}

function stepDoneKey(key, rec) {
  if (!rec) return false;
  if (key === 'checkin') return !!rec.checkIn;
  if (key === 'lunch-out') return !!rec.lunchOut;
  if (key === 'lunch-in') return !!rec.lunchIn;
  if (key === 'checkout') return !!rec.checkOut;
  return false;
}

function openNextActionPanel() {
  const next = getNextActionKey();
  if (!next) return;
  if (next === 'checkin') {
    openPanel(checkinLocationMode === 'outside' ? 'checkin-outside' : 'checkin-company');
    return;
  }
  const step = ACTION_FLOW.find(s => s.key === next);
  if (step?.panel) openPanel(step.panel);
}

function setCheckinLocation(mode) {
  checkinLocationMode = mode;
  renderAttendanceUI();
}

const PANEL_LABELS = {
  'checkin-company':  { title: 'เช็คอิน ในบริษัท', submit: 'บันทึกเช็คอิน' },
  'checkin-outside':  { title: 'เช็คอิน นอกสถานที่', submit: 'บันทึกเช็คอิน' },
  'lunch-out':        { title: 'เริ่มพักกลางวัน', submit: 'บันทึกเริ่มพักกลางวัน' },
  'lunch-in':         { title: 'กลับจากพักกลางวัน', submit: 'บันทึกสิ้นพักกลางวัน' },
  'checkout':         { title: 'เช็คเอาท์', submit: 'บันทึกเช็คเอาท์' },
};

function todayStorageKey() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  // ใช้วันที่ตามเวลาไทย (Asia/Bangkok) — en-CA ให้ YYYY-MM-DD format
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  return `hrflow_today_${user?.email || 'guest'}_${day}`;
}

/** @returns {{ sessions: object[] }} */
function getTodayData() {
  try {
    // ถ้า localStorage quota เต็ม ข้อมูลเก็บใน memory — ใช้ก่อน
    if (_pendingAttendanceData) return _pendingAttendanceData;
    const raw = JSON.parse(localStorage.getItem(todayStorageKey()) || 'null');
    if (raw && Array.isArray(raw.sessions)) return raw;
    // migrate รูปแบบเก่า (record เดียวต่อวัน) และ save กลับทันที
    if (raw && raw.checkIn) {
      const migrated = { sessions: [{ sessionIndex: 1, ...raw }] };
      try { localStorage.setItem(todayStorageKey(), JSON.stringify(migrated)); } catch { /* intentional: cleanup failure is non-critical, safe to ignore */ }
      return migrated;
    }
    return { sessions: [] };
  } catch (e) {
    console.error('[attendance] corrupted today data, clearing:', e);
    try { localStorage.removeItem(todayStorageKey()); } catch { /* intentional: cleanup failure is non-critical, safe to ignore */ }
    return { sessions: [] };
  }
}

function saveTodayData(data) {
  const json = JSON.stringify(data);
  // console.log('[ATT] saveTodayData ~' + Math.round(json.length / 1024) + 'KB, sessions:', data.sessions.length);
  try {
    localStorage.setItem(todayStorageKey(), json);
    _pendingAttendanceData = null; // clear memory fallback on successful save
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const dayMatch = todayStorageKey().match(/_(\d{4}-\d{2}-\d{2})$/);
    if (user && user.email && dayMatch && typeof syncTodaySessionsToAttendances === 'function') {
      syncTodaySessionsToAttendances(user.email, dayMatch[1], data.sessions || []);
    }
    // console.log('[ATT] saveTodayData OK');
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('[ATT] localStorage quota exceeded, cleaning old logs...');
      _cleanOldAttendanceLogs();
      try {
        localStorage.setItem(todayStorageKey(), json);
        _pendingAttendanceData = null;
        // console.log('[ATT] saveTodayData OK after cleanup');
      } catch {
        console.error('[ATT] saveTodayData FAILED even after cleanup — using memory fallback');
        _showStorageWarning();
        _pendingAttendanceData = data;
      }
    } else {
      console.error('[ATT] saveTodayData unexpected error:', e);
    }
  }
}

let _pendingAttendanceData = null;

function _cleanOldAttendanceLogs() {
  // ลบ key hrflow_today_ ที่เก่ากว่า 30 วัน
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(cutoff);
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('hrflow_today_')) continue;
    const m = key.match(/(\d{4}-\d{2}-\d{2})$/);
    if (m && m[1] < cutoffKey) toRemove.push(key);
  }
  toRemove.forEach(k => { try { localStorage.removeItem(k); } catch { /* intentional: cleanup failure is non-critical, safe to ignore */ } });
  // ลบ faceScanLogs ที่สะสมเยอะ
  try {
    const logs = JSON.parse(localStorage.getItem('hrflow_faceScanLogs') || '[]');
    if (logs.length > 50) localStorage.setItem('hrflow_faceScanLogs', JSON.stringify(logs.slice(0, 50)));
  } catch (e) {
    console.warn('[attendance] corrupted hrflow_faceScanLogs, clearing:', e);
    try { localStorage.removeItem('hrflow_faceScanLogs'); } catch { /* intentional: cleanup failure is non-critical, safe to ignore */ }
  }
}

function _showStorageWarning() {
  const bar = document.getElementById('offline-queue-bar');
  const msg = document.getElementById('offline-queue-msg');
  if (bar && msg) {
    bar.style.display = 'flex';
    bar.style.background = 'rgba(239,68,68,.1)';
    bar.style.borderColor = 'rgba(239,68,68,.3)';
    msg.textContent = '⚠️ พื้นที่จัดเก็บเต็ม ข้อมูลถูกเก็บชั่วคราว — กรุณาล้างแคชเบราว์เซอร์';
  }
}

/** รอบที่ยังไม่เช็คเอาท์ */
function getActiveSession() {
  const data = getTodayData();
  return data.sessions.find(s => s.checkIn && !s.checkOut) || null;
}

function getCompletedSessions() {
  return getTodayData().sessions.filter(s => s.checkIn && s.checkOut);
}

function getTodayRecord() {
  return getActiveSession();
}

function saveTodayRecord(rec) {
  const data = getTodayData();
  const idx = data.sessions.findIndex(s => s.sessionIndex === rec.sessionIndex);
  if (idx >= 0) data.sessions[idx] = rec;
  else data.sessions.push(rec);
  saveTodayData(data);
}

function fmtTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

function resetCaptureUI() {
  faceCaptured = false;
  faceMatch = null;
  lastCapturedPhoto = null;
  const submitBtn = document.getElementById('btn-submit');
  if (submitBtn) { submitBtn.style.display = 'none'; submitBtn.disabled = false; }
  const rescanBtn = document.getElementById('btn-rescan');
  if (rescanBtn) rescanBtn.style.display = 'none';
  const previewWrap = document.getElementById('face-preview-wrap');
  if (previewWrap) previewWrap.style.display = 'none';
  const confirmRow = document.getElementById('face-confirm-row');
  if (confirmRow) confirmRow.style.display = 'none';
  setScanStatus('มองกล้องตรงเพื่อสแกนใบหน้า', 'var(--text2)');
}

function openPanel(panel) {
  activePanel = panel;
  const meta = PANEL_LABELS[panel];
  document.getElementById('camera-card-title').textContent = '👤 ' + meta.title;
  document.getElementById('att-capture-bar').style.display = 'block';
  document.getElementById('att-panel-hint').textContent =
    'มองกล้องตรงเพื่อสแกนใบหน้า — ระบบจะบันทึกอัตโนมัติเมื่อยืนยันตัวตนสำเร็จ';
  const submitBtn = document.getElementById('btn-submit');
  submitBtn.textContent = meta.submit;
  resetCaptureUI();
  renderAttendanceUI();
  startAutoScan();
}

function closePanel() {
  stopAutoScan();
  activePanel = null;
  document.getElementById('att-capture-bar').style.display = 'none';
  document.getElementById('camera-card-title').textContent = '👤 สแกนใบหน้า';
  resetCaptureUI();
  renderAttendanceUI();
}

// ── AUTOMATIC FACE SCAN — face matching only, no liveness/motion ──
// Flow: open camera -> detect face -> auto capture -> compare -> attendance success
function setScanStatus(html, color) {
  const el = document.getElementById('scan-status');
  if (!el) return;
  el.innerHTML = color ? `<span style="color:${color}">${html}</span>` : html;
}

function showFacePreview(decision, confidence, photo) {
  const wrap = document.getElementById('face-preview-wrap');
  wrap.style.display = 'block';
  if (photo) document.getElementById('face-preview-img').src = photo;
  const pct = Math.round((confidence || 0) * 100);
  const fill = document.getElementById('face-confidence-fill');
  fill.style.width = pct + '%';
  const palette = { accept: 'var(--green)', confirm: 'var(--orange)', reject: 'var(--red)' };
  const labels  = { accept: '✓ ยืนยันตัวตนสำเร็จ', confirm: '⚠ ความมั่นใจปานกลาง', reject: '✕ ไม่ผ่านการยืนยัน' };
  fill.style.background = palette[decision] || 'var(--text3)';
  const dec = document.getElementById('face-decision');
  dec.textContent = labels[decision] || '—';
  dec.style.color = palette[decision] || 'var(--text)';
  document.getElementById('face-confidence-text').textContent = `ความมั่นใจ ${pct}%`;
}

function startAutoScan() {
  if (typeof FaceCore === 'undefined') { setScanStatus('ระบบสแกนใบหน้ายังไม่พร้อม', 'var(--red)'); return; }
  stopAutoScan();
  startFaceScanTimeout(); // [7] timeout guard
  autoScanActive = true;
  faceCaptured = false;
  faceMatch = null;
  alignedSince = null;
  document.getElementById('face-confirm-row').style.display = 'none';
  document.getElementById('btn-rescan').style.display = 'none';
  document.getElementById('face-preview-wrap').style.display = 'none';
  setScanStatus('มองกล้องตรงเพื่อสแกนใบหน้า', 'var(--text2)');
  FaceCore.loadModels()
    .then(() => { if (autoScanActive) autoScanTick(); })
    .catch(err => setScanStatus('โหลดระบบสแกนไม่สำเร็จ: ' + (err?.message || err), 'var(--red)'));
}

function stopAutoScan() {
  autoScanActive = false;
  alignedSince = null;
  if (autoScanTimer) { clearTimeout(autoScanTimer); autoScanTimer = null; }
  clearFaceScanTimeout(); // [7] clear timeout on stop
}

// Continuously check face alignment; once the face faces the camera and is
// well-aligned for ~1–2s, capture + match automatically (no motion challenge).
async function autoScanTick() {
  if (!autoScanActive || !activePanel) return;
  const video = document.getElementById('checkin-video');
  if (!video?.srcObject) { autoScanTimer = setTimeout(autoScanTick, 400); return; }
  // readyState 4 = HAVE_ENOUGH_DATA — required on iOS Safari and Android Chrome
  if (video.readyState < 4 || !video.videoWidth || !video.videoHeight) {
    // console.log('[CAM] video not ready yet (readyState=' + video.readyState + ' w=' + video.videoWidth + ') — waiting...');
    autoScanTimer = setTimeout(autoScanTick, 300);
    return;
  }
  try {
    const quality = await FaceCore.assessQuality(video);
    if (!autoScanActive) return; // may have been stopped while awaiting
    if (quality.ok) {
      // Face is aligned — hold steady briefly, then auto-capture (req 5)
      if (alignedSince === null) alignedSince = Date.now();
      const held = Date.now() - alignedSince;
      if (held >= STABLE_MS) {
        await runMatch(video);
      } else {
        setScanStatus('✓ อยู่ในตำแหน่งแล้ว — อยู่นิ่งๆ กำลังถ่าย...', 'var(--green)');
        autoScanTimer = setTimeout(autoScanTick, 220);
      }
    } else {
      // not aligned — reset the hold timer and show the alignment hint (req 4)
      alignedSince = null;
      const noFace = quality.reasons.includes('no_face');
      setScanStatus(noFace ? 'หันหน้าตรงกล้องเพื่อสแกน' : '⚠ ' + quality.message,
                    noFace ? 'var(--text2)' : 'var(--accent3)');
      autoScanTimer = setTimeout(autoScanTick, 400);
    }
  } catch (err) {
    setScanStatus('เกิดข้อผิดพลาด: ' + (err?.message || err), 'var(--red)');
    autoScanTimer = setTimeout(autoScanTick, 1000);
  }
}

async function runMatch(video) {
  if (matching) return;
  // Guard: video must have HAVE_ENOUGH_DATA before capture
  if (!video || video.readyState < 4 || !video.videoWidth || !video.videoHeight) {
    // console.log('[CAM] runMatch: video not ready (readyState=' + video?.readyState + ' w=' + video?.videoWidth + ') — aborting');
    autoScanTimer = setTimeout(autoScanTick, 300);
    return;
  }
  matching = true;
  autoScanActive = false; // pause loop while comparing
  alignedSince = null;
  setScanStatus('กำลังเทียบใบหน้า...', 'var(--text2)');
  try {
    // 300ms settle delay — Android Chrome / iOS Safari output black frames
    // if captured the instant quality-OK is detected (camera auto-exposure settling)
    await new Promise(function(r) { setTimeout(r, 300); });
    if (!activePanel) return; // panel closed during delay

    // Re-validate after delay
    if (video.readyState < 4 || !video.videoWidth || !video.videoHeight) {
      console.warn('[CAM] runMatch: video became not-ready after delay — aborting');
      autoScanActive = true;
      autoScanTimer = setTimeout(autoScanTick, 300);
      return;
    }
    // console.log('[CAM] runMatch: readyState=' + video.readyState + ' w=' + video.videoWidth + ' h=' + video.videoHeight);

    // Capture still and resize to max 480×360 / quality 0.75 before storing
    const still = FaceCore.captureStill(video, { quality: 0.92 });

    // Black-frame guard: sample center pixel — if nearly black, camera is still warming up
    {
      const sctx = still.canvas.getContext('2d');
      const cx = Math.floor(still.canvas.width / 2), cy = Math.floor(still.canvas.height / 2);
      const px = sctx.getImageData(cx, cy, 1, 1).data;
      const brightness = px[0] + px[1] + px[2]; // 0–765
      // console.log('[CAM] center pixel brightness=' + brightness + ' (0=black, 765=white)');
      if (brightness < 30) {
        console.warn('[CAM] black frame detected — camera warming up, will retry');
        autoScanActive = true; // restore so the retry tick can proceed
        autoScanTimer = setTimeout(autoScanTick, 500);
        return;
      }
    }
    {
      const sw = still.canvas.width, sh = still.canvas.height;
      const scale = Math.min(1, 480 / sw, 360 / sh);
      if (scale < 1) {
        const rc = document.createElement('canvas');
        rc.width = Math.round(sw * scale); rc.height = Math.round(sh * scale);
        rc.getContext('2d').drawImage(still.canvas, 0, 0, rc.width, rc.height);
        lastCapturedPhoto = rc.toDataURL('image/jpeg', 0.75);
      } else {
        lastCapturedPhoto = still.canvas.toDataURL('image/jpeg', 0.75);
      }
    }
    // console.log('[PHOTO] runMatch captured, size ~' + Math.round(lastCapturedPhoto.length / 1024) + 'KB');
    const previewShot = FaceCore.captureStill(video, { mirror: true, quality: 0.85 }).dataUrl;

    const employeeId = FaceCore.getCurrentEmployeeId();
    const result = await FaceCore.matchFace(employeeId, still.canvas, {
      capturedImage: FaceCore.thumbnail(still.canvas, 128, 0.6),
    });
    faceMatch = result;

    if (result.decision === 'accept') {
      showFacePreview('accept', result.confidence, previewShot);
      setScanStatus('✓ ' + result.message, 'var(--green)');
      faceCaptured = true;
      autoSubmit();
    } else if (result.decision === 'confirm') {
      // mid-confidence: ask instead of hard reject
      showFacePreview('confirm', result.confidence, previewShot);
      document.getElementById('face-confirm-row').style.display = 'flex';
      setScanStatus('⚠ ' + result.message, 'var(--orange)');
    } else if (result.reason === 'not_registered') {
      // Don't break attendance for users who haven't registered a face yet.
      showFacePreview('confirm', 0, previewShot);
      document.getElementById('face-decision').textContent = 'ยังไม่ได้ลงทะเบียนใบหน้า';
      document.getElementById('face-confidence-text').innerHTML =
        'บันทึกภาพไว้แต่ยังไม่ยืนยันตัวตน · <a href="settings.html#face" style="color:var(--accent)">ลงทะเบียนใบหน้า</a>';
      faceCaptured = true;
      setScanStatus('⚠ ยังไม่ได้ลงทะเบียนใบหน้า — บันทึกภาพให้อัตโนมัติ', 'var(--orange)');
      autoSubmit();
    } else {
      // reject: keep scanning automatically (no manual challenge needed)
      showFacePreview('reject', result.confidence, previewShot);
      setScanStatus('✕ ' + result.message + ' — กำลังสแกนใหม่อัตโนมัติ...', 'var(--red)');
      document.getElementById('btn-rescan').style.display = 'block';
      autoScanActive = true;
      autoScanTimer = setTimeout(autoScanTick, 1300);
    }
  } catch (err) {
    setScanStatus('เกิดข้อผิดพลาด: ' + (err?.message || err), 'var(--red)');
    autoScanActive = true;
    autoScanTimer = setTimeout(autoScanTick, 1300);
  } finally {
    matching = false;
  }
}

// Verified -> save automatically (the existing attendance logic is untouched).
function autoSubmit() {
  stopAutoScan();
  document.getElementById('face-confirm-row').style.display = 'none';
  document.getElementById('btn-rescan').style.display = 'none';
  // brief pause so the user sees the success state before the record is saved
  setTimeout(() => { if (activePanel && faceCaptured) submitActiveAction(); }, 150);
}

function confirmMidMatch() {
  if (!faceMatch || faceMatch.decision !== 'confirm') return;
  faceMatch.userConfirmed = true;
  faceCaptured = true;
  setScanStatus('✓ ยืนยันการลงเวลาแล้ว', 'var(--green)');
  autoSubmit();
}

function rescanFace() {
  startAutoScan();
}

function capturePhotoDataUrl() {
  // Max 480×360 at quality 0.75 — keeps file small enough for localStorage (~20–40 KB)
  const MAX_W = 480, MAX_H = 360, QUALITY = 0.75;
  if (lastCapturedPhoto) {
    // console.log('[PHOTO] using lastCapturedPhoto, size ~' + Math.round(lastCapturedPhoto.length / 1024) + 'KB');
    return lastCapturedPhoto; // already resized in runMatch()
  }
  // Fallback: capture directly from live video
  const video = document.getElementById('checkin-video');
  // Guard: require HAVE_ENOUGH_DATA to avoid black fallback frames on iOS/Android
  if (!video || video.readyState < 4 || !video.videoWidth || !video.videoHeight) {
    console.warn('[PHOTO] fallback: video not ready (readyState=' + video?.readyState + ' w=' + video?.videoWidth + ') — returning null');
    return null;
  }
  const sw = video.videoWidth, sh = video.videoHeight;
  const scale = Math.min(1, MAX_W / sw, MAX_H / sh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', QUALITY);
  // console.log('[PHOTO] fallback capture from video, size ~' + Math.round(url.length / 1024) + 'KB');
  return url;
}

function submitActiveAction() {
  if (!activePanel) return;
  if (_submitting) return; // double-tap guard
  if (!faceCaptured) {
    alert('กรุณาสแกนใบหน้าเพื่อยืนยันตัวตนก่อน');
    return;
  }
  _submitting = true;
  // แสดง loading state บนปุ่ม submit
  const submitBtn = document.getElementById('btn-submit');
  const _submitBtnOrigText = submitBtn ? (submitBtn.textContent || 'บันทึก') : 'บันทึก';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'กำลังบันทึกข้อมูล...'; }
  try {
  const photoUrl = capturePhotoDataUrl();
  // console.log('[ATT] photoUrl captured:', photoUrl ? 'YES (~' + Math.round(photoUrl.length / 1024) + 'KB)' : 'NULL');
  const faceMeta = faceMatch ? {
    faceVerified: faceMatch.decision === 'accept' || !!faceMatch.userConfirmed,
    faceConfidence: faceMatch.confidence,
    faceDecision: faceMatch.userConfirmed ? 'user_confirmed' : faceMatch.decision,
  } : { faceVerified: false, faceConfidence: null, faceDecision: 'none' };
  const now = new Date().toISOString();
  const addr = document.getElementById('gps-address')?.textContent || '';
  const office = getOfficeCoords();
  const dist = calculateDistance(userCoords.lat, userCoords.lng, office.lat, office.lng);
  const inRange = dist <= office.radius;
  let rec = getActiveSession();
  // console.log('[ATT] action:', activePanel, '| rec:', JSON.stringify(rec));
  const completedCount = getCompletedSessions().length;
  const nextSessionIndex = completedCount + (rec ? 0 : 1);

  const user = getCurrentUser();
  const s = getCompanySettings();
  const lateInfo = (typeof calcLateInfo === 'function')
    ? calcLateInfo(activePanel, new Date())
    : { isLate: false, lateMinutes: 0, lateStatus: '—', checkInTime: null };
  const deviceInfo = navigator.userAgent || '—';
  const baseFields = {
    address: addr, lat: userCoords.lat, lng: userCoords.lng, status: 'NORMAL',
    branch: s.branch || s.companyName || '—',
    department: user?.dept || '—',
    isLate: lateInfo.isLate,
    lateMinutes: lateInfo.lateMinutes,
    lateStatus: lateInfo.lateStatus,
    checkInTime: lateInfo.checkInTime,
    deviceInfo,
  };

  if (activePanel === 'checkin-company') {
    if (isDayAttendanceComplete()) { alert('ลงเวลาครบแล้ววันนี้'); return; }
    if (getTodayData().sessions.some(s => s.checkIn)) { alert('เช็คอินแล้ววันนี้'); return; }
    if (rec) { alert('มีรอบงานที่ยังไม่เช็คเอาท์ — กรุณาเช็คเอาท์ก่อน'); return; }
    if (!inRange) { alert('อยู่นอกรัศมีสำนักงาน — ใช้เช็คอินนอกสถานที่แทน'); return; }
    rec = {
      sessionIndex: Math.max(0, ...getTodayData().sessions.map(s => s.sessionIndex || 0)) + 1,
      checkIn: now, checkOut: null, lunchOut: null, lunchIn: null,
      isOutside: false, workPlaceName: 'สำนักงาน',
      photoUrl, lunchOutPhotoUrl: null, lunchInPhotoUrl: null, checkOutPhotoUrl: null,
      ...baseFields,
    };
    appendHistoryRow(rec, photoUrl);
  } else if (activePanel === 'checkin-outside') {
    if (isDayAttendanceComplete()) { alert('ลงเวลาครบแล้ววันนี้'); return; }
    if (getTodayData().sessions.some(s => s.checkIn)) { alert('เช็คอินแล้ววันนี้'); return; }
    if (rec) { alert('มีรอบงานที่ยังไม่เช็คเอาท์ — กรุณาเช็คเอาท์ก่อน'); return; }
    rec = {
      sessionIndex: Math.max(0, ...getTodayData().sessions.map(s => s.sessionIndex || 0)) + 1,
      checkIn: now, checkOut: null, lunchOut: null, lunchIn: null,
      isOutside: true, workPlaceName: 'นอกสถานที่',
      photoUrl, lunchOutPhotoUrl: null, lunchInPhotoUrl: null, checkOutPhotoUrl: null,
      ...baseFields,
    };
    appendHistoryRow(rec, photoUrl);
  } else if (activePanel === 'lunch-out') {
    if (!rec?.checkIn) { alert('ต้องเช็คอินก่อน'); return; }
    if (rec?.lunchOut) { alert('บันทึกเริ่มพักแล้ว'); return; }
    rec.lunchOut = now;
    rec.lunchOutPhotoUrl = photoUrl;
    updateHistoryCheckout(rec);
  } else if (activePanel === 'lunch-in') {
    if (!rec?.lunchOut) { alert('ต้องเริ่มพักก่อน'); return; }
    if (rec?.lunchIn) { alert('บันทึกกลับจากพักแล้ว'); return; }
    rec.lunchIn = now;
    rec.lunchInPhotoUrl = photoUrl;
    updateHistoryCheckout(rec);
  } else if (activePanel === 'checkout') {
    if (!rec?.checkIn) { alert('ต้องเช็คอินก่อน'); return; }
    if (rec?.checkOut) { alert('เช็คเอาท์แล้ว'); return; }
    const coInfo = (typeof calcCheckoutInfo === 'function')
      ? calcCheckoutInfo('checkout', new Date())
      : { earlyLeave: false, earlyLeaveMinutes: 0, workStatus: 'เลิกงานปกติ', checkOutTime: null };
    rec.checkOut = now;
    rec.checkOutPhotoUrl = photoUrl;
    rec.checkOutTime = coInfo.checkOutTime;
    rec.earlyLeave = coInfo.earlyLeave;
    rec.earlyLeaveMinutes = coInfo.earlyLeaveMinutes;
    rec.workStatus = coInfo.workStatus;
    updateHistoryCheckout(rec);
  }

  Object.assign(rec, faceMeta);
  if (typeof syncWorkTimeFields === 'function') syncWorkTimeFields(rec);
  saveTodayRecord(rec);
  const _savedRec = getTodayDisplayRecord();
  // console.log('[ATT] saved. sessions:', getTodayData().sessions.length, 'nextKey:', getNextActionKey(),
  //   '| photoUrl in storage:', _savedRec ? (_savedRec.photoUrl ? '✓ ~' + Math.round(_savedRec.photoUrl.length / 1024) + 'KB' : 'MISSING') : 'no rec');
  const _scanType = activePanel; // capture before closePanel resets it
  const _wasCheckout = _scanType === 'checkout';
  closePanel();
  renderAttendanceUI();
  if (_scanType === 'checkin-company' || _scanType === 'checkin-outside') {
    if (rec.isLate && typeof maybeCreateLateWarningDraft === 'function') {
      const draft = maybeCreateLateWarningDraft(user);
      if (draft) {
        alert('บันทึกสำเร็จ — มาสาย ' + formatLateLabel(rec.lateMinutes || 0) +
          '\n\n⚠️ มาสายครบ ' + (draft.lateCount || LATE_WARN_THRESHOLD) + ' ครั้งในเดือนนี้\nระบบสร้าง Draft ใบเตือน รออนุมัติจาก ' + (draft.approver || 'ท.เฉลิม (CEO)'));
      } else {
        alert('บันทึกสำเร็จ' + (rec.isLate ? ' — ' + (rec.lateStatus || formatLateLabel(rec.lateMinutes || 0)) : ''));
      }
    } else {
      alert('บันทึกสำเร็จ' + (rec.isLate ? ' — ' + (rec.lateStatus || '') : ''));
    }
  } else if (_wasCheckout) {
    renderDailySummary(rec);
    alert('บันทึกเช็คเอาท์สำเร็จ — ดูสรุปเวลาทำงานด้านบน');
  } else {
    alert('บันทึกสำเร็จ');
  }
  saveAttendancePhotoToDevice(photoUrl, rec, _scanType);
  clearFaceScanTimeout(); // [7] scan succeeded, clear timeout
  uploadAttendancePhotoCdn(rec, _scanType, photoUrl)
    .catch(function(e) { console.warn('cloudinary upload:', e); });
  } catch (err) {
    console.error('submitActiveAction error:', err);
    alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
  } finally {
    _submitting = false;
    const submitBtn2 = document.getElementById('btn-submit');
    if (submitBtn2) {
      submitBtn2.disabled = false;
      if (submitBtn2.textContent === 'กำลังบันทึกข้อมูล...') submitBtn2.textContent = _submitBtnOrigText;
    }
  }
}

function formatTimesCell(rec) {
  const parts = [fmtTime(rec.checkIn)];
  if (rec.lunchOut) parts.push('พัก ' + fmtTime(rec.lunchOut) + (rec.lunchIn ? '-' + fmtTime(rec.lunchIn) : ''));
  parts.push(rec.checkOut ? fmtTime(rec.checkOut) : '-');
  return parts.join(' / ');
}

function formatWorkTimeCell(rec) {
  if (!rec?.checkIn) return '—';
  const mins = (typeof calcWorkTimeSummary === 'function')
    ? calcWorkTimeSummary(rec).totalWorkMinutes
    : (rec.totalWorkMinutes || 0);
  const fmt = (typeof formatDurationMinutes === 'function') ? formatDurationMinutes : function(m) { return m + ' นาที'; };
  if (!rec.checkOut) return '<span style="color:var(--green);font-size:11px;">' + fmt(mins) + '</span>';
  return '<span class="tag green" style="font-size:11px;">' + fmt(mins) + '</span>';
}

function appendHistoryRow(rec, photoUrl) {
  const now = new Date(rec.checkIn);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const formattedDate = `${now.getDate()} ${months[now.getMonth()]} ${(now.getFullYear() + 543).toString().slice(-2)}`;
  const tbody = document.getElementById('attendance-body');
  const tr = document.createElement('tr');
  tr.dataset.todayRow = '1';
  tr.style.animation = 'fadeUp 0.5s ease both';
  const placeTag = rec.isOutside ? '<span class="tag orange">นอกสถานที่</span>' : '<span class="tag blue">ในบริษัท</span>';
  // photoUrl ถูก sanitize ด้วย encodeURI เพื่อป้องกัน data URL injection
  const safePhoto = photoUrl ? encodeURI(photoUrl).replace(/'/g, '%27') : '';
  tr.innerHTML = `
    <td>${escapeHtml(formattedDate)}</td>
    <td><div class="emp-av" style="border-radius:6px;background:url('${safePhoto}') center/cover;"></div></td>
    <td>${escapeHtml(formatTimesCell(rec))}</td>
    <td>${formatWorkTimeCell(rec)}</td>
    <td><div style="font-size:11px;color:var(--text3);">${escapeHtml((rec.lat?.toFixed(6) || '') + ', ' + (rec.lng?.toFixed(6) || ''))}</div>${placeTag}</td>
    <td><span class="tag green">ปกติ</span></td>`;
  tbody.insertBefore(tr, tbody.firstChild);
}

function updateHistoryCheckout(rec) {
  const tr = document.querySelector('#attendance-body tr[data-today-row="1"]');
  if (!tr) return;
  if (tr.cells[2]) tr.cells[2].textContent = formatTimesCell(rec);
  if (tr.cells[3]) tr.cells[3].innerHTML = formatWorkTimeCell(rec);
  if (tr.cells[5] && rec.isLate) tr.cells[5].innerHTML = '<span class="tag yellow">' + (typeof formatLateLabel === 'function' ? formatLateLabel(rec.lateMinutes || 0) : 'มาสาย') + '</span>';
}

function renderTimeline(rec) {
  const steps = [
    { key: 'checkIn', label: 'เช็คอิน', color: 'var(--green)' },
    { key: 'lunchOut', label: 'เริ่มพักกลางวัน', color: 'var(--orange)', amber: true },
    { key: 'lunchIn', label: 'กลับจากพัก', color: 'var(--orange)', amber: true },
    { key: 'checkOut', label: 'เช็คเอาท์', color: 'var(--accent)' },
  ];
  let html = '';
  if (rec.workPlaceName) {
    html += `<p style="font-size:12px;color:var(--accent3);margin:0 0 12px;">📍 สถานที่: <strong style="color:var(--text)">${rec.workPlaceName}</strong></p>`;
  }
  steps.forEach((s, i) => {
    const done = !!rec[s.key];
    const isLast = i === steps.length - 1;
    // badge มาสาย/ตรงเวลา (checkIn) และ กลับก่อน/ปกติ (checkOut)
    let statusBadge = '';
    if (s.key === 'checkIn' && done) {
      if (rec.isLate) {
        statusBadge = `<span class="tag orange" style="font-size:10px;margin-left:6px;">${formatLateLabel(rec.lateMinutes || 0)}</span>`;
      } else if (rec.checkInTime) {
        statusBadge = `<span class="tag green" style="font-size:10px;margin-left:6px;">ตรงเวลา</span>`;
      }
    }
    if (s.key === 'checkOut' && done) {
      if (rec.earlyLeave) {
        statusBadge = `<span class="tag orange" style="font-size:10px;margin-left:6px;">กลับก่อน ${rec.earlyLeaveMinutes || 0} นาที</span>`;
      } else if (rec.checkOutTime) {
        statusBadge = `<span class="tag green" style="font-size:10px;margin-left:6px;">เลิกงานปกติ</span>`;
      }
    }
    html += `<div class="att-tl-row">
      <div class="att-tl-dot ${s.amber ? 'amber' : ''} ${done ? 'done' : ''}"><span></span>${!isLast ? '<div class="att-tl-line' + (done ? ' done' : '') + '"></div>' : ''}</div>
      <div style="padding-bottom:${isLast ? 0 : 16}px;">
        <div style="font-size:13px;font-weight:600;color:${done ? 'var(--text)' : 'var(--text3)'};">${s.label}${statusBadge}</div>
        <div style="font-size:18px;font-weight:700;color:${done ? s.color : 'var(--text3)'}">${fmtTime(rec[s.key])}</div>
      </div></div>`;
  });
  document.getElementById('att-timeline').innerHTML = html;
}

// Called by onerror on att-photo-slot img.
// If a local data URL fallback is stored on the element, try that first.
// Only replace with placeholder when all sources are exhausted.
function _attPhotoError(img) {
  var local = img._localFallback;
  if (local && img.src !== local) {
    console.warn('[PHOTO] CDN URL failed (' + img.src.substring(0, 60) + '…) — retrying with local data URL');
    img._localFallback = null; // don't loop
    img.src = local;
    return;
  }
  console.warn('[PHOTO] all image sources failed — showing placeholder');
  var ph = document.createElement('div');
  ph.className = 'att-photo-ph';
  ph.textContent = '📷';
  img.parentNode.replaceChild(ph, img);
}

function renderPhotos(rec) {
  // cdn = Cloudinary HTTPS URL (preferred); local = data URL fallback
  const items = [
    { label: 'เช็คอิน',   cdn: rec.photoUrlCdn,       local: rec.photoUrl,       time: rec.checkIn },
    { label: 'เริ่มพัก',  cdn: rec.lunchOutPhotoUrlCdn, local: rec.lunchOutPhotoUrl, time: rec.lunchOut },
    { label: 'กลับพัก',  cdn: rec.lunchInPhotoUrlCdn,  local: rec.lunchInPhotoUrl,  time: rec.lunchIn },
    { label: 'เช็คเอาท์', cdn: rec.checkOutPhotoUrlCdn, local: rec.checkOutPhotoUrl, time: rec.checkOut },
  ];
  const container = document.getElementById('att-photos');
  container.innerHTML = items.map((it) => {
    const url = it.cdn || it.local;
    const urlDesc = url ? (url.startsWith('data:') ? 'data:~' + Math.round(url.length / 1024) + 'KB' : url.substring(0, 70)) : 'null';
    // console.log('[PHOTO] rendering ' + it.label + ' url=' + urlDesc);
    return `<div class="att-photo-slot">
      ${url ? `<img src="${url}" alt="" onerror="_attPhotoError(this)">` : `<div class="att-photo-ph">—</div>`}
      <p>${it.label}${it.time ? ' · ' + fmtTime(it.time) : ''}</p>
    </div>`;
  }).join('');
  // Attach local data URL as onerror fallback — CDN imgs retry with local when CDN fails
  // (can't put large data URLs in HTML attributes, so set as JS property instead)
  const imgs = container.querySelectorAll('img');
  let imgIdx = 0;
  items.forEach((it) => {
    if (it.cdn || it.local) { // only if an img was rendered
      const img = imgs[imgIdx++];
      if (img && it.cdn && it.local && it.cdn !== it.local) {
        img._localFallback = it.local; // CDN img will retry with local on failure
      }
    }
  });
}

function renderWorkTimer(rec) {
  const labelEl = document.getElementById('stat-timer-label');
  const timerEl = document.getElementById('stat-work-timer');
  if (!labelEl || !timerEl) return;
  if (!rec?.checkIn) {
    labelEl.textContent = 'เวลาทำงาน';
    timerEl.textContent = '—';
    timerEl.style.color = 'var(--text3)';
    return;
  }
  const summary = (typeof calcWorkTimeSummary === 'function')
    ? calcWorkTimeSummary(rec) : { timerLabel: '—', timerMinutes: 0, timerMode: null, workPhase: null };
  labelEl.textContent = summary.timerLabel;
  const fmt = (typeof formatDurationMinutes === 'function') ? formatDurationMinutes : function(m) { return m + ' นาที'; };
  timerEl.textContent = fmt(summary.timerMinutes);
  if (summary.workPhase === 'lunch_break') timerEl.style.color = 'var(--orange)';
  else if (summary.workPhase === 'checked_out') timerEl.style.color = 'var(--accent)';
  else timerEl.style.color = 'var(--green)';
}

function renderDailySummary(rec) {
  const card = document.getElementById('daily-summary-card');
  const body = document.getElementById('daily-summary-body');
  if (!card || !body || !rec?.checkOut) { if (card) card.style.display = 'none'; return; }
  const s = (typeof calcWorkTimeSummary === 'function') ? calcWorkTimeSummary(rec) : null;
  if (!s) { card.style.display = 'none'; return; }
  const fmt = (typeof formatDurationMinutes === 'function') ? formatDurationMinutes : function(m) { return m + ' นาที'; };
  const lateLine = rec.isLate && rec.lateMinutes
    ? '<div>มาสาย: <strong style="color:var(--orange);">' + (typeof formatLateLabel === 'function' ? formatLateLabel(rec.lateMinutes) : rec.lateMinutes + ' นาที') + '</strong></div>'
    : '<div>มาสาย: <strong style="color:var(--green);">ตรงเวลา</strong></div>';
  const otLine = s.overtimeMinutes > 0
    ? '<div>ล่วงเวลา (OT): <strong style="color:var(--purple);">' + fmt(s.overtimeMinutes) + '</strong></div>' : '';
  body.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px 20px;">' +
    '<div>เวลาเข้างาน: <strong style="color:var(--text);">' + (s.checkInTime || '—') + '</strong></div>' +
    '<div>พักเที่ยงออก: <strong style="color:var(--text);">' + (s.lunchOutTime || '—') + '</strong></div>' +
    '<div>พักเที่ยงเข้า: <strong style="color:var(--text);">' + (s.lunchInTime || '—') + '</strong></div>' +
    '<div>เวลาออกงาน: <strong style="color:var(--text);">' + (s.checkOutTime || '—') + '</strong></div>' +
    '</div>' +
    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
    '<div>วันนี้ทำงาน: <strong style="color:var(--green);font-size:15px;">' + fmt(s.totalWorkMinutes) + '</strong></div>' +
    '<div>พักเที่ยงรวม: <strong style="color:var(--text);">' + fmt(s.totalBreakMinutes) + '</strong></div>' +
    lateLine + otLine +
    (rec.workStatus && rec.workStatus !== 'เลิกงานปกติ' ? '<div>สถานะเลิกงาน: ' + rec.workStatus + '</div>' : '') +
    '</div>';
  card.style.display = 'block';
}

function renderFaceScanLog() {
  const tb = document.getElementById('face-scan-log-body');
  if (!tb) return;
  let logs = [];
  try { logs = JSON.parse(localStorage.getItem('hrflow_faceScanLogs') || '[]'); } catch { logs = []; }
  if (!logs.length) {
    tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3)">ยังไม่มีประวัติสแกน</td></tr>';
    return;
  }
  tb.innerHTML = logs.slice(0, 20).map(function(entry) {
    const ok = entry.result === 'accept' || entry.result === 'confirmed';
    return '<tr>' +
      '<td>' + (entry.time ? thTime(entry.time) : '—') + '</td>' +
      '<td><span class="tag ' + (ok ? 'green' : 'red') + '">' + (ok ? 'ผ่าน' : 'ไม่ผ่าน') + '</span></td>' +
      '<td>' + (entry.confidence != null ? (Math.round(entry.confidence * 100) + '%') : '—') + '</td>' +
      '<td style="font-size:12px;color:var(--text3)">' + (entry.note || entry.result || '—') + '</td></tr>';
  }).join('');
}

function renderAttendanceUI() {
  const rec = getTodayDisplayRecord();
  const dayComplete = isDayAttendanceComplete();
  const firstCheckIn = getTodayData().sessions.find(s => s.checkIn);
  const lastCheckOut = [...getTodayData().sessions].reverse().find(s => s.checkOut);

  renderWorkTimer(rec);
  if (rec?.checkOut) renderDailySummary(rec);
  else {
    const sumCard = document.getElementById('daily-summary-card');
    if (sumCard) sumCard.style.display = 'none';
  }

  document.getElementById('stat-checkin').textContent = fmtTime(firstCheckIn?.checkIn || rec?.checkIn);
  document.getElementById('stat-checkout').textContent = fmtTime(rec?.checkOut || lastCheckOut?.checkOut);
  // สถานะแบบละเอียดตามขั้นตอน
  let stepStatus = 'ยังไม่เช็คอิน';
  let stepColor  = 'var(--text3)';
  const phase = rec?.workPhase || (rec?.checkOut ? 'checked_out' : (rec?.lunchOut && !rec?.lunchIn ? 'lunch_break' : rec?.checkIn ? 'working' : null));
  if (dayComplete || phase === 'checked_out') {
    stepStatus = '✅ เช็คเอาท์แล้ว'; stepColor = 'var(--accent)';
  } else if (phase === 'lunch_break') {
    stepStatus = '☕ กำลังพักกลางวัน'; stepColor = 'var(--orange)';
  } else if (rec?.checkIn && rec?.lunchIn) {
    stepStatus = '🔔 กลับจากพักแล้ว'; stepColor = 'var(--green)';
  } else if (phase === 'working') {
    stepStatus = '🟢 กำลังทำงาน'; stepColor = 'var(--green)';
  }
  document.getElementById('stat-status').textContent = stepStatus;
  document.getElementById('stat-status').style.color  = stepColor;
  document.getElementById('stat-type').textContent = rec
    ? (rec.isOutside ? 'นอกสถานที่' : 'ในบริษัท')
    : '—';
  document.getElementById('stat-type').style.color = rec?.isOutside ? 'var(--orange)' : 'var(--accent3)';

  const extras = document.getElementById('att-extras-wrap');
  if (rec?.checkIn) {
    extras.style.display = 'block';
    renderTimeline(rec);
    renderPhotos(rec);
  } else {
    extras.style.display = 'none';
  }

  const actions = document.getElementById('att-actions');

  if (activePanel) {
    const backLabel = activePanel.startsWith('checkin') ? '← เปลี่ยนประเภท' : '← ยกเลิก';
    actions.innerHTML = `<button type="button" class="att-back" onclick="closePanel()">${backLabel}</button>`;
    return;
  }

  let html = '';
  const nextKey = getNextActionKey();

  if (dayComplete && rec) {
    html += '<div class="att-step-row">';
    ACTION_FLOW.forEach((step) => {
      html += `<div class="att-step">
        <div class="att-step-dot done">✓</div>
        <div class="att-step-label done">${step.label}</div>
      </div>`;
    });
    html += '</div>';
    html += `<button type="button" class="btn-main-action" disabled style="opacity:.65;cursor:not-allowed;background:rgba(255,255,255,.08);color:var(--text2);">
      <span style="font-size:22px;">✅</span>
      <span>ลงเวลาครบแล้ว</span>
      <span style="font-size:11px;font-weight:400;opacity:.85;">${fmtTime(rec.checkIn)} — ${fmtTime(rec.checkOut)} น.</span>
    </button>`;
  } else if (nextKey) {
    html += '<div class="att-step-row">';
    ACTION_FLOW.forEach((step) => {
      const done = stepDoneKey(step.key, rec);
      const current = step.key === nextKey;
      html += `<div class="att-step">
        <div class="att-step-dot ${done ? 'done' : ''} ${current ? 'current' : ''}">${done ? '✓' : ACTION_FLOW.indexOf(step) + 1}</div>
        <div class="att-step-label ${done ? 'done' : ''} ${current ? 'current' : ''}">${step.label}</div>
      </div>`;
    });
    html += '</div>';

    if (nextKey === 'checkin') {
      html += `<div class="att-loc-toggle">
        <button type="button" class="${checkinLocationMode === 'company' ? 'active company' : ''}" onclick="setCheckinLocation('company')">🏢 ในบริษัท</button>
        <button type="button" class="${checkinLocationMode === 'outside' ? 'active outside' : ''}" onclick="setCheckinLocation('outside')">📍 นอกสถานที่</button>
      </div>`;
    }

    const stepMeta = ACTION_FLOW.find(s => s.key === nextKey);
    html += `<button type="button" class="btn-main-action ${stepMeta?.cls || ''}" onclick="openNextActionPanel()">
      <span style="font-size:22px;">${stepMeta?.icon || ''}</span>
      <span>${stepMeta?.label || ''}</span>
      <span style="font-size:11px;font-weight:400;opacity:.85;">กดเพื่อสแกนใบหน้า — เปิดกล้องอัตโนมัติ</span>
    </button>`;
  }

  actions.innerHTML = html;
}


// ── SAVE PHOTO TO DEVICE ──────────────────────────────────────────────────────
// Creates an annotated attendance image and saves it to the user's device.
// Called synchronously (close to user gesture) so Web Share API works on mobile.
function saveAttendancePhotoToDevice(photoDataUrl, rec, scanType) {
  if (!photoDataUrl) return;
  const user  = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  const s     = (typeof getCompanySettings === 'function') ? getCompanySettings() : {};

  const tsMap = {
    'checkin-company': rec.checkIn, 'checkin-outside': rec.checkIn,
    'lunch-out': rec.lunchOut, 'lunch-in': rec.lunchIn, 'checkout': rec.checkOut,
  };
  const ts = new Date(tsMap[scanType] || Date.now());

  const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const TH_DAYS   = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  // ใช้ Bangkok timezone ตลอดสำหรับ annotation บนรูป
  const bkkTs = new Date(ts.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const dateStr = bkkTs.getDate() + ' ' + TH_MONTHS[bkkTs.getMonth()] + ' ' + (bkkTs.getFullYear() + 543);
  const dayStr  = TH_DAYS[bkkTs.getDay()];
  const timeStr = ts.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });

  const lateStatus = (typeof calcLateStatus === 'function') ? calcLateStatus(scanType, ts) : '—';
  const isLate     = lateStatus.includes('สาย');

  const scanLabels = {
    'checkin-company': 'Check In (ในบริษัท)',
    'checkin-outside': 'Check In (นอกสถานที่)',
    'lunch-out':       'Lunch Start',
    'lunch-in':        'Lunch End',
    'checkout':        'Check Out',
  };
  const scanLabel = scanLabels[scanType] || scanType;
  const locText   = (rec.address || '').split(',')[0].trim() ||
                    (rec.lat ? rec.lat.toFixed(5) + ', ' + rec.lng.toFixed(5) : '—');

  // File name: att_checkin-company_20260530_0802.jpg
  const dateTag = ts.toISOString().slice(0, 10).replace(/-/g, '');
  const timeTag = timeStr.replace(/:/g, '').replace(/\s/g, '');
  const fileName = 'att_' + scanType + '_' + dateTag + '_' + timeTag + '.jpg';

  const img = new Image();
  img.onload = function () {
    const PW = img.width  || 480;
    const PH = img.height || 360;
    const FOOTER = 130;

    const canvas = document.createElement('canvas');
    canvas.width  = PW;
    canvas.height = PH + FOOTER;
    const ctx = canvas.getContext('2d');

    // ── Face photo ──
    ctx.drawImage(img, 0, 0, PW, PH);

    // Subtle vignette on photo bottom
    const grad = ctx.createLinearGradient(0, PH - 60, 0, PH);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(10,13,20,0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, PH - 60, PW, 60);

    // ── Footer background ──
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, PH, PW, FOOTER);

    // Accent stripe (green = on-time, orange = late)
    ctx.fillStyle = isLate ? '#f97316' : '#22c55e';
    ctx.fillRect(0, PH, PW, 4);

    // Font stack with Thai support
    const FONT = '"IBM Plex Sans Thai", "Noto Sans Thai", sans-serif';

    // ── Scan-type badge ──
    const badgeColors = {
      'checkin-company': '#3b82f6', 'checkin-outside': '#f97316',
      'lunch-out': '#d97706', 'lunch-in': '#f59e0b', 'checkout': '#6366f1',
    };
    const bColor = badgeColors[scanType] || '#3b82f6';
    ctx.fillStyle = bColor;
    const BADGE_W = Math.min(ctx.measureText(scanLabel).width + 24, PW - 32);
    roundRect(ctx, 16, PH + 14, BADGE_W + 16, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(scanLabel, 24, PH + 29);

    // ── Late status (right) ──
    ctx.textAlign = 'right';
    ctx.fillStyle = isLate ? '#f97316' : '#22c55e';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(lateStatus, PW - 16, PH + 29);

    // ── Employee name ──
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText((user && user.name) || '—', 16, PH + 60);

    // Employee code + dept
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px ' + FONT;
    const meta2 = [(user && user.id) || '', (user && user.dept) || ''].filter(Boolean).join(' · ');
    ctx.fillText(meta2, 16, PH + 76);

    // ── Date + time (right) ──
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(timeStr, PW - 16, PH + 60);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px ' + FONT;
    ctx.fillText(dateStr + ' (' + dayStr + ')', PW - 16, PH + 76);

    // ── Location ──
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px ' + FONT;
    ctx.fillText('\u{1F4CD} ' + locText.substring(0, Math.floor(PW / 6.5)), 16, PH + 98);

    // ── Company watermark ──
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1e293b';
    ctx.font = '10px ' + FONT;
    ctx.fillText(s.companyName || 'เค เอ็ม เซอร์วิส พลัส', PW - 16, PH + 120);

    const annotated = canvas.toDataURL('image/jpeg', 0.93);

    // ── Try Web Share (saves to Photos on mobile) ──
    if (navigator.share && navigator.canShare) {
      fetch(annotated)
        .then(r => r.blob())
        .then(function (blob) {
          const file = new File([blob], fileName, { type: 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            return navigator.share({
              files: [file],
              title: 'ลงเวลางาน — ' + scanLabel,
              text:  (user && user.name || '') + ' ' + scanLabel + ' ' + timeStr + ' ' + dateStr,
            });
          }
          throw new Error('canShare false');
        })
        .catch(function (err) {
          if (err && err.name !== 'AbortError') triggerDownload(annotated, fileName);
        });
    } else {
      triggerDownload(annotated, fileName);
    }
  };
  img.onerror = function () { console.warn('saveAttendancePhotoToDevice: image load failed'); };
  img.src = photoDataUrl;
}

function triggerDownload(dataUrl, fileName) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { a.remove(); }, 1500);
}

// Canvas rounded-rect helper (no Path2D required)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── LATE STATUS ───────────────────────────────────────────────────────────────
// ใช้ calcLateInfoCore จาก hr-core.js (workStart + lateGrace)
function calcLateInfo(scanType, time) {
  const notCheckin = scanType !== 'checkin-company' && scanType !== 'checkin-outside';
  if (notCheckin) return { isLate: false, lateMinutes: 0, lateStatus: 'ไม่ใช่เช็คอิน', checkInTime: null };
  if (typeof calcLateInfoCore === 'function') return calcLateInfoCore(time);
  return { isLate: false, lateMinutes: 0, lateStatus: 'ตรงเวลา', checkInTime: null };
}

function calcLateStatus(scanType, time) {
  return calcLateInfo(scanType, time).lateStatus;
}

// ── CHECKOUT STATUS ─────────────────────────────────────────────────────────
// คืนข้อมูลกลับก่อนเวลาแบบ structured — timezone: Asia/Bangkok
function calcCheckoutInfo(scanType, time) {
  if (scanType !== 'checkout') {
    return { earlyLeave: false, earlyLeaveMinutes: 0, workStatus: 'ไม่ใช่เช็คเอาท์', checkOutTime: null };
  }

  const s = (typeof getCompanySettings === 'function') ? getCompanySettings() : {};
  const workEndStr = s.workEnd || '17:30';
  const parts = workEndStr.split(':');
  const workH = parseInt(parts[0], 10);
  const workM = parseInt(parts[1], 10);

  // Asia/Bangkok timezone
  const bkk = new Date(time.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const deadline = new Date(bkk);
  deadline.setHours(workH, workM, 0, 0);

  const earlyLeave = bkk < deadline;
  const earlyLeaveMinutes = earlyLeave ? Math.round((deadline.getTime() - bkk.getTime()) / 60000) : 0;
  const workStatus = earlyLeave ? ('กลับก่อนเวลา ' + earlyLeaveMinutes + ' นาที') : 'เลิกงานปกติ';
  const checkOutTime = bkk.toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  });

  return { earlyLeave, earlyLeaveMinutes, workStatus, checkOutTime };
}

// ── CLOUDINARY UPLOAD (ไม่ส่ง LINE OA) ───────────────────────────────────────
async function uploadAttendancePhotoCdn(rec, scanType, photoDataUrl) {
  const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!user || !photoDataUrl) return;
  const s = (typeof getCompanySettings === 'function') ? getCompanySettings() : {};
  if (!s.cloudinaryCloud || !s.cloudinaryPreset) return;

  try {
    const folderMap = {
      'checkin-company': 'checkin', 'checkin-outside': 'checkin',
      'lunch-out': 'lunch-out', 'lunch-in': 'lunch-in', 'checkout': 'checkout',
    };
    // console.log('[CDN] upload started for', scanType);
    const cdnResult = await uploadToCloudinary(photoDataUrl, {
      folder: 'attendance/' + (user.id || 'unknown') + '/' + (folderMap[scanType] || scanType),
      tags: 'attendance,' + scanType + ',' + (user.id || 'unknown'),
    });
    // Validate: must be a full HTTPS URL — never store public_id or partial paths
    const secureUrl = cdnResult && cdnResult.secure_url;
    if (!secureUrl || typeof secureUrl !== 'string' || !secureUrl.startsWith('https://')) {
      console.error('[CDN] Cloudinary response missing valid secure_url:', JSON.stringify(cdnResult).substring(0, 200));
      return;
    }
    // console.log('[CDN] upload result secure_url:', secureUrl);
    // console.log('[CDN] saved attendance image url:', secureUrl);

    const stored = getTodayRecord();
    if (stored) {
      const fieldMap = {
        'checkin-company': 'photoUrlCdn', 'checkin-outside': 'photoUrlCdn',
        'lunch-out': 'lunchOutPhotoUrlCdn', 'lunch-in': 'lunchInPhotoUrlCdn',
        'checkout': 'checkOutPhotoUrlCdn',
      };
      const field = fieldMap[scanType];
      if (field) {
        stored[field] = secureUrl;
        saveTodayRecord(stored);
        // console.log('[CDN] saved CDN URL to field:', field, secureUrl);
        // Re-render so UI picks up the CDN URL immediately (was showing data URL before)
        if (typeof renderAttendanceUI === 'function') renderAttendanceUI();
      }
    }
  } catch (err) {
    console.warn('[CDN] Cloudinary upload skipped:', err.message || err);
  }
}

// ── LATE REPORT (HR/Admin) ────────────────────────────────────────────────────
function getLateHistory() {
  const records = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('hrflow_today_')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      if (!data || !Array.isArray(data.sessions)) continue;
      const dateMatch = key.match(/(\d{4}-\d{2}-\d{2})$/);
      const dateKey = dateMatch ? dateMatch[1] : null;
      data.sessions.forEach(function(s) {
        if (!s.checkIn || !s.isLate) return;
        records.push({
          dateKey:     dateKey,
          checkInTime: s.checkInTime || fmtTime(s.checkIn),
          lateMinutes: s.lateMinutes || 0,
          lateStatus:  s.lateStatus  || 'มาสาย',
          isOutside:   s.isOutside,
          sessionIdx:  s.sessionIndex || 1,
        });
      });
    } catch (e) { console.warn('[attendance] malformed data at key:', key, e); }
  }
  records.sort(function(a, b) { return (b.dateKey || '').localeCompare(a.dateKey || ''); });
  return records;
}

function renderLateReport() {
  const container = document.getElementById('late-report-container');
  if (!container) return;
  const records = getLateHistory();
  if (!records.length) {
    container.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px;">ไม่มีประวัติมาสาย</div>';
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>วันที่</th><th>รอบ</th><th>เวลาเช็คอิน</th><th>เวลาสาย</th><th>ประเภท</th></tr></thead>
        <tbody>
          ${records.map(function(r) {
            return '<tr>' +
              '<td>' + (r.dateKey || '—') + '</td>' +
              '<td style="text-align:center;">' + r.sessionIdx + '</td>' +
              '<td><span style="color:var(--orange);font-weight:600;">' + r.checkInTime + '</span></td>' +
              '<td><span class="tag orange">' + formatLateMinutes(r.lateMinutes) + '</span></td>' +
              '<td>' + (r.isOutside ? '<span class="tag orange">นอกสถานที่</span>' : '<span class="tag blue">ในบริษัท</span>') + '</td>' +
              '</tr>';
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── [5] EXPORT CSV (HR/Admin) ─────────────────────────────────────────────────
function getAllAttendanceData() {
  const rows = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('hrflow_today_')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      if (!data || !Array.isArray(data.sessions)) continue;
      const m = key.match(/hrflow_today_(.+)_(\d{4}-\d{2}-\d{2})$/);
      const email = m ? m[1] : '—';
      const dateKey = m ? m[2] : '—';
      data.sessions.forEach(function(s) {
        const wt = (typeof calcWorkTimeSummary === 'function') ? calcWorkTimeSummary(s) : {};
        rows.push({
          date: dateKey, email,
          sessionIndex: s.sessionIndex || 1,
          checkIn:  s.checkIn  ? fmtTime(s.checkIn)  : '—',
          lunchOut: s.lunchOut ? fmtTime(s.lunchOut) : '—',
          lunchIn:  s.lunchIn  ? fmtTime(s.lunchIn)  : '—',
          checkOut: s.checkOut ? fmtTime(s.checkOut) : '—',
          workPhase: wt.workPhase || s.workPhase || '—',
          totalWorkMinutes: wt.totalWorkMinutes || s.totalWorkMinutes || 0,
          totalBreakMinutes: wt.totalBreakMinutes || s.totalBreakMinutes || 0,
          overtimeMinutes: wt.overtimeMinutes || s.overtimeMinutes || 0,
          isLate:   s.isLate ? 'ใช่' : 'ไม่',
          lateMinutes:      s.lateMinutes || 0,
          earlyLeave:       s.earlyLeave ? 'ใช่' : 'ไม่',
          earlyLeaveMinutes: s.earlyLeaveMinutes || 0,
          workStatus:  s.workStatus  || '—',
          lateStatus:  s.isLate ? formatLateLabel(s.lateMinutes || 0) : '—',
          address:     s.address || '—',
          branch:      s.branch  || '—',
          department:  s.department || '—',
          isOutside:   s.isOutside ? 'นอกสถานที่' : 'ในบริษัท',
          faceVerified: s.faceVerified ? 'ผ่าน' : 'ไม่ผ่าน',
        });
      });
    } catch (e) { console.warn('[attendance] malformed data at key:', key, e); }
  }
  rows.sort(function(a, b) { return (b.date + b.email).localeCompare(a.date + a.email); });
  return rows;
}

function exportAttendanceCSV() {
  const rows = getAllAttendanceData();
  if (!rows.length) { alert('ไม่มีข้อมูลสำหรับ Export'); return; }
  const headers = ['วันที่','อีเมล','รอบ','เช็คอิน','พักออก','พักกลับ','เช็คเอาท์',
    'สถานะงาน','ทำงาน(นาที)','พัก(นาที)','OT(นาที)',
    'มาสาย','สาย(นาที)','กลับก่อน','กลับก่อน(นาที)','สถานะเลิกงาน','สถานะมาสาย',
    'ที่อยู่','สาขา','แผนก','ประเภทสถานที่','ยืนยันใบหน้า'];
  const csvRows = [headers.join(',')];
  rows.forEach(function(r) {
    csvRows.push([
      r.date, r.email, r.sessionIndex,
      r.checkIn, r.lunchOut, r.lunchIn, r.checkOut,
      r.workPhase, r.totalWorkMinutes, r.totalBreakMinutes, r.overtimeMinutes,
      r.isLate, r.lateMinutes, r.earlyLeave, r.earlyLeaveMinutes,
      r.workStatus, r.lateStatus,
      '"' + (r.address || '').replace(/"/g, '""') + '"',
      r.branch, r.department, r.isOutside, r.faceVerified,
    ].join(','));
  });
  const bom = '﻿'; // UTF-8 BOM for Excel Thai support
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'attendance_' + new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()) + '.csv';
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
}

// ── [6] HR MANUAL EDIT ATTENDANCE ─────────────────────────────────────────────
function openManualEditModal() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user || (user.role !== 'MANAGER_HR' && user.role !== 'ADMIN')) {
    alert('เฉพาะ HR/Admin เท่านั้น'); return;
  }
  const allKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('hrflow_today_')) allKeys.push(k);
  }
  allKeys.sort().reverse();

  const options = allKeys.slice(0, 30).map(function(k) {
    const m = k.match(/hrflow_today_(.+)_(\d{4}-\d{2}-\d{2})$/);
    return `<option value="${escapeHtml(k)}">${escapeHtml(m ? m[2] + ' — ' + m[1] : k)}</option>`;
  }).join('');

  const modalHtml = `
    <h3>✏️ แก้ไข Attendance Manual</h3>
    <div style="margin-bottom:12px;">
      <label style="font-size:13px;color:var(--text2);display:block;margin-bottom:6px;">เลือกวัน / User</label>
      <select id="me-key-select" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text);" onchange="loadManualEditSessions()">
        <option value="">— เลือก —</option>${options}
      </select>
    </div>
    <div id="me-sessions-wrap" style="margin-bottom:12px;"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn-outline" onclick="document.querySelector('.modal-backdrop').remove()">ปิด</button>
    </div>`;
  if (typeof openModal === 'function') openModal(modalHtml);
}

function loadManualEditSessions() {
  const sel = document.getElementById('me-key-select');
  const wrap = document.getElementById('me-sessions-wrap');
  if (!sel || !wrap || !sel.value) { if (wrap) wrap.innerHTML = ''; return; }
  try {
    const data = JSON.parse(localStorage.getItem(sel.value) || '{"sessions":[]}');
    if (!data.sessions.length) { wrap.innerHTML = '<p style="color:var(--text3);font-size:13px;">ไม่มี session</p>'; return; }
    wrap.innerHTML = data.sessions.map(function(s, idx) {
      const fields = ['checkIn','lunchOut','lunchIn','checkOut'];
      const labels = { checkIn: 'เช็คอิน', lunchOut: 'พักออก', lunchIn: 'พักกลับ', checkOut: 'เช็คเอาท์' };
      const inputs = fields.map(function(f) {
        const val = s[f] ? new Date(s[f]).toISOString().slice(0,16) : '';
        return `<div style="flex:1;min-width:140px;"><label style="font-size:11px;color:var(--text3);">${labels[f]}</label>
          <input type="datetime-local" id="me-${idx}-${f}" value="${escapeHtml(val)}"
            style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:12px;"></div>`;
      }).join('');
      return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">รอบ ${s.sessionIndex || idx+1}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">${inputs}</div>
        <div style="margin-bottom:8px;">
          <label style="font-size:11px;color:var(--text3);">เหตุผลการแก้ไข</label>
          <input type="text" id="me-${idx}-reason" placeholder="ระบุเหตุผล..."
            style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:12px;">
        </div>
        <button class="btn-primary" style="height:34px;font-size:12px;" onclick="applyManualEdit('${escapeHtml(sel.value)}',${idx})">💾 บันทึก</button>
      </div>`;
    }).join('');
  } catch { wrap.innerHTML = '<p style="color:var(--red);font-size:13px;">โหลดข้อมูลไม่สำเร็จ</p>'; }
}

function applyManualEdit(storageKey, sessionIdx) {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || '{"sessions":[]}');
    const s = data.sessions[sessionIdx];
    if (!s) { alert('ไม่พบ session'); return; }
    const editorUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const oldValue = JSON.stringify({ checkIn: s.checkIn, lunchOut: s.lunchOut, lunchIn: s.lunchIn, checkOut: s.checkOut });
    ['checkIn','lunchOut','lunchIn','checkOut'].forEach(function(f) {
      const el = document.getElementById('me-' + sessionIdx + '-' + f);
      if (el && el.value) s[f] = new Date(el.value).toISOString();
      else if (el && !el.value) s[f] = null;
    });
    if (s.checkIn && typeof calcLateInfoCore === 'function') {
      const late = calcLateInfoCore(s.checkIn);
      s.isLate = late.isLate;
      s.lateMinutes = late.lateMinutes;
      s.lateStatus = late.lateStatus;
      s.checkInTime = late.checkInTime;
    }
    const reasonEl = document.getElementById('me-' + sessionIdx + '-reason');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    // audit log
    if (!s.auditLog) s.auditLog = [];
    s.auditLog.push({
      editedBy: editorUser?.email || '—',
      editedAt: new Date().toISOString(),
      oldValue,
      newValue: JSON.stringify({ checkIn: s.checkIn, lunchOut: s.lunchOut, lunchIn: s.lunchIn, checkOut: s.checkOut }),
      reason,
    });
    if (typeof syncWorkTimeFields === 'function') syncWorkTimeFields(s);
    data.sessions[sessionIdx] = s;
    localStorage.setItem(storageKey, JSON.stringify(data));
    alert('บันทึกสำเร็จ — ระบบบันทึก audit log แล้ว');
    renderAttendanceUI();
  } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}


// ── [10] GPS LIVE LOCATION TTL (24h) ─────────────────────────────────────────
function cleanExpiredGpsLocations() {
  try {
    const locs = JSON.parse(localStorage.getItem('hrflow_liveLocations') || '{}');
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 ชั่วโมง
    let changed = false;
    Object.keys(locs).forEach(function(k) {
      if (!locs[k].updatedAt || new Date(locs[k].updatedAt).getTime() < cutoff) {
        delete locs[k]; changed = true;
      }
    });
    if (changed) localStorage.setItem('hrflow_liveLocations', JSON.stringify(locs));
  } catch (e) {
    console.warn('[attendance] corrupted hrflow_liveLocations during cleanup, clearing:', e);
    try { localStorage.removeItem('hrflow_liveLocations'); } catch { /* intentional: cleanup failure is non-critical, safe to ignore */ }
  }
}

// ── [11] FACE PROFILE BACKUP WARNING ─────────────────────────────────────────
function checkFaceProfileIntegrity() {
  if (typeof FaceCore === 'undefined') return;
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) return;
  const empId = FaceCore.resolveEmployeeId ? FaceCore.resolveEmployeeId(user) : null;
  if (!empId) return;
  const hasProfile = FaceCore.hasProfile && FaceCore.hasProfile(empId);
  if (!hasProfile) {
    const bar = document.getElementById('offline-queue-bar');
    const msg = document.getElementById('offline-queue-msg');
    if (bar && msg) {
      bar.style.display = 'flex';
      bar.style.background = 'rgba(249,115,22,.1)';
      bar.style.borderColor = 'rgba(249,115,22,.3)';
      msg.innerHTML = '⚠️ ยังไม่ได้ลงทะเบียนใบหน้า — <a href="settings.html#face" style="color:var(--accent);text-decoration:underline;">ลงทะเบียนที่นี่</a>';
    }
  }
}

// ── MIDNIGHT RESET ────────────────────────────────────────────────────────────
// รีเซ็ต state การสแกนในหน่วยความจำทุกเที่ยงคืน — ข้อมูล localStorage ไม่ถูกแตะ
// (key วันใหม่ hrflow_today_*_YYYY-MM-DD เริ่มว่างเปล่าโดยอัตโนมัติ)
function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

function midnightReset() {
  stopAutoScan();
  faceCaptured = false;
  faceMatch = null;
  lastCapturedPhoto = null;
  activePanel = null;
  checkinLocationMode = 'company';

  const captureBar = document.getElementById('att-capture-bar');
  if (captureBar) captureBar.style.display = 'none';
  const titleEl = document.getElementById('camera-card-title');
  if (titleEl) titleEl.textContent = '👤 สแกนใบหน้า';
  resetCaptureUI();
  renderAttendanceUI();

  scheduleMidnightReset();
}

function scheduleMidnightReset() {
  setTimeout(midnightReset, msUntilMidnight());
}

let _workTimerInterval = null;
function startWorkTimerTick() {
  if (_workTimerInterval) clearInterval(_workTimerInterval);
  _workTimerInterval = setInterval(function() {
    const rec = typeof getTodayDisplayRecord === 'function' ? getTodayDisplayRecord() : null;
    if (rec?.checkIn && !rec?.checkOut) renderWorkTimer(rec);
  }, 30000);
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof initRole === 'function') initRole();
  if (typeof purgeAttendanceLineQueue === 'function') purgeAttendanceLineQueue();
  renderAttendanceUI();
  renderFaceScanLog();
  startWorkTimerTick();
  initCamera();
  startRealTimeGPS();
  scheduleMidnightReset();
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (user && (user.role === 'MANAGER_HR' || user.role === 'ADMIN')) {
    setTimeout(refreshAllMap, 1500);
    renderLateReport();
  }

  // Release camera when leaving page or hiding tab
  window.addEventListener('beforeunload', cleanupCamera);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden' && !activePanel) cleanupCamera();
  });

  cleanExpiredGpsLocations(); // [10] GPS TTL cleanup
  setTimeout(checkFaceProfileIntegrity, 2000); // [11] face backup check
});
