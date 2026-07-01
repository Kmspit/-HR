// ── XSS PROTECTION ─────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── LEAFLET MAP + REAL-TIME GPS ──
let userCoords   = { lat: 13.7563, lng: 100.5018 };
let liveMap      = null;
let userMarker   = null;
let allMap       = null;
let allMarkersMap = {};
let watchId      = null;
let _gpsWriteTimer = null;

function getOfficeCoords() {
  const s = (typeof getCompanySettings === 'function') ? getCompanySettings() : {};
  return { lat: s.lat ?? 13.7563, lng: s.lng ?? 100.5018, radius: s.radius ?? 200 };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2-lat1)*Math.PI/180, dl = (lon2-lon1)*Math.PI/180;
  const a  = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Reverse geocode ด้วย Nominatim (OpenStreetMap, ฟรี) ──
async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=th`);
    const data = await res.json();
    const a    = data.address || {};
    return [a.road, a.suburb, a.city_district, a.city || a.town || a.village].filter(Boolean).join(', ') || data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch (e) {
    console.warn('[attendance] reverseGeocode failed:', e);
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

// ── สร้างแผนที่ Leaflet (individual) ──
function initLiveMap(lat, lng) {
  if (liveMap) { liveMap.remove(); liveMap = null; }

  liveMap = L.map('live-map', { zoomControl: true, attributionControl: false }).setView([lat, lng], 16);

  // OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(liveMap);

  // Office marker (red)
  const office = getOfficeCoords();
  const officeIcon = L.divIcon({
    html: `<div style="background:#ef4444;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
    className: '', iconAnchor: [9,9]
  });
  L.marker([office.lat, office.lng], { icon: officeIcon })
   .addTo(liveMap)
   .bindPopup(`<b>🏢 สำนักงาน</b><br>${office.lat.toFixed(5)}, ${office.lng.toFixed(5)}`);

  // Geofence circle
  L.circle([office.lat, office.lng], {
    radius: office.radius,
    color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 2, dashArray: '6,4'
  }).addTo(liveMap);

  // User marker (blue pulsing)
  const user = getCurrentUser ? getCurrentUser() : null;
  const userIcon = L.divIcon({
    html: `<div style="position:relative;">
      <div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 10px rgba(59,130,246,0.6);position:relative;z-index:2;"></div>
      <div style="position:absolute;top:-4px;left:-4px;width:28px;height:28px;border-radius:50%;background:rgba(59,130,246,0.3);animation:gpsBlink 1.5s infinite;"></div>
    </div>`,
    className: '', iconAnchor: [10,10]
  });

  userMarker = L.marker([lat, lng], { icon: userIcon })
    .addTo(liveMap)
    .bindPopup(`<b>📍 ${user?.name || 'คุณ'}</b><br>กำลังโหลดที่อยู่...`);

  return liveMap;
}

// ── อัปเดต marker เมื่อ GPS เปลี่ยน ──
async function onGPSUpdate(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const acc = Math.round(position.coords.accuracy);
  userCoords = { lat, lng };

  const office   = getOfficeCoords();
  const dist     = calculateDistance(lat, lng, office.lat, office.lng);
  const inRange  = dist <= office.radius;

  // Update map marker
  if (!liveMap) {
    initLiveMap(lat, lng);
  } else if (userMarker) {
    userMarker.setLatLng([lat, lng]);
    liveMap.panTo([lat, lng], { animate: true, duration: 1 });
  }

  // Status chip
  const statusColor = inRange ? 'var(--green)' : 'var(--red)';
  const statusLabel = inRange ? '✓ อยู่ในรัศมีสำนักงาน' : '⚠ อยู่นอกรัศมีสำนักงาน';
  document.getElementById('gps-status-chip').style.color = statusColor;
  document.getElementById('gps-status-chip').textContent = `${statusLabel} — ห่าง ${dist.toFixed(0)} ม. | ความแม่นยำ ±${acc} ม.`;

  // Tag
  const tag = document.getElementById('gps-tag');
  tag.textContent  = inRange ? '✓ ในสำนักงาน' : '⚠ นอกสำนักงาน';
  tag.className    = `tag ${inRange ? 'green' : 'red'}`;
  tag.style.fontSize = '11px';

  // Coords
  document.getElementById('gps-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // Reverse geocode (async)
  const addr = await reverseGeocode(lat, lng);
  document.getElementById('gps-address').textContent = addr;
  if (userMarker) {
    const user = getCurrentUser ? getCurrentUser() : null;
    userMarker.bindPopup(`<b>📍 ${user?.name || 'คุณ'}</b><br>${addr}<br><small>${lat.toFixed(5)}, ${lng.toFixed(5)}</small>`);
  }

  // Debounce: เขียน localStorage + อัปเดตแผน���ี่ HR ทุก 3 วิ (ไม่ใช่ทุก GPS tick)
  if (typeof getCurrentUser === 'function' && getCurrentUser()) {
    const user = getCurrentUser();
    if (_gpsWriteTimer) clearTimeout(_gpsWriteTimer);
    _gpsWriteTimer = setTimeout(function() {
      let locs = {};
      try {
        const raw = localStorage.getItem('hrflow_liveLocations');
        locs = raw ? JSON.parse(raw) : {};
      } catch (e) {
        console.error('[attendance] corrupted hrflow_liveLocations, clearing:', e);
        localStorage.removeItem('hrflow_liveLocations');
      }
      locs[user.email] = { lat, lng, name: user.name, role: user.role, dept: user.dept, addr, updatedAt: new Date().toISOString(), inRange };
      localStorage.setItem('hrflow_liveLocations', JSON.stringify(locs));
      refreshAllMap();
    }, 3000);
  }
}

function onGPSError(err) {
  document.getElementById('gps-status-chip').textContent = '❌ ไม่สามารถเข้าถึง GPS: ' + err.message;
  document.getElementById('gps-status-chip').style.color = 'var(--red)';
  document.getElementById('gps-blink').style.background = 'var(--red)';
  document.getElementById('gps-tag').textContent = 'GPS Error';
  // Fallback: show map at default office location
  if (!liveMap) initLiveMap(userCoords.lat, userCoords.lng);
}

function startRealTimeGPS() {
  if (!navigator.geolocation) { onGPSError({ message: 'Browser ไม่รองรับ Geolocation' }); return; }
  // ใช้ watchPosition เพื่อ real-time อัปเดตทุกครั้งที่ตำแหน่งเปลี่ยน
  watchId = navigator.geolocation.watchPosition(onGPSUpdate, onGPSError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000
  });
}

