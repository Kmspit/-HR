# Contributing

## เพิ่ม column ใหม่ในตาราง (Prisma + Turso)

โปรเจกต์นี้ไม่ได้ใช้ `prisma migrate` — ไม่มีโฟลเดอร์ `prisma/migrations` ระบบ migration
เป็นแบบ hand-rolled additive script ใน [`lib/ensure-db-schema.ts`](lib/ensure-db-schema.ts)
ที่รัน `ALTER TABLE ... ADD COLUMN` ผ่าน `addColumnIfMissing()` ทุกครั้งที่ deploy
(ผ่าน `postbuild` script) และซ้ำอีกทีทุกวันผ่าน cron `/api/cron/schema-migrate`

เพิ่ม column ใหม่ต้องทำครบ 4 ข้อนี้เสมอ — ขาดข้อไหนข้อหนึ่ง production จะพังช่วงหนึ่ง
(schema กับ DB ไม่ตรงกัน → full-select ชนกับ column ที่ยังไม่ถูกสร้างจริง):

1. **เพิ่มใน `lib/ensure-db-schema.ts`** — เพิ่ม `addColumnIfMissing('table_name', 'column_name', 'ALTER TABLE ... ADD COLUMN ...')`
   ในฟังก์ชัน `runEnsure()` แล้ว **bump `CURRENT_SCHEMA_VERSION`** (คอมเมนต์บนตัวแปรอธิบายไว้แล้ว)
2. **เพิ่มใน `prisma/schema.prisma`** — เพิ่ม field ให้ตรงกับ column ที่เพิ่มใน DB (ชื่อ/type/`@map`)
3. **Deploy จะ sync ให้อัตโนมัติ** ผ่าน `postbuild` script (`scripts/postbuild-ensure-schema.ts`)
   ที่เรียก `ensureDbSchema({ force: true })` หลัง `next build` เสร็จ ก่อน Vercel ปล่อย traffic จริง
   — ถ้า script นี้ fail (เช่น DB unreachable ตอน build) จะไม่ทำให้ deploy fail แต่จะ fallback ไปรอ
   cron รอบถัดไป (04:00 UTC) แทน ถ้าอยากมั่นใจว่า column พร้อมใช้ทันที ให้ trigger เองด้วย:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/schema-migrate`
4. **เขียน query ที่แตะ model นั้นด้วย `select` ชัดเจนเสมอ** — ห้ามปล่อยให้ Prisma
   `findMany`/`findFirst`/`findUnique` ทำ full-select (ไม่มี `select`, มีแต่ `include` หรือไม่มีเลย)
   เพราะ full-select จะ `SELECT *` ทุก column รวม column ใหม่ที่เพิ่งเพิ่มใน schema.prisma
   แต่ยังไม่ถูกสร้างจริงใน DB (ช่วงก่อน postbuild/cron รันสำเร็จ) → SQL error ทันที
   ไล่ดูจาก field ที่โค้ดใช้จริงหลัง query แล้ว select เฉพาะนั้น (รวม `include` ซ้อน เช่น
   `user`, `stepLogs` ก็ต้องใส่ `select` ย่อยด้วย)

ดู incident ตัวอย่าง: commit `ff43198` เพิ่ม `productCategory`/`productType` ใน `OutsideWorkRequest`
โดยไม่ได้ทำข้อ 3-4 ให้ครบ → `lib/approval-inbox.ts` full-select ชนกับ column ที่ยังไม่ migrate
ทำให้หน้า `/dashboard` ของ role ผู้อนุมัติพังหลัง deploy จนกว่า cron รอบถัดไปจะรัน
