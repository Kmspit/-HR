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

## สถานะการล้างข้อมูลก่อน pilot (บันทึกล่าสุด: 2026-09-18, หยุดรอทดสอบ)

**อย่าถือว่าล้างข้อมูลเสร็จ — งานค้างอยู่ ห้ามรันรอบ 2 ต่อจนกว่าผู้ใช้จะสั่ง**

ลบไปแล้ว 9 คน (รอบที่ 1 ทั้งหมด + รอบที่ 2 บางส่วน):
- nachapon.mee@gmail.com, test1779770684490@test.com,
  nodefetch1779770698654@test.com, newuser1779771698941@test.com,
  api1779771196420@test.com (รอบที่ 1 — guard ไม่บล็อก)
- test@gmail.com, bank@gmail.com, pek1111@gmail.com (รอบที่ 2 — ใช้ --force-guard)
- chaloe@gmail.com (รอบที่ 2 ต่อ — ลบไปแล้วก่อนหน้านี้ ⚠️ เคยคนละบัญชีกับ
  ceo@kmsp.com ที่ชื่อซ้ำ "เฉลิมชัย คำผุย" ต้องระบุด้วย email เท่านั้น)

เหลือต้องลบอีก 10 คน (รอบที่ 2 ต่อ ตามลำดับเดิม ใช้ --force-guard ทุกคน):
isrwd.bml@gmail.com, ornwaranamkham@gmail.com, admin@demo.com,
to@gmail.com, somnuek@gmail.com, ping@gmail.com, ksonammarin@gmail.com,
lawyer@demo.com, toghbk@gmail.com, employee@demo.com

⚠️ **name-collision hazard (ยืนยัน 2026-09-22):** `somnuek@gmail.com`
(id `cmpwav0qv0003la04dnqc74fc`, role EMPLOYEE) มีชื่อ "นายสมนึก
วงศ์เสริมทรัพย์" ซ้ำกับ `vongsomnuek081@gmail.com` (id
`cmpl7m7rj0000i4ik6snaglwz`, role MANAGER_HR — ดู "เก็บไว้ 3 บัญชี" ด้านล่าง)
เป็นคนละบัญชีกันจริง — เหมือนกรณี chaloe@gmail.com/ceo@kmsp.com ด้านบน
ต้องระบุด้วย email เท่านั้นตอนลบ ห้ามใช้ชื่อเป็นตัวระบุเด็ดขาด

เก็บไว้ 3 บัญชี (ห้ามลบ): ceo@kmsp.com (id `cmq7gcrdu0000i4f8algtmmlz`),
**vongsomnuek081@gmail.com** (id `cmpl7m7rj0000i4ik6snaglwz`, นายสมนึก
วงศ์เสริมทรัพย์, role MANAGER_HR — ⚠️ แก้ไข 2026-09-22: บันทึกเดิมเรียกบัญชีนี้
ว่า `manager@demo.com` ล้าสมัยแล้ว อีเมลถูกเปลี่ยนเป็นอีเมลจริงของ HR คนนี้
ไปแล้วตั้งแต่ก่อน 2026-09-22 — id เดิมยังถูกต้อง ใช้ email ปัจจุบันนี้อ้างอิง
จากนี้ไป — ดู name-collision hazard ด้านบนด้วย, นี่คือบัญชี HR
ตัวเดียวที่กำลังจะถูก gate ให้เป็นคนเดียวที่กรอกฟอร์มรับพนักงานใหม่ได้
(งานที่วางแผนไว้ 2026-09-22 ยังไม่เขียนโค้ด))**,
**porramatsoksombat@gmail.com** (id `cmpuxe8qi0001k304hnfmq7tk`, นายปรมัตถ์
สุขสมบัติ — ⚠️ แก้ไข 2026-09-18: บันทึกก่อนหน้านี้ (2026-09-07) ใส่บัญชีนี้
ผิดพลาดไว้ในลิสต์รอลบ — ยืนยันแล้วว่าเป็น**พนักงาน IT จริง** ใช้ทดสอบส่งสลิป
LINE/ลงทะเบียนใบหน้ามาตลอด **ห้ามลบเด็ดขาด**)

ทรัพยากรที่ยังต้องใช้ต่อ:
- Backup: `backups/pre-wipe-20260906/` ในเครื่อง (3.92MB, 20 ไฟล์ — ครอบคลุม
  ทั้ง 20 คนตั้งแต่ต้น รวม 9 คนที่ลบไปแล้ว) + JSON backup บน Cloudinary
  (BackupRecord id `cmtl91p3b0000i4bsxq0wurwd`)
- `scripts/purge-user.mjs` (เพิ่ม login_attempts/security_events/
  calendar_events, `--force-guard` flag, dry-run รันโค้ดจริงใน transaction
  แล้ว rollback เสมอ) **merge เข้า main แล้ว** ตั้งแต่ก่อน 2026-09-18 (บันทึก
  เดิมที่บอกว่า "ยังไม่ merge" ล้าสมัยแล้ว) — ล่าสุด 2026-09-18 เพิ่มการจัดการ
  security_deposit_plans/professional_fee_payments/
  professional_fee_related_persons (3 ตารางจาก payroll fields batch 2) เข้า
  ไปด้วย อยู่ระหว่าง review บน branch `fix/purge-user-payroll-batch2-audit-gap`
- Dry-run ของ 10 คนที่เหลือ (ไม่รวม porramatsoksombat@gmail.com ที่แก้ไข
  ออกจากลิสต์แล้ว) เคยรันและ verify กับ export ไว้แล้วในรอบก่อน (18/20 ตรง
  100%, อีก 2 คนต่างกัน ±1-2 แถวจาก Turso read-timing แต่ export ได้แถวเยอะ
  กว่าเสมอ ไม่เคยน้อยกว่า — ปลอดภัยสำหรับ backup) — ควร re-verify ตัวเลขซ้ำ
  ก่อนลบจริง เพราะเวลาผ่านมาพอสมควรแล้วตั้งแต่ dry-run รอบนั้น
