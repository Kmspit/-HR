import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-handler'

const ADMIN_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function GET() {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await prisma.caseTemplate.findMany({
    where: { isActive: true },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { caseType: 'asc' },
  })
  return NextResponse.json({ templates })
} catch (err) {
  return apiError(err)
 }
}

export async function POST(req: Request) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้าง Template' }, { status: 403 })
  }

  const body = await req.json()
  const { name, description, caseType, department, slaHours, checklistJson, taskJson, approvalFlow } = body

  if (!name?.trim()) return NextResponse.json({ error: 'กรุณาระบุชื่อ Template' }, { status: 400 })
  if (!caseType)     return NextResponse.json({ error: 'กรุณาระบุประเภทคดี' }, { status: 400 })

  const template = await prisma.caseTemplate.create({
    data: {
      name:         name.trim(),
      description:  description?.trim() ?? null,
      caseType,
      department:   department ?? null,
      slaHours:     slaHours ? Number(slaHours) : 720,
      checklistJson: checklistJson ? JSON.stringify(checklistJson) : '[]',
      taskJson:      taskJson      ? JSON.stringify(taskJson)      : '[]',
      approvalFlow:  approvalFlow  ?? null,
      createdById:   session.user.id,
    },
  })
  return NextResponse.json({ template }, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
