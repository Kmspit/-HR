import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import { ROLE_LABELS } from '@/lib/access-control'
import { formatThaiDate } from '@/lib/utils'
import { findTodayAttendanceForDisplay } from '@/lib/attendance-session'
import { getAttendanceProgress, ACTION_LABELS } from '@/lib/attendance-progress'
import { startOfTodayBangkok } from '@/lib/datetime-bangkok'
import type { Role } from '@prisma/client'
import MotionCard, { MotionQuickLink } from '@/components/motion/MotionCard'

type Props = {
  userId: string
  name: string
  role: Role
}

export default async function EmployeeDashboard({ userId, name, role }: Props) {
  const today = startOfTodayBangkok()

  const [displaySession, leaveBalance, unreadCount, pendingLeave, pendingOutside] = await Promise.all([
    findTodayAttendanceForDisplay(userId, today),
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId, year: new Date().getFullYear() } },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.leaveRequest.count({ where: { userId, status: 'PENDING' } }),
    prisma.outsideWorkRequest.count({
      where: { userId, status: 'PENDING' },
    }),
  ])

  const progress = getAttendanceProgress(displaySession)
  const attSub = progress.dayComplete
    ? 'ลงเวลาครบแล้ว'
    : progress.nextAction
      ? ACTION_LABELS[progress.nextAction]
      : 'เช็คอินได้'

  const quickActions = [
    { href: '/attendance', label: 'ลงเวลางาน', sub: attSub, iconClass: 'bg-blue-600 border-blue-700', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { href: '/leave', label: 'ขอลาหยุด', sub: pendingLeave > 0 ? `รออนุมัติ ${pendingLeave}` : 'ยื่นคำขอลา', iconClass: 'bg-violet-600 border-violet-700', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { href: '/outside-work', label: 'ออกนอกสถานที่', sub: pendingOutside > 0 ? `รออนุมัติ ${pendingOutside}` : 'ขออนุมัติ', iconClass: 'bg-orange-600 border-orange-700', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' },
    { href: '/calendar', label: 'ปฏิทิน', sub: 'ดูตารางงาน', iconClass: 'bg-cyan-600 border-cyan-700', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { href: '/payslip', label: 'สลิปเงินเดือน', sub: 'ดูสลิป', iconClass: 'bg-emerald-600 border-emerald-700', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { href: '/announcements', label: 'ประกาศ', sub: 'ข่าวบริษัท', iconClass: 'bg-indigo-600 border-indigo-700', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
    { href: '/notifications', label: 'แจ้งเตือน', sub: unreadCount > 0 ? `${unreadCount} ยังไม่อ่าน` : 'ไม่มีใหม่', iconClass: 'bg-slate-600 border-slate-700', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    ...(role === 'LAWYER'
      ? [{ href: '/weekly-plan', label: 'แผนงานสัปดาห์', sub: 'ส่งแผนให้ HR', iconClass: 'bg-amber-600 border-amber-700', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' }]
      : []),
  ]

  return (
    <div className="flex flex-col">
      <Topbar
        title={`สวัสดี, ${name.split(' ')[0]} 👋`}
        subtitle={`${ROLE_LABELS[role]} · ${formatThaiDate(new Date())}`}
      />

      <div className="p-5 md:p-6 space-y-6">
        {/* Stat cards — Android compositor diagnostic: solid bg, no shadow, no alpha borders */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MotionCard className="shadow-none hover:shadow-md">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">สถานะวันนี้</p>
            <p className="mt-1.5 text-[15px] font-bold text-slate-900 dark:text-white">
              {progress.dayComplete ? 'ลงเวลาครบแล้ว' : displaySession?.checkIn ? 'กำลังทำงาน' : 'ยังไม่เช็คอิน'}
            </p>
            {displaySession?.checkIn && (
              <p className="text-[11px] text-slate-500 mt-1">
                เข้า{' '}
                {new Date(displaySession.checkIn).toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Bangkok',
                })}
              </p>
            )}
          </MotionCard>
          <MotionCard className="shadow-none hover:shadow-md" interactive={false}>
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">ลาป่วยคงเหลือ</p>
            <p className="mt-1.5 text-[15px] font-bold text-slate-900 dark:text-white">{leaveBalance?.sick ?? 30} วัน</p>
          </MotionCard>
          <MotionCard className="shadow-none hover:shadow-md" interactive={false}>
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">ลาพักร้อน</p>
            <p className="mt-1.5 text-[15px] font-bold text-slate-900 dark:text-white">{leaveBalance?.vacation ?? 6} วัน</p>
          </MotionCard>
          <MotionCard href="/notifications" className="shadow-none hover:shadow-md h-full">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">แจ้งเตือน</p>
            <p className="mt-1.5 text-[15px] font-bold text-slate-900 dark:text-white">{unreadCount} รายการ</p>
          </MotionCard>
        </div>

        <MotionCard className="p-5 md:p-6 shadow-none hover:shadow-md" interactive={false}>
          <h2 className="font-semibold text-slate-900 dark:text-white text-[16px] mb-4">เมนูด่วน</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {quickActions.map((a) => (
              <MotionQuickLink key={a.href} href={a.href}>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-none transition-none transform-none ${a.iconClass}`}>
                  <svg width={20} height={20} className="hr-icon-sm h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
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
