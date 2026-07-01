import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import { ROLE_LABELS, canApproveOutsideWork } from '@/lib/permissions'
import { formatThaiDate } from '@/lib/utils'
import { findTodayAttendanceForDisplay } from '@/lib/attendance-session'
import { getAttendanceProgress, ACTION_LABELS } from '@/lib/attendance-progress'
import { startOfTodayBangkok } from '@/lib/datetime-bangkok'
import { getApprovalCenterInboxCounts, formatApprovalCenterSummary } from '@/lib/approval-inbox'
import type { Role } from '@prisma/client'
import MotionCard, { MotionQuickLink } from '@/components/motion/MotionCard'

type Props = {
  userId: string
  name: string
  role: Role
}

export default async function ApproverDashboard({ userId, name, role }: Props) {
  const today = startOfTodayBangkok()

  const [displaySession, unreadCount, inbox, teamSize] = await Promise.all([
    findTodayAttendanceForDisplay(userId, today),
    prisma.notification.count({ where: { userId, isRead: false } }),
    getApprovalCenterInboxCounts(prisma, userId, role),
    prisma.user.count({
      where: role === 'MANAGER'
        ? { managerId: userId, status: 'ACTIVE' }
        : { teamLeaderId: userId, status: 'ACTIVE' },
    }),
  ])

  const progress = getAttendanceProgress(displaySession)
  const attSub = progress.dayComplete
    ? 'ลงเวลาครบแล้ว'
    : progress.nextAction
      ? ACTION_LABELS[progress.nextAction]
      : 'เช็คอินได้'

  const showOutside = canApproveOutsideWork(role)

  return (
    <div className="flex flex-col">
      <Topbar
        title={`สวัสดี, ${name.split(' ')[0]} 👋`}
        subtitle={`${ROLE_LABELS[role]} · ${formatThaiDate(new Date())}`}
        actions={
          inbox.total > 0 ? (
            <Link
              href="/approval-center"
              className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 transition-all shadow-lg shadow-orange-600/20"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              รออนุมัติ {inbox.total} รายการ
            </Link>
          ) : undefined
        }
      />

      <div className="p-5 md:p-6 space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MotionCard href="/approval-center" className="border-orange-200 dark:border-orange-900/50 shadow-none hover:shadow-md hover:border-orange-300 dark:hover:border-orange-800">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">รออนุมัติ</p>
            <p className="mt-1.5 text-2xl font-extrabold text-orange-600 dark:text-orange-400">{inbox.total}</p>
            <p className="text-[11px] text-slate-500 mt-1">{formatApprovalCenterSummary(inbox, role)}</p>
          </MotionCard>
          <MotionCard interactive={false} className="shadow-none hover:shadow-md">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">ทีมโดยตรง</p>
            <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white">{teamSize}</p>
            <p className="text-[11px] text-slate-500 mt-1">คน</p>
          </MotionCard>
          <MotionCard interactive={false} className="shadow-none hover:shadow-md">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">สถานะวันนี้</p>
            <p className="mt-1.5 text-[15px] font-bold text-slate-900 dark:text-white">
              {progress.dayComplete ? 'ลงเวลาครบ' : displaySession?.checkIn ? 'กำลังทำงาน' : 'ยังไม่เช็คอิน'}
            </p>
          </MotionCard>
          <MotionCard href="/notifications" className="shadow-none hover:shadow-md">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">แจ้งเตือน</p>
            <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-white">{unreadCount}</p>
            <p className="text-[11px] text-slate-500 mt-1">ยังไม่อ่าน</p>
          </MotionCard>
        </div>

        <MotionCard interactive={false} className="p-5 md:p-6 shadow-none hover:shadow-md">
          <h2 className="font-semibold text-slate-900 dark:text-white text-[16px] mb-4">เมนูด่วน</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              { href: '/approval-center', label: 'ศูนย์อนุมัติ', sub: inbox.total > 0 ? `${inbox.total} รอดำเนินการ` : 'ไม่มีค้าง', iconClass: 'bg-orange-600 border-orange-700', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
              { href: '/attendance', label: 'ลงเวลางาน', sub: attSub, iconClass: 'bg-blue-600 border-blue-700', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
              { href: '/leave', label: 'ขอลาหยุด', sub: 'ยื่นคำขอลา', iconClass: 'bg-violet-600 border-violet-700', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
              ...(showOutside
                ? [{ href: '/outside-work', label: 'ออกนอกสถานที่', sub: 'ขออนุมัติ', iconClass: 'bg-amber-600 border-amber-700', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' }]
                : []),
              { href: '/calendar', label: 'ปฏิทิน', sub: 'ดูตารางงาน', iconClass: 'bg-cyan-600 border-cyan-700', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
              { href: '/employees', label: 'ทีมงาน', sub: `${teamSize} คน`, iconClass: 'bg-indigo-600 border-indigo-700', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
            ].map((a) => (
              <MotionQuickLink key={a.href} href={a.href}>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-none ${a.iconClass}`}>
                  <svg width={20} height={20} className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
                  </svg>
                </div>
                <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">{a.label}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{a.sub}</span>
              </MotionQuickLink>
            ))}
          </div>
        </MotionCard>
      </div>
    </div>
  )
}
