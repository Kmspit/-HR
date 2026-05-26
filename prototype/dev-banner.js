/** แจ้งว่า prototype นี้ไม่มี API — แอปจริงอยู่ที่ localhost:3000 */
;(function () {
  if (document.getElementById('hr-dev-banner')) return
  var el = document.createElement('div')
  el.id = 'hr-dev-banner'
  el.setAttribute('role', 'alert')
  el.innerHTML =
    '<strong>หน้านี้เป็น HTML ตัวอย่าง — ปุ่ม/API ไม่ทำงาน</strong><br>' +
    'แอปจริง: <a href="http://localhost:3000" style="color:#fff;text-decoration:underline;font-weight:700">http://localhost:3000</a>' +
    ' · ล็อกอิน <code style="background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px">employee@demo.com</code> / <code style="background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px">demo1234</code>'
  el.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 14px;font:13px/1.5 \"Noto Sans Thai\",sans-serif;' +
    'background:linear-gradient(90deg,#dc2626,#ea580c);color:#fff;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.4)'
  document.body.style.paddingTop = '56px'
  document.body.prepend(el)
})()
