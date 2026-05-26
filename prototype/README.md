# HRFlow — Static HTML prototype

ต้นแบบ UI (HTML/CSS) สำหรับอ้างอิงการออกแบบ

- **แอปใช้งานจริง:** รัน Next.js ที่ root โปรเจกต์ (`npm run dev` → http://localhost:3000)
- **สแกนใบหน้า:** เหลือเฉพาะ **หน้าตรง** (ไม่มีหันซ้าย–ขวา) ใน `attendance.html` และ `index.html`

เปิดดูต้นแบบ: เปิด `attendance.html` หรือ `index.html` ในเบราว์เซอร์ (ต้องมี `style.css`, `hr-core.js`, `dev-banner.js` ในโฟลเดอร์เดียวกัน)

## Push จากโฟลเดอร์ `appHrKm` (บนเครื่อง)

```powershell
cd C:\Users\teerasak\Desktop\appHrKm
.\push-github.ps1
```

อย่า `git push` จาก `appHrKm` โดยตรง — ใช้สคริปต์นี้เท่านั้น
