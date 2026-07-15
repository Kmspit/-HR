import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { apiError } from '@/lib/api-handler'

const EDITOR_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']

const DEPT_CODES: Record<string, string> = {
  DEBT:    'DEBT',
  LAW:     'LAW',
  ASSET:   'ASSET',
  ENFORCE: 'ENF',
  HR:      'HR',
  IT:      'IT',
  GENERAL: 'GEN',
}

async function genSopCode(department: string): Promise<string> {
  const code = DEPT_CODES[department.toUpperCase()] ?? 'GEN'
  const year = new Date().getFullYear()
  const prefix = `SOP-${code}-${year}-`
  const count = await prisma.sopDocument.count({
    where: { sopCode: { startsWith: prefix } },
  })
  return `${prefix}${String(count + 1).padStart(4, '0')}`
}

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp         = req.nextUrl.searchParams
  const department = sp.get('department') ?? undefined
  const status     = sp.get('status')     ?? undefined
  const q          = sp.get('q')          ?? undefined
  const page       = Math.max(1, Number(sp.get('page') ?? '1'))
  const take       = 50

  const where: Record<string, unknown> = {}
  if (department) where.department = department
  if (status)     where.status     = status
  if (q) {
    where.OR = [
      { title:       { contains: q } },
      { description: { contains: q } },
      { sopCode:     { contains: q } },
    ]
  }

  const [total, items] = await Promise.all([
    prisma.sopDocument.count({ where }),
    prisma.sopDocument.findMany({
      where,
      include: {
        createdBy:  { select: { name: true } },
        approvedBy: { select: { name: true } },
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * take,
      take,
    }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / take) })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!EDITOR_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, department, description, steps, checklist, relatedDocs, note } = body
  if (!title || !department) {
    return NextResponse.json({ error: 'title and department are required' }, { status: 400 })
  }

  const sopCode = await genSopCode(department)

  const sop = await prisma.sopDocument.create({
    data: {
      sopCode,
      title,
      department,
      description: description ?? null,
      steps:       steps       ? JSON.stringify(steps)       : '[]',
      checklist:   checklist   ? JSON.stringify(checklist)   : '[]',
      relatedDocs: relatedDocs ? JSON.stringify(relatedDocs) : '[]',
      note:        note ?? null,
      createdById: session.user.id,
    },
  })

  // Snapshot v1
  await prisma.sopVersion.create({
    data: {
      sopId:       sop.id,
      version:     1,
      changeNote:  'สร้างใหม่',
      snapshot:    JSON.stringify(sop),
      changedById: session.user.id,
    },
  })

  return NextResponse.json(sop, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
