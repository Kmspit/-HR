/**
 * face-core.js — Real client-side Face Recognition engine for เค เอ็ม เซอร์วิส พลัส
 *
 * Why this file exists:
 *   The previous "face recognition" did NOT compare faces at all — capture just
 *   set a boolean flag. This module adds a real pipeline running fully in the
 *   browser (no backend needed, matches the existing CDN + localStorage stack):
 *
 *     camera frame -> quality check -> preprocess -> 128-d descriptor (face-api.js)
 *                  -> compare ONLY against the logged-in user's registered face
 *                  -> accept / confirm / reject (configurable threshold) + debug log
 *
 * Architecture notes (kept consistent with hr-core.js):
 *   - State persisted in localStorage under hrflow_* keys via lsGet/lsSet.
 *   - face-api.js + weights loaded lazily from CDN (configurable in settings).
 *   - Descriptors are matched per-employeeId; we NEVER compare across users.
 *
 * Public API (window.FaceCore):
 *   loadModels(), isReady()
 *   resolveEmployeeId(user?), getCurrentEmployeeId()
 *   getFaceConfig(), REGISTRATION_ANGLES
 *   detectBest(input), assessQuality(input), capturePreprocessed(video)
 *   getProfile(employeeId), hasProfile(employeeId)
 *   registerSample(employeeId, angleKey, input), removeProfile(employeeId)
 *   matchFace(employeeId, input, opts?)
 *   getScanLogs(), clearScanLogs()
 *
 * @typedef {Object} QualityResult
 * @property {boolean} ok
 * @property {string[]} reasons      machine-readable reason codes
 * @property {string}  message       Thai user-facing message ('' when ok)
 * @property {Object}  metrics       { brightness, sharpness, faceRatio, yaw, detScore }
 *
 * @typedef {Object} DetectResult
 * @property {Float32Array} descriptor
 * @property {Object} detection      raw face-api detection
 * @property {{x:number,y:number,width:number,height:number}} box
 * @property {Object} landmarks
 * @property {number} score          detector confidence
 *
 * @typedef {Object} MatchResult
 * @property {'accept'|'confirm'|'reject'} decision
 * @property {number} confidence     0..1 (higher = more similar)
 * @property {number} distance       euclidean descriptor distance (lower = closer)
 * @property {number} threshold      accept threshold used
 * @property {number} confirmFloor   confirm floor used
 * @property {string} reason         reason code
 * @property {string} message        Thai user-facing message
 * @property {string|null} matchedEmployeeId
 */

