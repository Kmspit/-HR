import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatThaiDate } from '@/lib/utils'
import { findTodayAttendanceForDisplay } from '@/lib/attendance-session'
import { getAttendanceProgress, ACTION_LABELS } from '@/lib/attendance-progress'
import { startOfTodayBangkok } from '@/lib/datetime-bangkok'
import type { Role } from '@prisma/client'

type Props = {
  userId: string
  name: string
  role: Role
}

export default async function EmployeeDashboard({ userId, name, role }: Props) {
  const today = startOfTodayBangkok()

  const [displaySession, leaveBalance, unreadCount, pendingLeave] = await Promise.all([
    findTodayAttendanceForDisplay(userId, today),
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId, year: new Date().getFullYear() } },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.leaveRequest.count({ where: { userId, status: 'PENDING' } }),
  ])

  const progress = getAttendanceProgress(displaySession)
  const attSub = progress.dayComplete
    ? 'ลงเวลาครบแล้ว'
    : progress.nextAction
      ? ACTION_LABELS[progress.nextAction]
      : 'เช็คอินได้'

  const quickActions = [
    { href: '/attendance', label: 'ลงเวลางาน', sub: attSub, gradient: 'from-cyan-500 to-blue-500', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { href: '/leave', label: 'ขอลาหยุด', sub: pendingLeave > 0 ? `รออนุมัติ ${pendingLeave}` : 'ยื่นคำขอลา', gradient: 'from-violet-500 to-purple-500', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { href: '/outside-work', label: 'ออกนอกสถานที่', sub: 'ขออนุมัติ', gradient: 'from-orange-500 to-amber-500', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' },
    { href: '/payslip', label: 'สลิปเงินเดือน', sub: 'ดูสลิป', gradient: 'from-emerald-500 to-teal-500', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { href: '/announcements', label: 'ประกาศ', sub: 'ข่าวบริษัท', gradient: 'from-blue-500 to-indigo-500', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
    { href: '/notifications', label: 'แจ้งเตือน', sub: unreadCount > 0 ? `${unreadCount} ยังไม่อ่าน` : 'ไม่มีใหม่', gradient: 'from-slate-500 to-slate-600', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    ...(role === 'LAWYER'
      ? [{ href: '/weekly-plan', label: 'แผนงานสัปดาห์', sub: 'ส่งแผนให้ HR', gradient: 'from-amber-500 to-orange-500', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' }]
      : []),
  ]

  return (
    <div className="flex flex-col">
      <Topbar
        title={`สวัสดี, ${name.split(' ')[0]} 👋`}
        subtitle={`${ROLE_LABELS[role]} · ${formatThaiDate(new Date())}`}
      />

      <div className="p-4 md:p-5 space-y-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="glass-card card-hover rounded-2xl p-3.5" style={{ animationDelay: '0ms' }}>
            <p className="text-[10px] text-slate-500">สถานะวันนี้</p>
            <p className="mt-1 text-lg font-bold text-white">
              {progress.dayComplete ? 'ลงเวลาครบแล้ว' : displaySession?.checkIn ? 'กำลังทำงาน' : 'ยังไม่เช็คอิน'}
            </p>
            {displaySession?.checkIn && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                เข้า{' '}
                {new Date(displaySession.checkIn).toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Bangkok',
                })}
              </p>
            )}
          </div>
          <div className="glass-card card-hover rounded-2xl p-3.5">
            <p className="text-[10px] text-slate-500">ลาป่วยคงเหลือ</p>
            <p className="mt-1 text-lg font-bold text-white">{leaveBalance?.sick ?? 30} วัน</p>
          </div>
          <div className="glass-card card-hover rounded-2xl p-3.5">
            <p className="text-[10px] text-slate-500">ลาพักร้อน</p>
            <p className="mt-1 text-lg font-bold text-white">{leaveBalance?.vacation ?? 6} วัน</p>
          </div>
          <div className="glass-card card-hover rounded-2xl p-3.5">
            <p className="text-[10px] text-slate-500">แจ้งเตือน</p>
            <p className="mt-1 text-lg font-bold text-white">{unreadCount} รายการ</p>
          </div>
        </div>

        <div className="glass-card card-hover rounded-2xl p-4 md:p-5">
          <h2 className="font-semibold text-white text-[15px] mb-4">เมนูด่วน</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group card-hover flex flex-col items-center gap-2 rounded-xl p-3 text-center border border-white/[0.05] bg-white/[0.02] hover:border-white/[0.1]"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${a.gradient}`}>
                  <svg width={16} height={16} className="hr-icon-sm h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">{a.label}</span>
                <span className="text-[9px] text-slate-500">{a.sub}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
