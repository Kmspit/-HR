# Approval Chain Flow

ระบบอนุมัติใช้ **chain-only** — ไม่มี legacy inbox `/approvals` แล้ว  
UI รวมที่ `/approval-center` · API หลักใน `lib/approval-chain.ts`

## Entity types

| Type | Chain entity | หน้า UI |
|------|--------------|---------|
| ลา | `LEAVE` | `/leave` |
| งานนอกสถานที่ | `OUTSIDE_WORK` | `/outside-work` |
| แผนงานรายสัปดาห์ | `WEEKLY_PLAN` | `/weekly-plan` |
| ลืมสแกน | `FORGOT_SCAN` | `/forgot-scan` |

Chain config เก็บใน `ApprovalChainConfig` + `ApprovalChainStep` (Prisma)

## Flow สร้างคำขอ

```
Employee ส่งคำขอ
    → getDefaultChain(prisma, entityType)
    → ถ้าไม่มี chain → 409 NO_CHAIN (ลบ draft ถ้ามี)
    → applyChainTo*() สร้าง step rows + currentStepOrder
    → แจ้ง approver (in-app + LINE card)
```

**พิเศษ:** ลาบวช (`ORDINATION`) อนุมัติอัตโนมัติ — ไม่ผ่าน chain

**CEO / SUPER_ADMIN ขอลา:** auto-approve ทันทีใน `applyChainToLeave`

## Flow อนุมัติทีละขั้น

```
Approver กดอนุมัติ (web หรือ LINE postback)
    → canUserActOnStep() — role / assigned approver
    → canApproverActOnRequester() — org scope (MANAGER เห็นแค่ทีม)
    → mark step APPROVED
    → ถ้ามีขั้นถัดไป → advance currentStepOrder + notify
    → ถ้าขั้นสุดท้าย → status APPROVED + side effects (balance, attendance ฯลฯ)
```

Org supervisor step (outside work ขั้น 1): `resolveOrgSupervisorId()` → `teamLeaderId ?? managerId`

## Org scope

| Role | เห็นคำขอของ |
|------|-------------|
| SUPER_ADMIN, CEO, MANAGER_HR, HR, ADMIN | ทุกคน (company-wide approver) |
| MANAGER | direct reports (`managerId`) |
| TEAM_LEADER | direct reports (`teamLeaderId`) |
| EMPLOYEE | ของตัวเองเท่านั้น |

ใช้ `lib/org-scope.ts` · inbox filter ใน `lib/approval-inbox.ts` · UI ใน `lib/approval-center/load-data.ts`

## ไฟล์สำคัญ

| File | บทบาท |
|------|--------|
| `lib/approval-chain.ts` | apply chain, step approve, leave/outside |
| `lib/approval-chain-shared.ts` | step matching, org supervisor template |
| `lib/forgot-scan-chain.ts` | forgot scan chain |
| `lib/weekly-plan-chain.ts` | weekly plan chain |
| `lib/approval-inbox.ts` | pending items per approver |
| `app/api/leave/[id]/step-approve/route.ts` | HTTP step approve |
| `lib/line-webhook-handlers.ts` | LINE postback → chain approve |

## Legacy ที่ retire แล้ว

- หน้า `/approvals` → redirect `/approval-center`
- API `/api/approvals/*` inbox เก่า — ลบแล้ว
- Single-step approve ไม่มี chain — ไม่รองรับ (ต้องมี default chain)

## ตั้งค่า chain

HR/Admin: `/approval-center` → tab ตั้งค่าสายอนุมัติ  
API: `GET/POST /api/leave/approval-chains` (และ entity อื่นตาม module)
