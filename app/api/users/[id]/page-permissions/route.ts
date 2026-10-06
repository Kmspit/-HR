import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireRoles, isGuardResponse } from '@/lib/api-guard'
import { createAuditLog } from '@/lib/notifications'
import { summarizePagePermissionOverrideChange } from '@/lib/subrecord-audit'
import { OVERRIDE_ELIGIBLE_PATHS, OVERRIDE_MANAGER_ROLES } from '@/lib/override-eligible-paths'
import { clearUserPagePermissionsCache } from '@/lib/user-page-permissions-cache'
import type { PageOverrideDirection } from '@prisma/client'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

type OverrideInput = { path: string; direction: PageOverrideDirection; reason?: string | null }

function parseOverridesBody(body: unknown): OverrideInput[] | null {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { overrides?: unknown }).overrides)) {
    return null
  }
  const overrides = (body as { overrides: unknown[] }).overrides
  const parsed: OverrideInput[] = []
  for (const row of overrides) {
    if (typeof row !== 'object' || row === null) return null
    const r = row as Record<string, unknown>
    if (typeof r.path !== 'string') return null
    if (r.direction !== 'GRANT' && r.direction !== 'RESTRICT') return null
    if (r.reason !== undefined && r.reason !== null && typeof r.reason !== 'string') return null
    parsed.push({ path: r.path, direction: r.direction, reason: typeof r.reason === 'string' ? r.reason.trim() || null : null })
  }
  return parsed
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRoles([...OVERRIDE_MANAGER_ROLES])
    if (isGuardResponse(session)) return session

    const { id } = await params
    const overrides = await prisma.pagePermissionOverride.findMany({
      where: { userId: id },
      select: { path: true, direction: true, reason: true, createdAt: true, updatedAt: true },
      orderBy: { path: 'asc' },
    })
    return NextResponse.json({ overrides })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRoles([...OVERRIDE_MANAGER_ROLES])
    if (isGuardResponse(session)) return session

    const { id } = await params

    // Never allow self-override, even for SUPER_ADMIN/CEO/MANAGER_HR — same
    // spirit as the role/status self-edit lockout already enforced on this
    // same employee-edit page (app/api/users/[id]/route.ts).
    if (id === session.user.id) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: id,
        targetType: 'User',
        action: 'UPDATE',
        after: { pagePermissionOverrideChangeBlocked: true, reason: 'self-override attempt' },
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
      return NextResponse.json({ error: 'ไม่สามารถตั้งค่าสิทธิ์ของตัวเองได้' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const parsed = parseOverridesBody(body)
    if (!parsed) {
      return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const invalidPath = parsed.find((o) => !(OVERRIDE_ELIGIBLE_PATHS as readonly string[]).includes(o.path))
    if (invalidPath) {
      return NextResponse.json({ error: `หน้า ${invalidPath.path} ไม่รองรับการตั้งค่าสิทธิ์เฉพาะบุคคล` }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({ where: { id }, select: { id: true } })
    if (!targetUser) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })

    const before = await prisma.pagePermissionOverride.findMany({
      where: { userId: id },
      select: { path: true, direction: true },
    })

    const afterPaths = new Set(parsed.map((o) => o.path))

    await prisma.$transaction(async (tx) => {
      await tx.pagePermissionOverride.deleteMany({
        where: { userId: id, path: { notIn: [...afterPaths] } },
      })
      for (const o of parsed) {
        await tx.pagePermissionOverride.upsert({
          where: { userId_path: { userId: id, path: o.path } },
          update: { direction: o.direction, reason: o.reason, createdById: session.user.id },
          create: {
            userId: id,
            path: o.path,
            direction: o.direction,
            reason: o.reason,
            createdById: session.user.id,
          },
        })
      }
    })

    clearUserPagePermissionsCache(id)

    const after = parsed.map((o) => ({ path: o.path, direction: o.direction }))
    const auditEvent = summarizePagePermissionOverrideChange(before, after)
    if (auditEvent) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: id,
        targetType: 'User',
        action: 'UPDATE',
        after: auditEvent,
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    const overrides = await prisma.pagePermissionOverride.findMany({
      where: { userId: id },
      select: { path: true, direction: true, reason: true },
      orderBy: { path: 'asc' },
    })
    return NextResponse.json({ overrides })
  } catch (err) {
    return apiError(err)
  }
}
