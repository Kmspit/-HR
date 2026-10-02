import type { Prisma } from '@prisma/client'
import { payrollPeriodRange } from '@/lib/payroll-period'

/** Roles payroll is ever generated/listed for — EMPLOYEE/MANAGER_HR/LAWYER only. */
export const PAYROLL_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

/**
 * User-eligibility condition for a given payroll period: ACTIVE employees,
 * OR employees DISABLED sometime during the period itself (`updatedAt` falls
 * in [start, end]) — so an account disabled mid-period still shows up
 * instead of silently vanishing from every payroll view the moment it
 * leaves ACTIVE (there's no reliable last-working-day field to key off
 * instead — see payroll-period.ts / generate/route.ts's disabled-note
 * comment for why `updatedAt` is used as the best proxy).
 *
 * Bug found 2026-10-02: `POST /api/payroll/generate` already had this exact
 * OR condition and correctly generated a payroll row for a disabled-mid-
 * period employee. But both read paths that LIST employees for the payroll
 * table — app/(dashboard)/payroll/page.tsx and GET /api/payroll/report —
 * independently hardcoded `status: 'ACTIVE'` only, so that employee's row
 * existed in the DB but could never be rendered by either page. Factored out
 * here so the 3 call sites can never drift apart like that again.
 *
 * Takes `start`/`end` directly (rather than month/year) so a caller that has
 * already computed payrollPeriodRange(month, year) for its other queries
 * (generate/route.ts) doesn't have to invoke it a second time — see
 * `payrollEligibleUserWhere` below for the month/year convenience wrapper
 * used by callers that haven't computed the range yet.
 */
export function payrollEligibleUserWhereForRange(start: Date, end: Date): Prisma.UserWhereInput {
  return {
    role: { in: [...PAYROLL_ROLES] },
    OR: [
      { status: 'ACTIVE' },
      { status: 'DISABLED', updatedAt: { gte: start, lte: end } },
    ],
  }
}

/** Convenience wrapper over {@link payrollEligibleUserWhereForRange} for callers that haven't already computed payrollPeriodRange(month, year) themselves. */
export function payrollEligibleUserWhere(month: number, year: number): Prisma.UserWhereInput {
  const { start, end } = payrollPeriodRange(month, year)
  return payrollEligibleUserWhereForRange(start, end)
}