// ── แผนที่ HR รวมพนักงานทุกคน ──
function initAllMap() {
  const office = getOfficeCoords();
  if (allMap) return;
  allMap = L.map('all-map', { zoomControl: true, attributionControl: false }).setView([office.lat, office.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(allMap);

  // Office
  const officeIcon = L.divIcon({
    html: `<div style="background:#ef4444;width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:12px;">🏢</div>`,
    className: '', iconAnchor: [11,11]
  });
  L.marker([office.lat, office.lng], { icon: officeIcon }).addTo(allMap).bindPopup('<b>🏢 สำนักงาน</b>');
  L.circle([office.lat, office.lng], { radius: office.radius, color:'#3b82f6', fillColor:'#3b82f6', fillOpacity:0.08, weight:2, dashArray:'6,4' }).addTo(allMap);
}

function refreshAllMap() {
  const card = document.getElementById('all-emp-map-card');
  if (!card || card.style.display === 'none') return;

  let locs = {};
  try {
    const raw = localStorage.getItem('hrflow_liveLocations');
    locs = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('[attendance] corrupted hrflow_liveLocations, clearing:', e);
    localStorage.removeItem('hrflow_liveLocations');
  }
  if (!allMap) initAllMap();

  const listEl = document.getElementById('emp-location-list');
  listEl.innerHTML = '';

  Object.values(locs).forEach(loc => {
    const color = loc.inRange ? '#22c55e' : '#ef4444';
    const icon  = L.divIcon({
      html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
      className: '', iconAnchor: [8,8]
    });

    const since = loc.updatedAt ? new Date(loc.updatedAt).toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'}) : '—';

    if (allMarkersMap[loc.name]) {
      allMarkersMap[loc.name].setLatLng([loc.lat, loc.lng]);
    } else {
      allMarkersMap[loc.name] = L.marker([loc.lat, loc.lng], { icon })
        .addTo(allMap)
        .bindPopup(`<b>👤 ${escapeHtml(loc.name)}</b><br>${escapeHtml(loc.dept||'')}<br>${escapeHtml(loc.addr||'')}<br><small>อัปเดต: ${escapeHtml(since)}</small>`);
    }

    // Sidebar location card
    listEl.innerHTML += `
      <div style="border:1px solid var(--border);border-radius:var(--r);padding:10px;display:flex;align-items:center;gap:10px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></div>
        <div>
          <div style="font-size:13px;font-weight:600;">${escapeHtml(loc.name)}</div>
          <div style="font-size:11px;color:var(--text3);">${loc.inRange ? '✓ ในสำนักงาน' : '⚠ นอกสำนักงาน'}</div>
          <div style="font-size:10px;color:var(--text3);">อัปเดต ${escapeHtml(since)}</div>
        </div>
      </div>`;
  });

  if (!Object.keys(locs).length) {
    listEl.innerHTML = `<div style="color:var(--text3);font-size:13px;">ยังไม่มีพนักงานออนไลน์</div>`;
  }
}

