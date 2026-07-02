'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import {
  TrendingUp, TrendingDown, AlertCircle, Clock, CheckCircle,
  Building2, User2, Calendar, MapPin, Award, Target,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type Summary = {
  totalCases: number
  activeCases: number
  overdueTasks: number
  upcomingDeadlines: number
  upcomingCourt: number
}

type DeptStat = {
  dept: string; label: string; total: number; completed: number
  overdue: number; onTime: number; completionRate: number; onTimeRate: number; kpiScore: number
}

type EmpStat = {
  userId: string; name: string; department: string | null; role: string
  total: number; completed: number; overdue: number; onTime: number; kpiScore: number
}

type MonthEntry = { month: string; label: string; total: number; completed: number; overdue: number }

type CourtEvent = {
  id: string; title: string; caseNumber: string | null; clientName: string | null
  courtDate: string; assigneeName: string; status: string
}

type ApptEvent = {
  id: string; title: string; caseNumber: string | null; clientName: string | null
  appointmentDate: string; appointmentPlace: string | null; assigneeName: string; status: string
}

type Props = {
  summary: Summary
  byDepartment: DeptStat[]
  employeeRanking: EmpStat[]
  monthlyTrend: MonthEntry[]
  courtUpcoming: CourtEvent[]
  apptUpcoming: ApptEvent[]
  role: string
  userId: string
  canSeeAll: boolean
  canSeeTeam: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  })
}

