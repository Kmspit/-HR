# API Guard Usage

`lib/api-guard.ts` — helpers สำหรับ Next.js App Router API routes ให้ auth + RBAC สม่ำเสมอ

## Imports

```typescript
import {
  requireAuth,
  requirePermission,
  requireRoles,
  requireOrgScope,
  isGuardResponse,
} from '@/lib/api-guard'
import { NextResponse } from 'next/server'
```

## Pattern: guard แล้ว early return

ทุก helper คืน `AuthSession | NextResponse` — ใช้ `isGuardResponse()` เช็คก่อนทำงานต่อ:

```typescript
export async function GET() {
  const session = await requirePermission('manage_attendance')
  if (isGuardResponse(session)) return session

  // session.user.id, session.user.role พร้อมใช้
  return NextResponse.json({ ok: true })
}
```

## Helpers

| Function | ใช้เมื่อ |
|----------|----------|
| `requireAuth()` | ต้อง login เท่านั้น |
| `requirePermission(perm)` | ต้องมี permission ใน `ROLE_PERMISSIONS` |
| `requireRoles([...])` | ต้องเป็นหนึ่งใน role ที่ระบุ |
| `requireOrgScope(targetUserId)` | ต้องเข้าถึง profile ของ user เป้าหมายได้ (org/branch hierarchy) |

## ตัวอย่าง route ใหม่

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, isGuardResponse } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission('manage_employees')
    if (isGuardResponse(session)) return session

    const userId = new URL(req.url).searchParams.get('userId')
    if (userId && userId !== session.user.id) {
      const scoped = await requireOrgScope(userId)
      if (isGuardResponse(scoped)) return scoped
    }

    // ... business logic
    return NextResponse.json({ data: [] })
  } catch (err) {
    return apiError(err)
  }
}
```

## List endpoints + org scope

สำหรับ list ที่ filter ตามทีม (MANAGER / TEAM_LEADER) ใช้ร่วมกับ `lib/org-scope.ts`:

```typescript
import { resolveOrgListScope, userIdFilterFromScope, canViewUserRecord } from '@/lib/org-scope'

const scope = await resolveOrgListScope(prisma, session.user.id, session.user.role)
const rows = await prisma.leaveRequest.findMany({
  where: userIdFilterFromScope(scope),
})
```

## Permissions ที่ใช้บ่อย

ดู `AppPermission` ใน `lib/access-control/index.ts`:

- `manage_attendance` — ดู/จัดการลงเวลา
- `manage_payroll` — payroll admin
- `manage_employees` — จัดการพนักงาน
- `approve_leave` / `approve_outside_work` / `approve_weekly_plan` — อนุมัติคำขอ

## Tests

ดู `tests/lib/api-guard.test.ts` — mock `@/lib/auth` และ `@/lib/access-control`

## อย่า import จาก path เก่า

ใช้ `@/lib/access-control` เท่านั้น — `lib/rbac.ts` และ `lib/permissions.ts` ถูกลบแล้ว (รวมใน access-control)
