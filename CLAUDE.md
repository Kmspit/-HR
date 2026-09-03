# กติกาสำหรับ live-DB verification script (hrflow-app)

โปรเจกต์นี้**ไม่มี dev DB แยก** — ทุก script ตรวจสอบที่รันระหว่างพัฒนา
ฟีเจอร์ (live-DB verification) จะชนกับ Turso DB จริงที่มีข้อมูลผู้ใช้งาน
จริงอยู่เสมอ

## เหตุการณ์ที่ทำให้ต้องเขียนกฎนี้ (2026-09-03)

ระหว่างตรวจขั้น 8c (employment assignment history) script ตรวจสอบใช้
`prisma.user.findFirst({ where: { employmentAssignments: { none: {} } } })`
เพื่อหา "user ว่าง ๆ" มาเป็น test candidate — เงื่อนไขนี้ไม่ได้เจาะจงพอ
และไปสุ่มเจอบัญชี `manager@demo.com` ที่ใช้งานจริงอยู่พอดี (บังเอิญยังไม่
เคยมี EmploymentAssignment) script รันจำลอง
HIRE→PROMOTION→TERMINATION ผ่านบัญชีนั้น แล้วตอน cleanup เดาค่า
"สภาพเดิม" ผิด (ตั้ง status เป็น PENDING + ล้าง position/department/
divisionId/departmentId/baseSalary เป็น null) ทำให้เจ้าของบัญชีเข้าระบบ
ไม่ได้จริง ต้องกู้คืนจาก backup ย้อนหลัง

## กฎบังคับ ตั้งแต่นี้ไป

1. **ห้ามใช้ `findFirst`/`findMany` แบบไม่ระบุเงื่อนไขจำเพาะ** เพื่อ "สุ่มหา"
   user มาทดสอบหรือแก้ไข (เช่น `where: { employmentAssignments: { none: {} } }`,
   `where: { role: 'EMPLOYEE' }` เฉย ๆ) — เงื่อนไขแบบนี้เสี่ยงชนบัญชีจริงที่
   บังเอิญตรง filter ได้เสมอ

2. **ต้องสร้าง user ใหม่สำหรับทดสอบเสมอ แล้วลบทิ้งหลังจบ** — สร้าง record
   ที่ id/email ชัดเจนว่าเป็นของ script (เช่น prefix `test-` หรือ email
   `+script-verify-<timestamp>@`) แล้ว `delete` ทิ้งตอน cleanup แทนการยืม
   user ที่มีอยู่แล้วมาใช้ชั่วคราว

3. **ถ้าจำเป็นต้องใช้ user ที่มีอยู่จริง** (เช่น ต้องพึ่งความสัมพันธ์ที่สร้าง
   จำลองยาก) **ต้องระบุ id หรือ email ที่รู้แน่ชัดว่าเป็นบัญชีทดสอบ** (ไม่ใช่
   query แบบเปิดกว้าง) **และต้องถามผู้ใช้ก่อนรัน** ห้ามตัดสินใจเอง

4. **ห้าม cleanup ด้วยการเดาค่าเดิม** ("สภาพเดิมน่าจะเป็นค่านี้") ทุกครั้งที่
   script จะแก้ไข record ที่มีอยู่แล้ว ต้อง **snapshot ค่าจริงก่อนแก้ไข**
   (`select` ฟิลด์ที่จะแก้ทั้งหมดเก็บไว้ในตัวแปรก่อน) แล้ว **restore จาก
   snapshot นั้นตอน cleanup** ไม่ใช่ hardcode ค่าที่คิดว่าน่าจะถูก