(function () {
  'use strict';

  // ── Config defaults ─────────────────────────────────────────────────────────
  const DEFAULTS = {
    enabled: true,
    // confidence space (higher = more similar). distance≈0.4 -> confidence≈0.6
    threshold: 0.6,        // accept at/above this (admin-configurable 0.55–0.65)
    confirmFloor: 0.5,     // [confirmFloor, threshold) => ask user to confirm
    // quality gates
    minBrightness: 55,     // mean luma 0..255
    maxBrightness: 235,
    minSharpness: 18,      // variance-of-Laplacian proxy
    minFaceRatio: 0.16,    // face box shortest side / frame shortest side
    maxYaw: 0.34,          // normalized head-turn (0 straight .. ~1 profile)
    minDetScore: 0.45,     // detector confidence
    detectorInputSize: 416,
    modelUrl: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/',
    scriptUrl: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js',
  };

  // Multi-sample registration improves matching accuracy via an averaged
  // template. NOTE: these are NOT liveness/motion challenges — every sample is a
  // simple straight-on capture (no head turning, blinking, or movement).
  const REGISTRATION_ANGLES = [
    { key: 'shot1', icon: '📸', label: 'ภาพที่ 1', hint: 'มองกล้องตรง ใบหน้าอยู่กลางกรอบ' },
    { key: 'shot2', icon: '📸', label: 'ภาพที่ 2', hint: 'มองกล้องตรง อีกครั้ง' },
    { key: 'shot3', icon: '📸', label: 'ภาพที่ 3', hint: 'มองกล้องตรง ในที่แสงสว่างเพียงพอ' },
    { key: 'shot4', icon: '📸', label: 'ภาพที่ 4', hint: 'มองกล้องตรง ระยะปกติ' },
    { key: 'shot5', icon: '📸', label: 'ภาพที่ 5', hint: 'มองกล้องตรง (ยิ้มได้)' },
  ];
  const MIN_SAMPLES = 3;
  const STANDARD_SIZE = 224; // preprocessed face is normalized to this square

  const PROFILES_KEY = 'faceProfiles'; // hrflow_faceProfiles
  const LOGS_KEY = 'faceScanLogs';     // hrflow_faceScanLogs
  const MAX_LOGS = 200;

  let _loadPromise = null;
  let _ready = false;

  // ── localStorage helpers (reuse hr-core.js if present, else local) ───────────
  function lsGetSafe(key, fallback) {
    if (typeof lsGet === 'function') return lsGet(key, fallback);
    try { return JSON.parse(localStorage.getItem('hrflow_' + key)) ?? fallback; }
    catch { return fallback; }
  }
  function lsSetSafe(key, value) {
    if (typeof lsSet === 'function') return lsSet(key, value);
    localStorage.setItem('hrflow_' + key, JSON.stringify(value));
  }

  // ── Config ───────────────────────────────────────────────────────────────────
  function getFaceConfig() {
    const settings = (typeof getCompanySettings === 'function') ? getCompanySettings() : {};
    const f = settings.face || {};
    const cfg = Object.assign({}, DEFAULTS, f);
    // sanitise admin-entered values
    cfg.threshold = clamp(num(cfg.threshold, DEFAULTS.threshold), 0.3, 0.9);
    cfg.confirmFloor = clamp(num(cfg.confirmFloor, DEFAULTS.confirmFloor), 0.2, cfg.threshold);
    return cfg;
  }

  // ── Session / identity ────────────────────────────────────────────────────────
  /**
   * Resolve the canonical employeeId for a user object. Session users only carry
   * an email, so we map email -> employee record id. This is the anchor that
   * guarantees we only ever compare against THIS user's registered face.
   */
  function resolveEmployeeId(user) {
    const u = user || (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
    if (!u) return null;
    if (u.id) return u.id;
    const email = (u.email || '').toLowerCase();
    if (!email) return null;
    if (typeof getEmployees === 'function') {
      const emp = getEmployees().find(e => (e.email || '').toLowerCase() === email);
      if (emp) return emp.id;
    }
    return 'email:' + email; // stable fallback key
  }

  function getCurrentEmployeeId() {
    return resolveEmployeeId(null);
  }

  // ── Model loading ──────────────────────────────────────────────────────────────
  function injectScript(src) {
    return new Promise((resolve, reject) => {
      if (window.faceapi) return resolve();
      const existing = document.querySelector(`script[data-faceapi="1"]`);
      if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', reject); return; }
      const s = document.createElement('script');
      s.src = src; s.async = true; s.dataset.faceapi = '1';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('โหลดไลบรารี face-api ไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)'));
      document.head.appendChild(s);
    });
  }

  function loadModels() {
    if (_loadPromise) return _loadPromise;
    const cfg = getFaceConfig();
    _loadPromise = (async () => {
      await injectScript(cfg.scriptUrl);
      if (!window.faceapi) throw new Error('faceapi ไม่พร้อมใช้งาน');
      const url = cfg.modelUrl;
      await faceapi.nets.tinyFaceDetector.loadFromUri(url);
      await faceapi.nets.faceLandmark68Net.loadFromUri(url);
      await faceapi.nets.faceRecognitionNet.loadFromUri(url);
      _ready = true;
      return true;
    })().catch(err => {
      _loadPromise = null; // allow retry
      throw err;
    });
    return _loadPromise;
  }

  function isReady() { return _ready; }

  function detectorOptions() {
    const cfg = getFaceConfig();
    return new faceapi.TinyFaceDetectorOptions({ inputSize: cfg.detectorInputSize, scoreThreshold: 0.3 });
  }

  // ── Detection + descriptor ──────────────────────────────────────────────────────
  /**
   * Detect the single most prominent face and return its descriptor + geometry.
   * @returns {Promise<DetectResult|null>}
   */
  async function detectBest(input) {
    await loadModels();
    const det = await faceapi
      .detectSingleFace(input, detectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!det) return null;
    const b = det.detection.box;
    return {
      descriptor: det.descriptor,
      detection: det.detection,
      box: { x: b.x, y: b.y, width: b.width, height: b.height },
      landmarks: det.landmarks,
      score: det.detection.score,
    };
  }

  // ── Quality assessment ────────────────────────────────────────────────────────
  function toCanvas(input) {
    const c = document.createElement('canvas');
    const w = input.videoWidth || input.naturalWidth || input.width;
    const h = input.videoHeight || input.naturalHeight || input.height;
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(input, 0, 0, w, h);
    return c;
  }

  /** Mean luma over a downscaled grayscale copy. */
  function measureBrightness(ctx, w, h) {
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0; const n = w * h;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return sum / n;
  }

  /** Variance-of-Laplacian proxy for blur (higher = sharper). */
  function measureSharpness(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0, j = 0; i < img.length; i += 4, j++) {
      gray[j] = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    }
    let sum = 0, sumSq = 0, count = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = gray[idx - 1] + gray[idx + 1] + gray[idx - w] + gray[idx + w] - 4 * gray[idx];
        sum += lap; sumSq += lap * lap; count++;
      }
    }
    if (!count) return 0;
    const mean = sum / count;
    return sumSq / count - mean * mean;
  }

  /** Normalized head yaw from eye/nose landmark geometry (0 straight .. ~1 profile). */
  function measureYaw(landmarks) {
    try {
      const le = centroid(landmarks.getLeftEye());
      const re = centroid(landmarks.getRightEye());
      const nose = centroid(landmarks.getNose());
      const eyeMidX = (le.x + re.x) / 2;
      const eyeSpan = Math.abs(re.x - le.x) || 1;
      return Math.min(1, Math.abs(nose.x - eyeMidX) / (eyeSpan * 0.5));
    } catch { return 0; }
  }

  function centroid(points) {
    let x = 0, y = 0;
    points.forEach(p => { x += p.x; y += p.y; });
    return { x: x / points.length, y: y / points.length };
  }

  /**
   * Run all pre-scan quality gates. Returns a single user-facing Thai message
   * when something is wrong (req 7).
   * @param {DetectResult|null} det  optional pre-computed detection (avoids double work)
   * @returns {Promise<QualityResult>}
   */
  async function assessQuality(input, det) {
    const cfg = getFaceConfig();
    const detection = det || await detectBest(input);
    const reasons = [];
    const metrics = { brightness: 0, sharpness: 0, faceRatio: 0, yaw: 0, detScore: 0 };

    // brightness + sharpness on a downscaled copy (fast)
    const small = document.createElement('canvas');
    const sw = 160, sh = Math.round(160 * ((input.videoHeight || input.height || 120) / (input.videoWidth || input.width || 160)));
    small.width = sw; small.height = sh || 120;
    const sctx = small.getContext('2d');
    sctx.drawImage(input, 0, 0, small.width, small.height);
    metrics.brightness = measureBrightness(sctx, small.width, small.height);
    metrics.sharpness = measureSharpness(sctx, small.width, small.height);

    if (metrics.brightness < cfg.minBrightness) reasons.push('too_dark');
    else if (metrics.brightness > cfg.maxBrightness) reasons.push('too_bright');
    if (metrics.sharpness < cfg.minSharpness) reasons.push('blurry');

    if (!detection) {
      reasons.push('no_face');
    } else {
      metrics.detScore = detection.score;
      const frameShort = Math.min(input.videoWidth || input.width, input.videoHeight || input.height);
      const faceShort = Math.min(detection.box.width, detection.box.height);
      metrics.faceRatio = frameShort ? faceShort / frameShort : 0;
      metrics.yaw = measureYaw(detection.landmarks);
      if (detection.score < cfg.minDetScore) reasons.push('low_confidence');
      if (metrics.faceRatio < cfg.minFaceRatio) reasons.push('face_too_small');
      if (metrics.yaw > cfg.maxYaw) reasons.push('too_turned');
    }

    const ok = reasons.length === 0;
    return { ok, reasons, message: ok ? '' : qualityMessage(reasons), metrics, detection };
  }

  function qualityMessage(reasons) {
    // One friendly catch-all (per spec) + a specific hint when useful.
    const base = 'กรุณาอยู่ในที่แสงเพียงพอ และมองกล้องตรง';
    const specific = {
      no_face: 'ไม่พบใบหน้าในกรอบ',
      too_dark: 'ภาพมืดเกินไป',
      too_bright: 'แสงจ้าเกินไป',
      blurry: 'ภาพเบลอ กรุณาถือกล้องให้นิ่ง',
      face_too_small: 'ใบหน้าเล็กเกินไป กรุณาเข้าใกล้กล้อง',
      too_turned: 'หันหน้ามากเกินไป',
      low_confidence: 'ตรวจจับใบหน้าได้ไม่ชัด',
    };
    const hint = reasons.map(r => specific[r]).filter(Boolean)[0];
    return hint ? `${base} (${hint})` : base;
  }

  // ── Image preprocessing (req 6) ──────────────────────────────────────────────
  /**
   * Auto-crop to the detected face (+margin), normalize brightness (auto-levels),
   * sharpen, and resize to a standard square. Cropping to the face inherently
   * removes most of the noisy background. Returns a canvas ready for descriptor
   * extraction, or a centered crop fallback when no detection is given.
   */
  function preprocessFace(input, box) {
    const srcW = input.videoWidth || input.naturalWidth || input.width;
    const srcH = input.videoHeight || input.naturalHeight || input.height;

    let sx, sy, sw, sh;
    if (box) {
      const margin = 0.35;
      sw = box.width * (1 + margin * 2);
      sh = box.height * (1 + margin * 2);
      const side = Math.max(sw, sh);
      sx = box.x + box.width / 2 - side / 2;
      sy = box.y + box.height / 2 - side / 2;
      sw = sh = side;
    } else {
      const side = Math.min(srcW, srcH);
      sx = (srcW - side) / 2; sy = (srcH - side) / 2; sw = sh = side;
    }
    // clamp source rect to image bounds
    sx = clamp(sx, 0, Math.max(0, srcW - 1));
    sy = clamp(sy, 0, Math.max(0, srcH - 1));
    sw = Math.min(sw, srcW - sx);
    sh = Math.min(sh, srcH - sy);

    const c = document.createElement('canvas');
    c.width = STANDARD_SIZE; c.height = STANDARD_SIZE;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(input, sx, sy, sw, sh, 0, 0, STANDARD_SIZE, STANDARD_SIZE);

    autoLevels(ctx, STANDARD_SIZE, STANDARD_SIZE);
    sharpen(ctx, STANDARD_SIZE, STANDARD_SIZE);
    return c;
  }

  /** Per-channel contrast stretch to normalize brightness/exposure. */
  function autoLevels(ctx, w, h) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let ch = 0; ch < 3; ch++) {
      let lo = 255, hi = 0;
      for (let i = ch; i < d.length; i += 4) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; }
      const range = hi - lo;
      if (range > 8) {
        const scale = 255 / range;
        for (let i = ch; i < d.length; i += 4) d[i] = clamp((d[i] - lo) * scale, 0, 255);
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /** Mild unsharp-mask style 3x3 sharpen convolution. */
  function sharpen(ctx, w, h) {
    const src = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const s = src.data, o = out.data;
    const k = [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0]; // sums to 1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let acc = 0, ki = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++, ki++) {
              const px = clamp(x + dx, 0, w - 1), py = clamp(y + dy, 0, h - 1);
              acc += s[(py * w + px) * 4 + c] * k[ki];
            }
          }
          o[(y * w + x) * 4 + c] = clamp(acc, 0, 255);
        }
        o[(y * w + x) * 4 + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  /**
   * Capture a high-quality still from a <video>, undoing the CSS mirror so the
   * stored/compared image is the TRUE (non-mirrored) orientation — this keeps
   * registration and scan in the same coordinate frame (req 11, 12).
   * @returns {{ canvas: HTMLCanvasElement, dataUrl: string }}
   */
  function captureStill(video, opts) {
    const o = opts || {};
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (o.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); } // optional mirrored preview
    ctx.drawImage(video, 0, 0, w, h);
    return { canvas: c, dataUrl: c.toDataURL('image/jpeg', o.quality ?? 0.92) };
  }

  /** Small thumbnail dataURL for debug logs / history (keeps storage small). */
  function thumbnail(input, size, quality) {
    size = size || 128;
    const sw = input.videoWidth || input.naturalWidth || input.width || size;
    const sh = input.videoHeight || input.naturalHeight || input.height || size;
    const ratio = sh / sw;
    const c = document.createElement('canvas');
    c.width = size; c.height = Math.round(size * ratio);
    c.getContext('2d').drawImage(input, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality ?? 0.7);
  }

  // ── Descriptor math ────────────────────────────────────────────────────────────
  function euclidean(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
    return Math.sqrt(sum);
  }

  /** Average several descriptors into a single robust template (req 5). */
  function averageDescriptors(list) {
    if (!list.length) return null;
    const len = list[0].length;
    const avg = new Array(len).fill(0);
    list.forEach(desc => { for (let i = 0; i < len; i++) avg[i] += desc[i]; });
    for (let i = 0; i < len; i++) avg[i] /= list.length;
    return avg;
  }

  function distanceToConfidence(distance) {
    // face-api descriptor distances ~0 (same) .. ~1+ (different).
    // Map to an intuitive confidence where stricter spec thresholds (0.55–0.65)
    // correspond to plausibly-same-person distances (~0.45–0.35).
    return clamp(1 - distance, 0, 1);
  }

  // ── Profiles (registration store) ───────────────────────────────────────────────
  function getAllProfiles() { return lsGetSafe(PROFILES_KEY, {}); }

  function getProfile(employeeId) {
    if (!employeeId) return null;
    return getAllProfiles()[employeeId] || null;
  }

  function hasProfile(employeeId) {
    const p = getProfile(employeeId);
    return !!(p && Array.isArray(p.samples) && p.samples.length >= MIN_SAMPLES && p.avgDescriptor);
  }

  /**
   * Register one angle sample for an employee. Recomputes the average template.
   * @returns {Promise<{ profile:Object, sampleCount:number }>}
   */
  async function registerSample(employeeId, angleKey, input) {
    if (!employeeId) throw new Error('ไม่พบรหัสพนักงาน (employeeId)');
    const det = await detectBest(input);
    if (!det) throw new Error('ไม่พบใบหน้า กรุณาลองใหม่');
    const quality = await assessQuality(input, det);
    if (!quality.ok) { const e = new Error(quality.message); e.quality = quality; throw e; }

    const profiles = getAllProfiles();
    const profile = profiles[employeeId] || { employeeId, samples: [], avgDescriptor: null, createdAt: new Date().toISOString() };

    const preview = preprocessFace(input, det.box);
    const sample = {
      angle: angleKey,
      descriptor: Array.from(det.descriptor),
      image: thumbnail(preview, 160, 0.8),
      detScore: det.score,
      createdAt: new Date().toISOString(),
    };
    // one sample per angle (re-capture overwrites)
    profile.samples = profile.samples.filter(s => s.angle !== angleKey);
    profile.samples.push(sample);
    profile.avgDescriptor = averageDescriptors(profile.samples.map(s => s.descriptor));
    profile.updatedAt = new Date().toISOString();

    profiles[employeeId] = profile;
    lsSetSafe(PROFILES_KEY, profiles);
    return { profile, sampleCount: profile.samples.length };
  }

  function removeProfile(employeeId) {
    const profiles = getAllProfiles();
    delete profiles[employeeId];
    lsSetSafe(PROFILES_KEY, profiles);
  }

  // ── Matching (req 1, 2, 3, 10, 13) ───────────────────────────────────────────────
  /**
   * Compare a live capture to the registered template of ONE specific employee.
   * Security: we validate the session user matches the employeeId being matched
   * and only ever read that employee's template — never compare across users.
   *
   * @param {string} employeeId
   * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} input
   * @param {{ sessionEmployeeId?: string, capturedImage?: string }} [opts]
   * @returns {Promise<MatchResult>}
   */
  async function matchFace(employeeId, input, opts) {
    const cfg = getFaceConfig();
    const o = opts || {};

    // ── Session validation: the person matching must be the logged-in user ──
    const sessionId = o.sessionEmployeeId || getCurrentEmployeeId();
    if (!sessionId) return finalizeMatch(employeeId, null, 'reject', 'no_session', 'ไม่พบเซสชันผู้ใช้ กรุณาเข้าสู่ระบบใหม่', cfg, o, input);
    if (sessionId !== employeeId) {
      return finalizeMatch(employeeId, null, 'reject', 'user_mismatch', 'บัญชีไม่ตรงกับเซสชันที่เข้าสู่ระบบ', cfg, o, input);
    }

    const profile = getProfile(employeeId);
    if (!hasProfile(employeeId)) {
      return finalizeMatch(employeeId, null, 'reject', 'not_registered', 'ยังไม่ได้ลงทะเบียนใบหน้า กรุณาลงทะเบียนที่หน้าตั้งค่า', cfg, o, input);
    }

    const det = await detectBest(input);
    if (!det) {
      return finalizeMatch(employeeId, null, 'reject', 'no_face', 'ไม่พบใบหน้าในกรอบ — ' + DEFAULTS_MSG, cfg, o, input);
    }

    // Compare against the average template AND the best individual sample, then
    // take the closer of the two (robust to angle/expression variation).
    const live = Array.from(det.descriptor);
    const distAvg = euclidean(live, profile.avgDescriptor);
    let distBest = Infinity;
    profile.samples.forEach(s => { const d = euclidean(live, s.descriptor); if (d < distBest) distBest = d; });
    const distance = Math.min(distAvg, distBest);
    const confidence = distanceToConfidence(distance);

    let decision, reason, message;
    if (confidence >= cfg.threshold) {
      decision = 'accept'; reason = 'match';
      message = `ยืนยันตัวตนสำเร็จ (ความมั่นใจ ${(confidence * 100).toFixed(0)}%)`;
    } else if (confidence >= cfg.confirmFloor) {
      // mid-confidence: ask instead of hard reject (req 10, prevents false reject)
      decision = 'confirm'; reason = 'mid_confidence';
      message = `ความมั่นใจปานกลาง (${(confidence * 100).toFixed(0)}%) — ยืนยันการลงเวลาหรือไม่?`;
    } else {
      decision = 'reject'; reason = 'low_similarity';
      message = `ใบหน้าไม่ตรงกับผู้ใช้ (ความมั่นใจ ${(confidence * 100).toFixed(0)}%)`;
    }

    return finalizeMatch(employeeId, det, decision, reason, message, cfg, o, input, { confidence, distance });
  }

  const DEFAULTS_MSG = 'กรุณาอยู่ในที่แสงเพียงพอ และมองกล้องตรง';

  function finalizeMatch(employeeId, det, decision, reason, message, cfg, opts, input, scores) {
    const result = {
      decision,
      confidence: scores ? scores.confidence : 0,
      distance: scores ? scores.distance : Infinity,
      threshold: cfg.threshold,
      confirmFloor: cfg.confirmFloor,
      reason,
      message,
      matchedEmployeeId: decision === 'reject' ? null : employeeId,
    };
    logScan(employeeId, result, opts, input, det);
    return result;
  }

  // ── Debug logging (req 8) ────────────────────────────────────────────────────────
  function logScan(employeeId, result, opts, input, det) {
    try {
      const logs = lsGetSafe(LOGS_KEY, []);
      let captured = opts && opts.capturedImage;
      if (!captured && input) { try { captured = thumbnail(input, 128, 0.6); } catch { captured = null; } }
      const profile = getProfile(employeeId);
      const registeredRef = profile && profile.samples && profile.samples.length
        ? { sampleCount: profile.samples.length, image: profile.samples[0].image || null, updatedAt: profile.updatedAt }
        : null;
      logs.unshift({
        ts: new Date().toISOString(),
        scannedEmployeeId: getCurrentEmployeeId(),
        matchedEmployeeId: result.matchedEmployeeId,
        decision: result.decision,
        reason: result.reason,
        confidence: round3(result.confidence),
        distance: round3(result.distance),
        threshold: result.threshold,
        confirmFloor: result.confirmFloor,
        detScore: det ? round3(det.score) : null,
        capturedImage: captured || null,
        registeredRef,
      });
      lsSetSafe(LOGS_KEY, logs.slice(0, MAX_LOGS));
    } catch (e) { /* logging must never break the flow */ }
  }

  function getScanLogs() { return lsGetSafe(LOGS_KEY, []); }
  function clearScanLogs() { lsSetSafe(LOGS_KEY, []); }

  // ── small utils ───────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v, fallback) { const n = parseFloat(v); return isFinite(n) ? n : fallback; }
  function round3(v) { return isFinite(v) ? Math.round(v * 1000) / 1000 : v; }

  // ── export ────────────────────────────────────────────────────────────────────
  window.FaceCore = {
    DEFAULTS,
    REGISTRATION_ANGLES,
    MIN_SAMPLES,
    loadModels,
    isReady,
    getFaceConfig,
    resolveEmployeeId,
    getCurrentEmployeeId,
    detectBest,
    assessQuality,
    preprocessFace,
    captureStill,
    thumbnail,
    getProfile,
    hasProfile,
    registerSample,
    removeProfile,
    matchFace,
    getScanLogs,
    clearScanLogs,
  };
})();
