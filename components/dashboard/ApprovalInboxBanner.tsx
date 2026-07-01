import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getApprovalCenterInboxCounts, formatApprovalCenterSummary } from '@/lib/approval-inbox'
import type { Role } from '@prisma/client'
import MotionCard from '@/components/motion/MotionCard'

type Props = {
  userId: string
  role: Role
}

/** Personal approval inbox strip for roles that use Smart Dashboard (e.g. MANAGER). */
export default async function ApprovalInboxBanner({ userId, role }: Props) {
  const inbox = await getApprovalCenterInboxCounts(prisma, userId, role)
  if (inbox.total === 0) return null

  return (
    <MotionCard href="/approval-center" className="border-orange-200 dark:border-orange-900/50 shadow-none hover:shadow-md hover:border-orange-300 dark:hover:border-orange-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">รออนุมัติของคุณ</p>
          <p className="mt-1 text-2xl font-extrabold text-orange-600 dark:text-orange-400">{inbox.total}</p>
          <p className="text-[11px] text-slate-500 mt-1">{formatApprovalCenterSummary(inbox, role)}</p>
        </div>
        <Link
          href="/approval-center"
          className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 transition-all"
        >
          เปิดศูนย์อนุมัติ →
        </Link>
      </div>
    </MotionCard>
  )
}