function kpiColor(score: number): string {
  if (score >= 90) return 'text-green-600 dark:text-green-400'
  if (score >= 70) return 'text-green-600  dark:text-green-400'
  if (score >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function kpiBg(score: number): string {
  if (score >= 90) return 'bg-green-500'
  if (score >= 70) return 'bg-green-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

function kpiLabel(score: number): string {
  if (score >= 90) return 'ดีเยี่ยม'
  if (score >= 70) return 'ดี'
  if (score >= 50) return 'ปานกลาง'
  return 'ต้องปรับปรุง'
}

function kpiRingCls(score: number): string {
  if (score >= 90) return 'stroke-green-500'
  if (score >= 70) return 'stroke-green-500'
  if (score >= 50) return 'stroke-amber-500'
  return 'stroke-red-500'
}

const DEPT_COLOR: Record<string, string> = {
  DEBT:    '#f97316', // orange
  LAW:     '#22c55e', // blue
  ASSET:   '#a855f7', // purple
  ENFORCE: '#ef4444', // red
}

// ── KPI Ring ──────────────────────────────────────────────────────────────────

function KpiRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className={kpiRingCls(score)} strokeWidth={5}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  )
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon, color, sub }: {
  label: string; value: number; icon: React.ReactNode; color: string; sub?: string
}) {
  return (
    <div className={`rounded-2xl p-4 border shadow-sm bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/[0.07]`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${color}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value.toLocaleString()}</p>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 shadow-lg px-3 py-2.5 text-[12px]">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500 dark:text-slate-400">{p.name}:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PerformanceClient({
  summary, byDepartment, employeeRanking, monthlyTrend,
  courtUpcoming, apptUpcoming, userId, canSeeAll, canSeeTeam,
}: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const ownStats = employeeRanking.find((e) => e.userId === userId)

  const summaryCards = [
    { label: 'คดี/งานทั้งหมด',   value: summary.totalCases,        icon: <Target  className="w-4 h-4" />, color: 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300', sub: 'ทั้งหมดในระบบ' },
    { label: 'กำลังดำเนินการ',    value: summary.activeCases,       icon: <Clock   className="w-4 h-4" />, color: 'bg-green-50  dark:bg-green-500/10  text-green-600  dark:text-green-400',   sub: 'งานที่ยังค้างอยู่' },
    { label: 'งานเกินกำหนด',      value: summary.overdueTasks,      icon: <AlertCircle className="w-4 h-4" />, color: 'bg-red-50   dark:bg-red-500/10   text-red-600   dark:text-red-400',     sub: 'ต้องรีบดำเนินการ' },
    { label: 'ใกล้ครบกำหนด 7 วัน', value: summary.upcomingDeadlines, icon: <TrendingDown className="w-4 h-4" />, color: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400', sub: 'ภายใน 7 วันข้างหน้า' },
    { label: 'นัดศาล 30 วัน',     value: summary.upcomingCourt,     icon: <Calendar className="w-4 h-4" />, color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400', sub: 'ภายใน 30 วันข้างหน้า' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-slate-900 dark:text-white">KPI / ผลงาน</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
          {canSeeAll ? 'ภาพรวมทั้งบริษัท' : canSeeTeam ? 'ทีมของคุณ' : 'ผลงานของคุณ'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryCards.map((c) => (
          <SummaryCard key={c.label} {...c} />
        ))}
      </div>

      {/* Own KPI card (always visible) */}
      {ownStats && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" />คะแนน KPI ของฉัน
          </p>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <KpiRing score={ownStats.kpiScore} size={72} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-[16px] font-bold ${kpiColor(ownStats.kpiScore)}`}>{ownStats.kpiScore}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[15px] font-semibold ${kpiColor(ownStats.kpiScore)}`}>{kpiLabel(ownStats.kpiScore)}</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{ownStats.name}</p>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  { label: 'งานทั้งหมด', val: ownStats.total },
                  { label: 'เสร็จแล้ว',  val: ownStats.completed },
                  { label: 'เกินกำหนด', val: ownStats.overdue },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center rounded-xl bg-slate-50 dark:bg-white/[0.03] p-2">
                    <p className="text-[16px] font-bold text-slate-900 dark:text-white">{val}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* KPI bar breakdown */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'เสร็จตรงเวลา', value: ownStats.total > 0 ? Math.round(ownStats.onTime / Math.max(1, ownStats.completed) * 100) : 0, pts: 30, color: 'bg-green-500' },
              { label: 'อัตราเสร็จงาน', value: ownStats.total > 0 ? Math.round(ownStats.completed / ownStats.total * 100) : 0, pts: 30, color: 'bg-green-500' },
              { label: 'เกินกำหนด', value: ownStats.total > 0 ? Math.round(ownStats.overdue / ownStats.total * 100) : 0, pts: -20, color: 'bg-red-500' },
              { label: 'คะแนนฐาน', value: 100, pts: 20, color: 'bg-slate-400' },
            ].map(({ label, value, pts, color }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{pts > 0 ? `+${pts}` : pts} คะแนน</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{value}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Department performance */}
      {(canSeeAll || canSeeTeam) && byDepartment.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.05]">
            <h2 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-green-500" />ผลงานรายฝ่าย
            </h2>
          </div>

          {/* Department cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-5">
            {byDepartment.map((d) => (
              <div key={d.dept} className="rounded-xl border border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 leading-tight">{d.label}</span>
                  <div className="relative flex-shrink-0">
                    <KpiRing score={d.kpiScore} size={40} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-[10px] font-bold ${kpiColor(d.kpiScore)}`}>{d.kpiScore}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: 'งานทั้งหมด', val: d.total,          cls: 'text-slate-600 dark:text-slate-400' },
                    { label: 'เสร็จแล้ว',  val: `${d.completed} (${d.completionRate}%)`, cls: 'text-green-600 dark:text-green-400' },
                    { label: 'ตรงเวลา',    val: `${d.onTime} (${d.onTimeRate}%)`,        cls: 'text-green-600  dark:text-green-400' },
                    { label: 'เกินกำหนด', val: d.overdue,          cls: d.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400' },
                  ].map(({ label, val, cls }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-[10px] text-slate-400">{label}</span>
                      <span className={`text-[11px] font-semibold ${cls}`}>{val}</span>
                    </div>
                  ))}
                </div>
                {/* completion rate bar */}
                <div className="mt-2.5 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${d.completionRate}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Dept bar chart */}
          {mounted && byDepartment.length > 0 && (
            <div className="px-5 pb-5">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">กราฟเปรียบเทียบรายฝ่าย</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byDepartment} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="total"     name="ทั้งหมด"     fill="#64748b" radius={[4,4,0,0]} />
                  <Bar dataKey="completed" name="เสร็จแล้ว"   fill="#22c55e" radius={[4,4,0,0]} />
                  <Bar dataKey="overdue"   name="เกินกำหนด"   fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Monthly trend */}
      {(canSeeAll || canSeeTeam) && mounted && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5">
          <h2 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-green-500" />แนวโน้มรายเดือน (6 เดือนล่าสุด)
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="total"     name="งานทั้งหมด"  stroke="#64748b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="completed" name="เสร็จแล้ว"   stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="overdue"   name="เกินกำหนด"   stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Employee ranking */}
      {(canSeeAll || canSeeTeam) && employeeRanking.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.05]">
            <h2 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <User2 className="w-4 h-4 text-green-500" />อันดับผลงานพนักงาน
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.05]">
                  {['#', 'พนักงาน', 'ฝ่าย', 'งานทั้งหมด', 'เสร็จ', 'ตรงเวลา', 'เกินกำหนด', 'คะแนน KPI'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeeRanking.map((emp, i) => (
                  <tr key={emp.userId}
                    className={`border-b border-slate-100 dark:border-white/[0.04] ${emp.userId === userId ? 'bg-green-50/40 dark:bg-green-500/[0.04]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'} transition-colors`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-[12px] font-bold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-400'}`}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        {emp.name}
                        {emp.userId === userId && <span className="text-[10px] text-green-500 font-normal">(คุณ)</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-slate-500 dark:text-slate-400">
                      {emp.department ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-slate-700 dark:text-slate-300">{emp.total}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-green-600 dark:text-green-400">{emp.completed}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-green-600 dark:text-green-400">{emp.onTime}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-red-600 dark:text-red-400">{emp.overdue}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-[60px] h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div className={`h-full rounded-full ${kpiBg(emp.kpiScore)} transition-all`} style={{ width: `${emp.kpiScore}%` }} />
                        </div>
                        <span className={`text-[12px] font-bold w-8 text-right ${kpiColor(emp.kpiScore)}`}>{emp.kpiScore}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Court upcoming */}
      {courtUpcoming.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.05]">
            <h2 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <span className="text-base">⚖️</span>วันนัดศาลที่ใกล้มาถึง (30 วัน)
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {courtUpcoming.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-lg">⚖️</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    {ev.caseNumber && (
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.5 rounded">{ev.caseNumber}</span>
                    )}
                    <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate">{ev.title}</span>
                  </div>
                  {ev.clientName && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-0.5">
                      <User2 className="w-2.5 h-2.5" />{ev.clientName}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                    <User2 className="w-2.5 h-2.5" />ผู้รับผิดชอบ: {ev.assigneeName}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[12px] font-semibold text-purple-600 dark:text-purple-400">{fmtDate(ev.courtDate)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Appointment upcoming */}
      {apptUpcoming.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.05]">
            <h2 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" />วันนัดหมายที่ใกล้มาถึง (30 วัน)
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {apptUpcoming.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-lg">📅</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    {ev.caseNumber && (
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.5 rounded">{ev.caseNumber}</span>
                    )}
                    <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate">{ev.title}</span>
                  </div>
                  {ev.clientName && (
                    <p className="text-[11px] text-slate-400">ลูกค้า: {ev.clientName}</p>
                  )}
                  {ev.appointmentPlace && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                      <MapPin className="w-2.5 h-2.5" />{ev.appointmentPlace}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-0.5">ผู้รับผิดชอบ: {ev.assigneeName}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">{fmtDate(ev.appointmentDate)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {summary.totalCases === 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] p-16 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400">ยังไม่มีข้อมูลงาน</p>
          <p className="text-[12px] text-slate-400 dark:text-slate-600 mt-1">เริ่มสร้างงานในเมนู &quot;มอบหมายงาน&quot; เพื่อดูผลงาน</p>
        </div>
      )}
    </div>
  )
}
