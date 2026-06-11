import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const CAN_VIEW = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER']

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAN_VIEW.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const year  = Number(searchParams.get('year')  ?? new Date().getFullYear())
  const month = searchParams.get('month') ? Number(searchParams.get('month')) : null

  const startDate = month
    ? new Date(year, month - 1, 1)
    : new Date(year, 0, 1)
  const endDate = month
    ? new Date(year, month, 0, 23, 59, 59)
    : new Date(year, 11, 31, 23, 59, 59)

  const [incomes, expenses, claims] = await Promise.all([
    prisma.caseIncome.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { amount: true, incomeType: true, department: true, caseNumber: true, date: true },
    }),
    prisma.caseExpense.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { amount: true, expenseType: true, department: true, caseNumber: true, date: true },
    }),
    prisma.expenseClaim.findMany({
      where: {
        status: { in: ['CEO_APPROVED', 'PAID'] },
        date:   { gte: startDate, lte: endDate },
      },
      select: { amount: true, expenseType: true, caseNumber: true, date: true },
    }),
  ])

  const totalIncome  = incomes.reduce((s, i) => s + i.amount, 0)
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0)
  const totalClaims  = claims.reduce((s, c) => s + c.amount, 0)
  const totalCost    = totalExpense + totalClaims
  const netProfit    = totalIncome - totalCost

  // By department
  const depts = ['DEBT', 'LAW', 'ASSET', 'ENFORCE']
  const byDept = depts.map((d) => {
    const inc = incomes.filter((i) => i.department === d).reduce((s, i) => s + i.amount, 0)
    const exp = expenses.filter((e) => e.department === d).reduce((s, e) => s + e.amount, 0)
    return { department: d, income: inc, expense: exp, profit: inc - exp }
  })

  // By case number (top 10 by profit)
  const caseMap = new Map<string, { income: number; expense: number }>()
  for (const i of incomes) {
    const k = i.caseNumber ?? '(ไม่มีเลขคดี)'
    const c = caseMap.get(k) ?? { income: 0, expense: 0 }
    caseMap.set(k, { ...c, income: c.income + i.amount })
  }
  for (const e of expenses) {
    const k = e.caseNumber ?? '(ไม่มีเลขคดี)'
    const c = caseMap.get(k) ?? { income: 0, expense: 0 }
    caseMap.set(k, { ...c, expense: c.expense + e.amount })
  }
  const byCase = [...caseMap.entries()]
    .map(([caseNumber, v]) => ({ caseNumber, ...v, profit: v.income - v.expense }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)

  // Monthly trend (for full-year view)
  const monthly = Array.from({ length: 12 }, (_, m) => {
    const mn = m + 1
    const inc = incomes.filter((i) => new Date(i.date).getMonth() + 1 === mn).reduce((s, i) => s + i.amount, 0)
    const exp = expenses.filter((e) => new Date(e.date).getMonth() + 1 === mn).reduce((s, e) => s + e.amount, 0)
    return { month: mn, income: inc, expense: exp, profit: inc - exp }
  })

  // Income by type
  const incomeByType: Record<string, number> = {}
  for (const i of incomes) {
    incomeByType[i.incomeType] = (incomeByType[i.incomeType] ?? 0) + i.amount
  }

  // Expense by type
  const expenseByType: Record<string, number> = {}
  for (const e of expenses) {
    expenseByType[e.expenseType] = (expenseByType[e.expenseType] ?? 0) + e.amount
  }

  return NextResponse.json({
    totalIncome,
    totalExpense,
    totalClaims,
    totalCost,
    netProfit,
    byDept,
    byCase,
    monthly,
    incomeByType,
    expenseByType,
    claimCount: claims.length,
  })
}
