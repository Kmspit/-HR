import { prisma } from '@/lib/prisma'
import type { LeaveBalance } from '@prisma/client'

/** ตรวจสอบว่าอยู่ในช่วงทดลองงานหรือไม่ */
export function isOnProbation(startDate: Date | null | undefined, probationMonths: number): boolean {
  if (!startDate || probationMonths <= 0) return false
  const msPerMonth = 30.44 * 24 * 60 * 60 * 1000
  const monthsWorked = (Date.now() - startDate.getTime()) / msPerMonth
  return monthsWorked < probationMonths
}

export type LeaveUsed = {
  SICK: number
  VACATION: number
  PERSONAL: number
  UNPAID: number
  ORDINATION: number
  FUNERAL: number
  WEDDING: number
  MATERNITY: number
}

export type LeaveBalanceStats = {
  balance: LeaveBalance
  used: LeaveUsed
  remaining: { sick: number; vacation: number; personal: number }
  isProbation: boolean
}

/** คำนวณวันลาที่ใช้ไปแยกตามประเภทในปีที่กำหนด */
export async function getLeaveUsedByYear(
  userId: string,
  year: number,
): Promise<LeaveUsed> {
  const yearStart = new Date(`${year}-01-01T00:00:00+07:00`)
  const yearEnd   = new Date(`${year}-12-31T23:59:59+07:00`)

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: 'APPROVED',
      startDate: { lte: yearEnd },
      endDate:   { gte: yearStart },
    },
    select: { type: true, days: true },
  })

  const used: LeaveUsed = {
    SICK: 0, VACATION: 0, PERSONAL: 0, UNPAID: 0,
    ORDINATION: 0, FUNERAL: 0, WEDDING: 0, MATERNITY: 0,
  }

  for (const l of leaves) {
    if (l.type in used) used[l.type as keyof LeaveUsed] += l.days
  }

  return used
}

/**
 * Get or create leave balance for user/year.
 * Auto-creates applying: LeavePolicy (by role) → CompanySettings defaults → hard-coded defaults.
 * Probation: vacation = 0 if user is within probation period.
 */
export async function ensureLeaveBalance(
  userId: string,
  year: number,
): Promise<LeaveBalance> {
  const existing = await prisma.leaveBalance.findUnique({
    where: { userId_year: { userId, year } },
  })
  if (existing) return existing

  // Load user + settings in parallel
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, startDate: true } }),
    prisma.companySettings.findUnique({ where: { id: 'singleton' } }),
  ])

  const probationMonths = settings?.probationMonths ?? 3
  const onProbation = isOnProbation(user?.startDate, probationMonths)

  // Find policy: role-specific first, then default, then null
  let policy = null
  if (user?.role) {
    policy = await prisma.leavePolicy.findFirst({ where: { role: user.role } })
  }
  if (!policy) {
    policy = await prisma.leavePolicy.findFirst({ where: { isDefault: true } })
  }

  const sickDays     = policy?.sickDays     ?? settings?.sickDaysYear     ?? 30
  const vacationDays = onProbation ? 0 : (policy?.vacationDays ?? settings?.vacationDaysYear ?? 6)
  const personalDays = policy?.personalDays ?? settings?.personalDaysYear ?? 3

  return prisma.leaveBalance.create({
    data: { userId, year, sick: sickDays, vacation: vacationDays, personal: personalDays, unpaid: 0 },
  })
}

/** Get full balance stats: total allotted + used + remaining */
export async function getLeaveBalanceStats(
  userId: string,
  year: number,
): Promise<LeaveBalanceStats> {
  const [balance, used, user, settings] = await Promise.all([
    ensureLeaveBalance(userId, year),
    getLeaveUsedByYear(userId, year),
    prisma.user.findUnique({ where: { id: userId }, select: { startDate: true } }),
    prisma.companySettings.findUnique({ where: { id: 'singleton' }, select: { probationMonths: true } }),
  ])

  const probationMonths = settings?.probationMonths ?? 3
  const isProbation = isOnProbation(user?.startDate, probationMonths)

  return {
    balance,
    used,
    remaining: {
      sick:     Math.max(0, balance.sick     - used.SICK),
      vacation: Math.max(0, balance.vacation - used.VACATION),
      personal: Math.max(0, balance.personal - used.PERSONAL),
    },
    isProbation,
  }
}
