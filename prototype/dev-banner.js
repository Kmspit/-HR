/** แบนเนอร์ต้นแบบ HTML — ลิงก์แอปจริงอยู่โดเมนเดียวกัน */
;(function () {
  if (document.getElementById('hr-dev-banner')) return
  var origin = window.location.origin || 'http://localhost:3000'
  var appUrl = origin + '/'
  var attendanceUrl = origin + '/attendance'
  var el = document.createElement('div')
  el.id = 'hr-dev-banner'
  el.setAttribute('role', 'alert')
  el.innerHTML =
    '<strong>หน้านี้เป็น HTML ตัวอย่าง (ไม่มี API จริง)</strong><br>' +
    'แอปใช้งานจริง: <a href="' + appUrl + '" style="color:#fff;text-decoration:underline;font-weight:700">' + appUrl + '</a>' +
    ' · ลงเวลา: <a href="' + attendanceUrl + '" style="color:#fff;text-decoration:underline">/attendance</a>'
  el.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 14px;font:13px/1.5 "Noto Sans Thai",sans-serif;' +
    'background:linear-gradient(90deg,#dc2626,#ea580c);color:#fff;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.4)'
  document.body.style.paddingTop = '56px'
  document.body.prepend(el)
})()
