// ── CAMERA INITIATION ──
let _cameraStream = null; // track active stream for cleanup

function cleanupCamera() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(function(t) { try { t.stop(); } catch { /* intentional: cleanup failure is non-critical, safe to ignore */ } });
    _cameraStream = null;
  }
  const video = document.getElementById('checkin-video');
  if (video) { video.srcObject = null; }
  stopAutoScan();
}

async function initCamera() {
  const video = document.getElementById('checkin-video');
  // 720×1280 ideal — works reliably on Android and iPhone front cameras
  // (1920×1080 caused delayed stream start and black frames on mobile)
  const constraints = {
    audio: false,
    video: {
      facingMode: 'user',
      width:  { ideal: 720 },
      height: { ideal: 1280 },
    },
  };
  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    }
    _cameraStream = stream;
    video.srcObject = stream;

    // iOS Safari: must wait for loadedmetadata BEFORE calling play(),
    // otherwise play() fails silently and video stays black.
    await new Promise(function(resolve) {
      if (video.readyState >= 1) { resolve(); return; }
      var done = false;
      var onMeta = function() {
        if (done) return; done = true;
        video.removeEventListener('loadedmetadata', onMeta);
        resolve();
      };
      video.addEventListener('loadedmetadata', onMeta);
      setTimeout(onMeta, 5000); // safety timeout
    });

    await video.play().catch(() => {});
    // console.log('[CAM] initCamera: readyState=' + video.readyState + ' w=' + video.videoWidth + ' h=' + video.videoHeight);
    setScanStatus('มองกล้องตรงเพื่อสแกนใบหน้า', 'var(--text2)');
    if (typeof FaceCore !== 'undefined') FaceCore.loadModels().catch(() => {});
  } catch (err) {
    console.error('[CAM] initCamera error:', err);
    setScanStatus('ไม่สามารถเข้าถึงกล้องได้: ' + err.message, 'var(--red)');
  }
}


// ── [7] FACE MATCHING TIMEOUT ─────────────────────────────────────────────────
const FACE_SCAN_TIMEOUT_MS = 12000; // 12 วินาที
let _faceTimeoutTimer = null;

function startFaceScanTimeout() {
  clearFaceScanTimeout();
  _faceTimeoutTimer = setTimeout(function() {
    if (!autoScanActive && !matching) return;
    stopAutoScan();
    matching = false;
    setScanStatus('⏱ สแกนใช้เวลานานเกินไป กรุณากดสแกนใหม่', 'var(--orange)');
    const rescanBtn = document.getElementById('btn-rescan');
    if (rescanBtn) rescanBtn.style.display = 'block';
  }, FACE_SCAN_TIMEOUT_MS);
}

function clearFaceScanTimeout() {
  if (_faceTimeoutTimer) { clearTimeout(_faceTimeoutTimer); _faceTimeoutTimer = null; }
}

