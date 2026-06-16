import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const ruleId  = searchParams.get('ruleId') ?? undefined
  const success = searchParams.get('success')
  const from    = searchParams.get('from')
  const to      = searchParams.get('to')

  const where = {
    ...(ruleId ? { ruleId } : {}),
    ...(success !== null && success !== undefined ? { success: success === 'true' } : {}),
    ...(from || to ? {
      triggeredAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to)   } : {}),
      },
    } : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.automationExecutionLog.findMany({
      where,
      include: {
        rule: { select: { id: true, name: true, trigger: true } },
      },
      orderBy: { triggeredAt: 'desc' },
      skip: (page - 1) * 30,
      take: 30,
    }),
    prisma.automationExecutionLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page, pages: Math.ceil(total / 30) })
}
