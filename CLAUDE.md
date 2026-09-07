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

## กฎบังคับ — การลบข้อมูลเป็นชุด (batch deletion)

เพิ่มหลัง 2026-09-07: ระหว่างเตรียมล้างข้อมูลก่อน pilot launch ผู้ใช้อนุมัติ
แผนลบ 20 บัญชีทั้งชุดล่วงหน้า (พร้อมรายชื่อ ลำดับ และเงื่อนไข "หยุดทันทีถ้า
error หรือตัวเลขไม่ตรง dry-run") ระหว่างรันรอบที่ 2 ตัวแทนได้รันไปแล้ว 3
บัญชีติดต่อกันโดยไม่หยุดรายงานทีละบัญชีก่อน ทำให้ผู้ใช้ต้อง interrupt หลัง
บัญชีที่ 3 (พลาดไปคนละจุดกับที่ตั้งใจ) และไม่รู้จำนวนที่แท้จริงจนกว่าจะถาม —
ผู้ใช้อนุมัติทั้งชุดไว้ล่วงหน้าไม่ได้แปลว่าให้รันรัวต่อเนื่องได้

**กฎ**: ทุกครั้งที่ทำ operation ที่ลบ/แก้ไขข้อมูลจริงเป็นชุด (ลบ user หลายคน,
migrate หลายแถว ฯลฯ) แม้ผู้ใช้จะอนุมัติทั้งชุดล่วงหน้าแล้วก็ตาม **ต้องหยุด
รายงานผลทุกรายการก่อนไปรายการถัดไป** ไม่ใช่รันต่อเนื่องแล้วรายงานสรุปทีเดียว
ตอนจบ — เหตุผล: ถ้าเกิดปัญหากลางทาง ความเสียหายจะจำกัดอยู่แค่รายการที่ทำไป
แล้ว ไม่ใช่ทั้งชุด และผู้ใช้ยังมีจังหวะ interrupt ได้ทันเวลาจริง

## สถานะการล้างข้อมูลก่อน pilot (บันทึกล่าสุด: 2026-09-07, หยุดรอทดสอบ)

**อย่าถือว่าล้างข้อมูลเสร็จ — งานค้างอยู่ ห้ามรันรอบ 2 ต่อจนกว่าผู้ใช้จะสั่ง**

ลบไปแล้ว 8 คน (รอบที่ 1 ทั้งหมด + รอบที่ 2 บางส่วน):
- nachapon.mee@gmail.com, test1779770684490@test.com,
  nodefetch1779770698654@test.com, newuser1779771698941@test.com,
  api1779771196420@test.com (รอบที่ 1 — guard ไม่บล็อก)
- test@gmail.com, bank@gmail.com, pek1111@gmail.com (รอบที่ 2 — ใช้ --force-guard)

เหลือต้องลบอีก 12 คน (รอบที่ 2 ต่อ ตามลำดับเดิม ใช้ --force-guard ทุกคน):
chaloe@gmail.com (⚠️ คนละบัญชีกับ ceo@kmsp.com — ชื่อซ้ำ "เฉลิมชัย คำผุย"
ต้องระบุด้วย email เท่านั้น ห้ามใช้ชื่อ), isrwd.bml@gmail.com,
ornwaranamkham@gmail.com, admin@demo.com, to@gmail.com, somnuek@gmail.com,
ping@gmail.com, ksonammarin@gmail.com, lawyer@demo.com, toghbk@gmail.com,
employee@demo.com, porramatsoksombat@gmail.com

เก็บไว้ 2 บัญชี (ห้ามลบ): ceo@kmsp.com (id `cmq7gcrdu0000i4f8algtmmlz`),
manager@demo.com (id `cmpl7m7rj0000i4ik6snaglwz`)

ทรัพยากรที่ยังต้องใช้ต่อ:
- Backup: `backups/pre-wipe-20260906/` ในเครื่อง (3.92MB, 20 ไฟล์ — ครอบคลุม
  ทั้ง 20 คนตั้งแต่ต้น รวม 8 คนที่ลบไปแล้ว) + JSON backup บน Cloudinary
  (BackupRecord id `cmtl91p3b0000i4bsxq0wurwd`)
- Branch `test/prep-wipe-purge-script` (มี purge-user.mjs ที่แก้แล้ว:
  เพิ่ม login_attempts/security_events/calendar_events, เพิ่ม
  `--force-guard` flag, dry-run ใหม่รันโค้ดจริงใน transaction แล้ว
  rollback) — **ยังไม่ merge เข้า main** ตั้งใจ ห้าม merge จนกว่าจะลบครบ
- Dry-run ของทั้ง 12 คนที่เหลือเคยรันและ verify กับ export ไว้แล้วในรอบก่อน
  (18/20 ตรง 100%, อีก 2 คนต่างกัน ±1-2 แถวจาก Turso read-timing แต่ export
  ได้แถวเยอะกว่าเสมอ ไม่เคยน้อยกว่า — ปลอดภัยสำหรับ backup)
