# ทำไม `git push` จาก appHrKm ไม่ได้?

โฟลเดอร์นี้เคยเป็น git คนละชุดกับ repo จริงบน GitHub (`Kmspit/-HR`)  
บน GitHub เป็นแอป **Next.js** ที่ `hrflow-app` — ไฟล์ HTML ต้องอยู่ใต้ **`prototype/`**

## วิธี push ที่ถูก (จากโฟลเดอร์นี้)

```powershell
cd C:\Users\teerasak\Desktop\appHrKm
.\push-github.ps1
```

หรือใส่ข้อความ commit:

```powershell
.\push-github.ps1 -Message "อัปเดต announcements"
```

สคริปต์จะคัดลอก `*.html` + `style.css` ไป `hrflow-app\prototype\` แล้ว `git push` ให้

## รันบนเครื่อง (ลิงก์เดียว — พอร์ต 3000)

จากโฟลเดอร์ `appHrKm`:

```powershell
cd C:\Users\teerasak\Desktop\appHrKm
.\run.ps1
```

| ที่เปิด | URL |
|---------|-----|
| แอปจริง (Next.js) | http://localhost:3000 |
| ต้นแบบ HTML | http://localhost:3000/prototype/login.html |
| ลงเวลา (แอปจริง) | http://localhost:3000/attendance |

อย่าใช้ `npm run dev` ใน `appHrKm` — ไม่มี `package.json`

## แอป Next.js (commit โค้ด TS ไม่ใช่แค่ HTML)

```powershell
cd C:\Users\teerasak\Desktop\hrflow-app
git add .
git commit -m "คำอธิบาย"
git push origin main
```

## ดูไฟล์บน GitHub

https://github.com/Kmspit/-HR/tree/main/prototype
