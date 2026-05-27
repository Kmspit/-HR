# HRFlow — Static HTML prototype

ต้นแบบ UI (HTML/CSS) สำหรับอ้างอิงการออกแบบ

- **แอปใช้งานจริง:** `npm run dev` → http://localhost:3000
- **ต้นแบบ HTML (ลิงก์เดียวกัน):** http://localhost:3000/prototype/login.html  
  (ไฟล์ในโฟลเดอร์นี้ถูก sync ไป `public/prototype/` อัตโนมัติ)
- **สแกนใบหน้า:** เหลือเฉพาะ **หน้าตรง** ใน `attendance.html` และ `index.html`

แก้ HTML ที่เครื่อง: โฟลเดอร์ `appHrKm` แล้วรัน `.\run.ps1` หรือ `.\push-github.ps1`

## Push จากโฟลเดอร์ `appHrKm` (บนเครื่อง)

```powershell
cd C:\Users\teerasak\Desktop\appHrKm
.\push-github.ps1
```

อย่า `git push` จาก `appHrKm` โดยตรง — ใช้สคริปต์นี้เท่านั้น
