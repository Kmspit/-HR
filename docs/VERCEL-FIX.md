# Vercel ไม่อัปเดต — แก้แบบนี้

โค้ดบน GitHub อัปเดตแล้ว: https://github.com/Kmspit/-HR/commits/main

## 1) เช็คว่า Vercel ผูก GitHub ถูก repo หรือยัง

1. เปิด https://vercel.com/dashboard  
2. เลือกโปรเจกต์ HRFlow  
3. **Settings → Git**  
   - Repository ต้องเป็น `Kmspit/-HR` (หรือชื่อ repo จริงของคุณ)  
   - Production Branch = `main`  
   - **Deploy Hooks** / Auto Deploy = เปิด  

ถ้าไม่มี repo → **Connect Git Repository** แล้วเลือก `Kmspit/-HR`

## 2) บังคับ Deploy ใหม่

**Deployments** → deployment ล่าสุด → **⋯** → **Redeploy** → เลือก **Use existing Build Cache: Off**

## 3) เช็คว่า deploy สำเร็จ

เปิดในเบราว์เซอร์ (แทน cache หน้าแอป):

`https://YOUR-APP.vercel.app/deploy-version.txt`

ต้องเห็นข้อความประมาณ:

```
commit=ebef0c8
feature=warnings-monthly-summary
```

ถ้ายังเป็น `e79ebfa` หรือเก่ากว่า = ยังไม่ deploy ใหม่

## 4) ถ้า Build Error

**Deployments** → คลิกที่แถวสีแดง **Error** → อ่าน **Build Logs**

ตัวแปรบังคับ (Settings → Environment Variables → Production):

| ชื่อ | หมายเหตุ |
|------|----------|
| `TURSO_DATABASE_URL` | จาก Turso |
| `TURSO_AUTH_TOKEN` | จาก Turso |
| `NEXTAUTH_SECRET` | สุ่มยาว ๆ |
| `NEXTAUTH_URL` | `https://โดเมน-vercel-ของคุณ.vercel.app` |

หลังแก้ env → **Redeploy**

## 5) Push โค้ดจากเครื่อง (ทำแล้วอัตโนมัติ)

```powershell
cd C:\Users\teerasak\Desktop\appHrKm
.\push-github.ps1 -Message "คำอธิบาย"
```

หรือใน `hrflow-app` แล้ว `git push origin main`

---

**หมายเหตุ:** โฟลเดอร์ `appHrKm` ไม่มี git — push ต้องผ่าน `hrflow-app` หรือ `push-github.ps1` เท่านั้น
