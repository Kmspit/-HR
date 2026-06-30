# Deploy Profiles (Phase 4)

Single codebase — หลาย Vercel project ได้โดยตั้ง env ต่างกัน

## Environment variables

| Variable | Values | Default |
|----------|--------|---------|
| `NEXT_PUBLIC_DEPLOY_PROFILE` | `full` · `hr` · `legal` | `full` |
| `NEXT_PUBLIC_FROZEN_MODULES` | comma paths เช่น `/training,/automation` | (empty) |

> ใช้ `NEXT_PUBLIC_*` เพื่อให้ sidebar (client) และ middleware sync กัน

## Profiles

### `full` (production ปัจจุบัน)
ทุกโมดูลตาม role gates ปกติ

### `hr` — HR-only deploy
**ซ่อน:** คดี, ลูกหนี้, ลูกค้า, billing, invoice, recovery ฯลฯ  
**เห็น:** ลงเวลา, ลา, payroll, พนักงาน, อนุมัติ

### `legal` — Legal-only deploy
**ซ่อน:** payroll admin, จัดการพนักงาน, org/branches, LINE OA, automation  
**เห็น:** คดี, ลูกค้า, การเงินคดี + self-service (ลงเวลา, ลา, สลิป)

## Vercel setup (ตัวอย่าง)

**Project 1:** `hrflow-app` (full) — ไม่ต้องตั้ง env  
**Project 2:** `hrflow-hr` — `NEXT_PUBLIC_DEPLOY_PROFILE=hr`  
**Project 3:** `hrflow-legal` — `NEXT_PUBLIC_DEPLOY_PROFILE=legal`

Repo เดียวกัน → Deploy Hook / Git integration เดียวกัน → env ต่างกัน

## Phase 2 freeze (ไม่ต้อง deploy แยก)

เมื่อทีมตอบว่าโมดูลไหนไม่ใช้ — เพิ่มบน production เดิม:

```
NEXT_PUBLIC_FROZEN_MODULES=/training,/knowledge,/automation
```

Redeploy → เมนูหาย + URL redirect `/unauthorized` (code ยังอยู่)

## ไฟล์อ้างอิง

- `lib/deploy-profile.ts` — path sets + env reader
- `lib/module-gates.ts` — `isNavPathHidden()` รวม profile + frozen
- `middleware.ts` — block direct URL access
