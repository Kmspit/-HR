# Deploy Profiles (Phase 4)

Single codebase — หลาย Vercel project ได้โดยตั้ง env ต่างกัน

## Vercel projects

| Project | URL | Profile |
|---------|-----|---------|
| `hrflow-app` | https://hrflow-app-gamma.vercel.app | `full` (default) |
| `hrflow-hr` | https://hrflow-hr.vercel.app | `hr` |
| `hrflow-legal` | https://hrflow-legal.vercel.app | `legal` |

## Environment variables

### Profile switches

| Variable | Values | Default |
|----------|--------|---------|
| `NEXT_PUBLIC_DEPLOY_PROFILE` | `full` · `hr` · `legal` | `full` |
| `NEXT_PUBLIC_FROZEN_MODULES` | comma paths เช.g. `/training,/automation` | (empty) |

> ใช้ `NEXT_PUBLIC_*` เพื่อให้ sidebar (client) และ middleware sync กัน

### Synced runtime vars (14 keys + profile)

คัดลอกจาก production `hrflow-app` ไป `hrflow-hr` / `hrflow-legal` ผ่าน `/api/cron/sync-deploy-env` (ดู `lib/sync-vercel-deploy-env.ts`):

| # | Key | หมายเหตุ |
|---|-----|----------|
| 1 | `ANTHROPIC_API_KEY` | LINE webhook AI fallback |
| 2 | `NEXT_PUBLIC_LINE_OA_BASIC_ID` | |
| 3 | `NEXT_PUBLIC_APP_NAME` | |
| 4 | `NEXT_PUBLIC_APP_URL` | override เป็น URL ของแต่ละ project |
| 5 | `CRON_SECRET` | |
| 6 | `CLOUDINARY_URL` | |
| 7 | `DATABASE_URL` | |
| 8 | `NEXTAUTH_SECRET` | |
| 9 | `TURSO_AUTH_TOKEN` | |
| 10 | `TURSO_DATABASE_URL` | |
| 11 | `LINE_CHANNEL_SECRET` | |
| 12 | `LINE_CHANNEL_ACCESS_TOKEN` | |
| 13 | `NEXTAUTH_URL` | override เป็น URL ของแต่ละ project |
| 14 | `NEXT_PUBLIC_DEPLOY_PROFILE` | `hr` หรือ `legal` (เพิ่มโดย sync) |

**ตรวจสอบแล้ว:** `hrflow-hr` และ `hrflow-legal` มี **14 vars** ต่อ project (13 คัดลอก + `NEXT_PUBLIC_DEPLOY_PROFILE`)

`hrflow-app` (full) ไม่ต้องตั้ง `NEXT_PUBLIC_DEPLOY_PROFILE` — default เป็น `full`

## Paths hidden per profile

อ้างอิง `lib/deploy-profile.ts`

### `full` (production ปัจจุบัน)

ทุกโมดูลตาม role gates ปกติ — ไม่ซ่อน path จาก profile

### `hr` — HR-only deploy

**ซ่อน (nav + middleware + `/api/*`):**

- Legal: `/cases`, `/case-documents`, `/clients`, `/debtors`, `/debt-followup`, `/payment-appointments`, `/court-calendar`, `/appointments`, `/client-companies`, `/contracts`, `/client-history`, `/recovery`
- Finance: `/case-finance`, `/expense-claim`, `/billing`, `/invoices`, `/receipts`
- Work: `/tasks`, `/performance`, `/sop`, `/training`

**เห็น:** ลงเวลา, ลา, payroll, พนักงาน, อนุมัติ, ประกาศ, สลิป

### `legal` — Legal-only deploy

**ซ่อน:**

- HR admin: `/payroll`, `/employees`, `/probation`, `/branches`, `/organization`, `/line-oa`, `/automation`, `/reports`
- Extra: `/settings`, `/executive`, `/security`, `/documents`

**เห็น:** คดี, ลูกค้า, การเงินคดี + self-service (ลงเวลา, ลา, สลิป, ประกาศ)

## Phase 2 freeze (ไม่ต้อง deploy แยก)

เมื่อทีมตอบว่าโมดูลไหนไม่ใช้ — เพิ่มบน production เดิม:

```
NEXT_PUBLIC_FROZEN_MODULES=/training,/sop,/automation
```

Redeploy → เมนูหาย + URL redirect `/unauthorized` (code ยังอยู่)

## Deploy checklist (project ใหม่)

1. **สร้าง Vercel project** จาก repo เดียวกัน (`-HR`)
2. **Deploy `hrflow-app` (full)** ให้ route `/api/cron/sync-deploy-env` พร้อมใช้งาน
3. **รัน sync env:**
   ```powershell
   .\scripts\copy-vercel-env-to-deploys.ps1
   ```
   หรือ `POST /api/cron/sync-deploy-env` ด้วย `X-Vercel-Token`
4. **ตรวจ env count:** `hrflow-hr` / `hrflow-legal` = 14 vars (production)
5. **ตั้ง `NEXT_PUBLIC_DEPLOY_PROFILE`** ให้ถูก (`hr` / `legal`) — sync script ทำให้อัตโนมัติ
6. **Redeploy** ทั้งสอง project หลัง sync
7. **Smoke test:**
   ```bash
   SMOKE_HR_URL=https://hrflow-hr.vercel.app node scripts/smoke-production.mjs
   ```
8. **ยืนยัน middleware:** URL ที่ซ่อนตาม profile → redirect `/unauthorized`

## RBAC note

Permissions เป็น static matrix ใน `lib/access-control/index.ts` (`ROLE_PERMISSIONS`) — ไม่มีตาราง DB แยก

## ไฟล์อ้างอิง

- `lib/deploy-profile.ts` — path sets + env reader
- `lib/sync-vercel-deploy-env.ts` — Vercel API env copy
- `lib/module-gates.ts` — `isNavPathHidden()` รวม profile + frozen
- `middleware.ts` — block direct URL access
- `scripts/copy-vercel-env-to-deploys.ps1` — one-shot sync script
