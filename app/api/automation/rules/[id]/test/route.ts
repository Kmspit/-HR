import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { evaluateConditions } from '@/lib/automation-engine'

const ADMIN_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const rule = await prisma.automationRule.findUnique({ where: { id } })
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const sampleData: Record<string, unknown> = body.sampleData ?? {}

  const conditions = JSON.parse(rule.conditions || '[]')
  const actions    = JSON.parse(rule.actions || '[]')

  const conditionResult = evaluateConditions(sampleData, conditions)

  return NextResponse.json({
    ruleId:           rule.id,
    ruleName:         rule.name,
    trigger:          rule.trigger,
    conditionsResult: conditionResult,
    conditionsCount:  conditions.length,
    actionsWouldRun:  conditionResult ? actions.map((a: { type: string }) => a.type) : [],
    testMode:         true,
    sampleData,
  })
}
