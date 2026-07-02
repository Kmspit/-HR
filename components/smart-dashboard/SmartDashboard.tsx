'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Users, UserCheck, Clock, UserX, ClipboardCheck,
  Bell, Sparkles, TrendingUp, TrendingDown, Minus, ChevronRight,
  BarChart3,
} from 'lucide-react'
import { MotionSummaryCard } from '@/components/motion/MotionCard'
import type { SmartDashboardPayload, SmartAlert, AIInsight } from '@/lib/smart-dashboard/types'
import { canAccessPage } from '@/lib/page-access'
import type { Role } from '@prisma/client'

const AttendanceTrendChart = dynamic(
  () => import('./SmartDashboardCharts').then((m) => m.AttendanceTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
const LeaveTrendChart = dynamic(
  () => import('./SmartDashboardCharts').then((m) => m.LeaveTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
const LateTrendChart = dynamic(
  () => import('./SmartDashboardCharts').then((m) => m.LateTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)

function ChartSkeleton() {
  return <div className="h-[220px] rounded-xl bg-slate-100 dark:bg-white/[0.03] animate-pulse" />
}

const OVERVIEW_CARDS = [
  {
    key: 'total',
    label: 'พนักงานทั้งหมด',
    href: '/employees',
    gradient: 'linear-gradient(135deg,#6366f1,#4f46e5)',
    glow: 'rgba(99,102,241,0.35)',
    icon: Users,
    getValue: (d: SmartDashboardPayload) => d.overview.totalEmployees,
    getSub: (d: SmartDashboardPayload) => 'Active',
  },
  {
    key: 'present',
    label: 'เข้างานวันนี้',
    href: '/attendance',
    gradient: 'linear-gradient(135deg,#22c55e,#16a34a)',
    glow: 'rgba(34,197,94,0.35)',
    icon: UserCheck,
    getValue: (d: SmartDashboardPayload) => d.overview.presentToday,
    getSub: (d: SmartDashboardPayload) => {
      const pct = d.overview.totalEmployees > 0
        ? Math.round((d.overview.presentToday / d.overview.totalEmployees) * 100)
        : 0
      return `${pct}% ของพนักงาน`
    },
  },
  {
    key: 'late',
    label: 'มาสายวันนี้',
    href: '/attendance',
    gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',
    glow: 'rgba(245,158,11,0.35)',
    icon: Clock,
    getValue: (d: SmartDashboardPayload) => d.overview.lateToday,
    getSub: () => 'คน · ดูรายชื่อ',
  },
  {
    key: 'absent',
    label: 'ขาดงานวันนี้',
    href: '/attendance',
    gradient: 'linear-gradient(135deg,#ef4444,#dc2626)',
    glow: 'rgba(239,68,68,0.35)',
    icon: UserX,
    getValue: (d: SmartDashboardPayload) => d.overview.absentToday,
    getSub: (d: SmartDashboardPayload) =>
      d.overview.onLeaveToday > 0 ? `รวมลา ${d.overview.onLeaveToday} คน` : 'ไม่รวมผู้ลา',
  },
  {
    key: 'pending',
    label: 'รออนุมัติ',
    href: '/approval-center',
    gradient: 'linear-gradient(135deg,#06b6d4,#0284c7)',
    glow: 'rgba(6,182,212,0.35)',
    icon: ClipboardCheck,
    getValue: (d: SmartDashboardPayload) => d.overview.pendingApprovals,
    getSub: () => 'คำขอทั้งหมด',
  },
] as const

function severityStyle(severity: SmartAlert['severity']) {
  switch (severity) {
    case 'critical':
      return 'border-red-200 dark:border-red-500/30 bg-red-50/80 dark:bg-red-500/[0.08]'
    case 'warning':
      return 'border-amber-200 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/[0.08]'
    default:
      return 'border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.03]'
  }
}

function severityDot(severity: SmartAlert['severity']) {
  switch (severity) {
    case 'critical': return 'bg-red-500'
    case 'warning': return 'bg-amber-500'
    default: return 'bg-green-500'
  }
}

function InsightIcon({ trend }: { trend?: AIInsight['trend'] }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-amber-500 flex-shrink-0" />
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-emerald-500 flex-shrink-0" />
  return <Minus className="h-4 w-4 text-slate-400 flex-shrink-0" />
}

function PanelShell({
  title, icon: Icon, children, badge,
}: {
  title: string
  icon: typeof Bell
  children: React.ReactNode
  badge?: number
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900/80 shadow-sm overflow-hidden h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06]">
            <Icon className="h-4.5 w-4.5 text-slate-600 dark:text-slate-300" size={18} />
          </div>
          <h2 className="font-semibold text-slate-900 dark:text-white text-[15px]">{title}</h2>
        </div>
        {badge != null && badge > 0 && (
          <span className="rounded-full bg-red-500 text-white text-[11px] font-bold px-2 py-0.5">{badge}</span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export default function SmartDashboard({ data, role }: { data: SmartDashboardPayload; role: Role }) {
  const alertCount = data.alerts.filter((a) => a.count > 0).length

  return (
    <div className="space-y-6">
      {/* Today Overview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            ภาพรวมวันนี้
          </h2>
          <span className="text-[12px] text-slate-400">Smart Dashboard</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {OVERVIEW_CARDS.map((card) => {
            const Icon = card.icon
            const href = card.href && canAccessPage(role, card.href) ? card.href : undefined
            return (
              <MotionSummaryCard key={card.key} href={href}>
                <div
                  className="pointer-events-none absolute -right-2 -top-2 h-14 w-14 rounded-full opacity-20 blur-2xl"
                  style={{ background: card.gradient }}
                />
                <div className="relative flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                      style={{ background: card.gradient, boxShadow: `0 4px 14px ${card.glow}` }}
                    >
                      <Icon size={18} />
                    </div>
                    {href && <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />}
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
                    <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {card.getValue(data)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 truncate">{card.getSub(data)}</p>
                  </div>
                </div>
              </MotionSummaryCard>
            )
          })}
        </div>
      </section>

      {/* Alerts + AI Insights */}
      <div className="grid gap-5 lg:grid-cols-2">
        <PanelShell title="การแจ้งเตือน" icon={Bell} badge={alertCount}>
          <ul className="space-y-2.5">
            {data.alerts.map((alert) => {
              const inner = (
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${severityStyle(alert.severity)} ${alert.href ? 'hover:brightness-[0.98] dark:hover:bg-white/[0.05]' : ''}`}>
                  <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${severityDot(alert.severity)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-slate-800 dark:text-slate-200 leading-snug">{alert.message}</p>
                  </div>
                  {alert.href && alert.count > 0 && (
                    <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              )
              return (
                <li key={alert.id}>
                  {alert.href && alert.count > 0 ? (
                    <Link href={alert.href} className="block">{inner}</Link>
                  ) : inner}
                </li>
              )
            })}
          </ul>
        </PanelShell>

        <PanelShell title="AI Insights" icon={Sparkles}>
          <div className="rounded-xl border border-violet-200/60 dark:border-violet-500/20 bg-gradient-to-br from-violet-50/90 to-indigo-50/50 dark:from-violet-500/[0.08] dark:to-indigo-500/[0.04] p-4 mb-3">
            <p className="text-[12px] text-violet-700 dark:text-violet-300 font-medium">
              วิเคราะห์จากข้อมูล HR 7–30 วันล่าสุด · อัปเดตแบบเรียลไทม์
            </p>
          </div>
          <ul className="space-y-3">
            {data.insights.map((insight) => (
              <li key={insight.id} className="flex gap-3 items-start">
                <InsightIcon trend={insight.trend} />
                <div>
                  <p className="text-[14px] text-slate-800 dark:text-slate-200 leading-snug">{insight.message}</p>
                  {insight.metric && (
                    <p className="text-[12px] text-slate-500 mt-0.5">{insight.metric}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </PanelShell>
      </div>

      {/* Analytics Charts */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-slate-500" />
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Analytics · 7 วันล่าสุด
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {([
            { title: 'แนวโน้มการเข้างาน', sub: 'เข้างาน & มาสาย', Chart: AttendanceTrendChart, data: data.attendanceTrend },
            { title: 'แนวโน้มการลา', sub: 'จำนวนคนลาต่อวัน', Chart: LeaveTrendChart, data: data.leaveTrend },
            { title: 'แนวโน้มมาสาย', sub: 'จำนวนครั้งมาสาย', Chart: LateTrendChart, data: data.lateTrend },
          ] as const).map(({ title, sub, Chart, data: chartData }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900/80 shadow-sm p-5"
            >
              <div className="mb-4">
                <h3 className="font-semibold text-slate-900 dark:text-white text-[15px]">{title}</h3>
                <p className="text-[12px] text-slate-500 mt-0.5">{sub}</p>
              </div>
              <Chart data={chartData} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
