'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
interface KPI {
  activeCases: number; casesThisMonth: number; highRiskCases: number; criticalCases: number
  criticalDebtors: number; hearingsToday: number; hearingsThisWeek: number
  recoveryToday: number; recoveryThisMonth: number; totalDebt: number; totalCollected: number
  collectionRate: number; promiseKeptPct: number; overdueTasks: number
  missedHearingPct: number; lateToday: number; warningsThisMonth: number
  noContactDebtors: number; slaOverdue: number
}
interface RiskData {
  criticalCases: { id: string; caseNumber: string; caseTitle: string; riskLevel: string; priority: string; slaDeadline: string | null; assignedEmployee: { name: string } | null }[]
  missedHearings: { id: string; courtName: string; appointmentDate: string; priority: string; case: { caseNumber: string; caseTitle: string }; assignedLawyer: { name: string } | null }[]
  highDebtDebtors: { id: string; debtorNumber: string; firstName: string; lastName: string; remainingDebt: number; riskLevel: string; lastContactAt: string | null }[]
  brokenPromises: { id: string; promisedAmount: number; promisedDate: string; debtor: { firstName: string; lastName: string; debtorNumber: string } }[]
  noContactCount: number; slaOverdueCount: number
}
interface TeamData {
  summary: { presentToday: number; activeEmployees: number }
  deptStats: { dept: string; tasksTotal: number; tasksCompleted: number; completionRate: number; lateCount: number; attendancePct: number; recoveryAmount: number }[]
  leaderboard: {
    topPerformers:    LeaderEntry[]
    bottomPerformers: LeaderEntry[]
    topCollectors:    LeaderEntry[]
    frequentLate:     LeaderEntry[]
  }
}
interface LeaderEntry { userId: string; name: string; department: string | null; role: string; tasksTotal: number; tasksCompleted: number; completionRate: number; lateCount: number; attendancePct: number; recoveryAmount: number }
interface AnalyticsData {
  legal?: { caseByStatus: {status:string;count:number}[]; caseByType:{type:string;count:number}[]; courtByStatus:{status:string;count:number}[]; courtSuccessRate:number; lawyerWorkload:{lawyerId:string|null;lawyerName:string;upcoming:number}[]; upcomingCritical:{id:string;courtName:string;appointmentDate:string;priority:string;case:{caseNumber:string;caseTitle:string};assignedLawyer:{name:string}|null}[] }
  recovery?: { dailyTrend:{date:string;amount:number;count:number}[]; promiseStats:{status:string;count:number;amount:number}[]; topDebtors:{id:string;debtorNumber:string;firstName:string;lastName:string;paid:number;times:number}[]; collectorRank:{collectorId:string;name:string;amount:number;count:number}[]; expectedCashflow:{amount:number;count:number} }
  crm?: { contactStats:{result:string;count:number}[]; contactSuccessRate:number; debtorByRisk:{risk:string;count:number;debt:number}[]; noContactDebtors:{id:string;debtorNumber:string;firstName:string;lastName:string;remainingDebt:number;riskLevel:string;lastContactAt:string|null;assignedTo:{name:string}|null}[]; promiseTrend:{status:string;count:number;amount:number}[] }
  automation?: { totalRules:number; totalRuns:number; successRuns:number; failRuns:number; successRate:number; topRules:{id:string;name:string;trigger:string;runCount:number;successCount:number;failCount:number}[]; failedRules:{id:string;name:string;trigger:string;failCount:number;runCount:number}[]; manualWorkReduced:{tasksAutoCreated:number;notificationsAutoSent:number;minutesSaved:number} }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('th-TH') }
function fmtB(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) }
function riskColor(r: string) {
  if (r === 'CRITICAL') return 'text-red-600 bg-red-50 dark:bg-red-900/20'
  if (r === 'HIGH')     return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20'
  if (r === 'MEDIUM')   return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
  return 'text-green-600 bg-green-50 dark:bg-green-900/20'
}
function pctBar(pct: number, color = 'bg-blue-500') {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 mt-1">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}
function TrendArrow({ val, threshold = 0 }: { val: number; threshold?: number }) {
  if (val > threshold) return <span className="text-green-500 text-[11px]">↑</span>
  if (val < threshold) return <span className="text-red-500 text-[11px]">↓</span>
  return <span className="text-slate-400 text-[11px]">→</span>
}

type Tab = 'ภาพรวม' | 'ทีม' | 'กฎหมาย' | 'รีคัฟเวอรี่' | 'CRM' | 'Automation'
const TABS: Tab[] = ['ภาพรวม', 'ทีม', 'กฎหมาย', 'รีคัฟเวอรี่', 'CRM', 'Automation']

// ── Main Component ────────────────────────────────────────────────────────────
export default function ExecutiveClient({ role, department }: { role: string; department: string | null }) {
  const [tab,        setTab]        = useState<Tab>('ภาพรวม')
  const [overview,   setOverview]   = useState<{ kpi: KPI; risk: RiskData } | null>(null)
  const [team,       setTeam]       = useState<TeamData | null>(null)
  const [analytics,  setAnalytics]  = useState<AnalyticsData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const isCEO = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'ADMIN'].includes(role)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch('/api/executive/overview').then(r => r.json()),
      fetch('/api/executive/team').then(r => r.json()),
      fetch('/api/executive/analytics').then(r => r.json()),
    ]).then(([ov, tm, an]) => {
      if (cancelled) return
      setOverview(ov)
      setTeam(tm)
      setAnalytics(an)
      setLastUpdate(new Date())
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function refresh() {
    setLoading(true)
    Promise.all([
      fetch('/api/executive/overview').then(r => r.json()),
      fetch('/api/executive/team').then(r => r.json()),
      fetch('/api/executive/analytics').then(r => r.json()),
    ]).then(([ov, tm, an]) => {
      setOverview(ov); setTeam(tm); setAnalytics(an)
      setLastUpdate(new Date()); setLoading(false)
    }).catch(() => setLoading(false))
  }

  const kpi = overview?.kpi

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[16px] font-bold text-slate-900 dark:text-white">CEO Command Center</h1>
            <p className="text-[11px] text-slate-400">อัปเดต: {lastUpdate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50">
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {loading ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-none px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        {loading && !overview && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {/* ── TAB: ภาพรวม ── */}
        {tab === 'ภาพรวม' && kpi && (
          <div className="space-y-4">
            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="คดีทั้งหมด (Active)" value={fmt(kpi.activeCases)} sub={`เดือนนี้ +${kpi.casesThisMonth}`} color="blue" icon="📋" href="/cases" />
              <KpiCard label="คดีความเสี่ยงสูง" value={fmt(kpi.highRiskCases)} sub={`Critical: ${kpi.criticalCases}`} color={kpi.criticalCases > 0 ? 'red' : 'orange'} icon="⚠️" href="/cases" />
              <KpiCard label="ลูกหนี้วิกฤต" value={fmt(kpi.criticalDebtors)} sub="ต้องดำเนินการด่วน" color={kpi.criticalDebtors > 0 ? 'red' : 'slate'} icon="🚨" href="/debtors" />
              <KpiCard label="นัดศาลวันนี้" value={fmt(kpi.hearingsToday)} sub={`สัปดาห์นี้ ${kpi.hearingsThisWeek} นัด`} color="purple" icon="⚖️" href="/court-calendar" />

              <KpiCard label="รีคัฟเวอรี่วันนี้" value={`฿${fmtB(kpi.recoveryToday)}`} sub={`เดือนนี้ ฿${fmtB(kpi.recoveryThisMonth)}`} color="green" icon="💰" href="/recovery" />
              <KpiCard label="อัตราเก็บหนี้" value={`${kpi.collectionRate}%`} sub={`เก็บได้ ฿${fmtB(kpi.totalCollected)} / ${fmtB(kpi.totalDebt)}`} color={kpi.collectionRate >= 70 ? 'green' : kpi.collectionRate >= 40 ? 'yellow' : 'red'} icon="📈" href="/recovery" bar={kpi.collectionRate} />
              <KpiCard label="Promise Kept %" value={`${kpi.promiseKeptPct}%`} sub="(30 วันล่าสุด)" color={kpi.promiseKeptPct >= 60 ? 'green' : 'orange'} icon="🤝" href="/debtors" bar={kpi.promiseKeptPct} />
              <KpiCard label="งานเกินกำหนด" value={fmt(kpi.overdueTasks)} sub="ต้องติดตาม" color={kpi.overdueTasks > 10 ? 'red' : kpi.overdueTasks > 0 ? 'orange' : 'green'} icon="📌" href="/tasks" />

              <KpiCard label="พลาดนัดศาล %" value={`${kpi.missedHearingPct}%`} sub="(30 วันล่าสุด)" color={kpi.missedHearingPct > 10 ? 'red' : kpi.missedHearingPct > 0 ? 'orange' : 'green'} icon="❌" href="/court-calendar" />
              <KpiCard label="พนักงานมาสาย" value={fmt(kpi.lateToday)} sub="วันนี้" color={kpi.lateToday > 3 ? 'orange' : 'slate'} icon="⏰" href="/attendance-history" />
              <KpiCard label="ใบเตือนเดือนนี้" value={fmt(kpi.warningsThisMonth)} sub="" color={kpi.warningsThisMonth > 0 ? 'orange' : 'slate'} icon="📝" href="/warnings" />
              <KpiCard label="ลูกหนี้ไม่ติดต่อ" value={fmt(kpi.noContactDebtors)} sub=">7 วัน" color={kpi.noContactDebtors > 5 ? 'red' : 'orange'} icon="📵" href="/debtors" />

              {isCEO && (
                <>
                  <KpiCard label="SLA เกินกำหนด" value={fmt(kpi.slaOverdue)} sub="คดีเกินกำหนด SLA" color={kpi.slaOverdue > 0 ? 'red' : 'green'} icon="🕐" href="/cases" />
                  <KpiCard label="หนี้ทั้งหมด" value={`฿${fmtB(kpi.totalDebt)}`} sub="" color="slate" icon="🏦" href="/recovery" />
                </>
              )}
            </div>

            {/* Risk Panel */}
            {overview?.risk && <RiskPanel risk={overview.risk} />}
          </div>
        )}

        {/* ── TAB: ทีม ── */}
        {tab === 'ทีม' && team && (
          <div className="space-y-4">
            {/* Today summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{team.summary.presentToday}</p>
                <p className="text-[12px] text-slate-500 mt-0.5">เช็คอินวันนี้</p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] p-4 text-center">
                <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{team.summary.activeEmployees}</p>
                <p className="text-[12px] text-slate-500 mt-0.5">พนักงานทั้งหมด</p>
              </div>
            </div>

            {/* Department Stats */}
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] p-4">
              <h3 className="text-[13px] font-bold text-slate-800 dark:text-white mb-3">ประสิทธิภาพรายแผนก (เดือนนี้)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/[0.05]">
                      <th className="text-left py-2 text-slate-500 font-medium">แผนก</th>
                      <th className="text-right py-2 text-slate-500 font-medium">งาน</th>
                      <th className="text-right py-2 text-slate-500 font-medium">เสร็จ%</th>
                      <th className="text-right py-2 text-slate-500 font-medium">มาสาย</th>
                      <th className="text-right py-2 text-slate-500 font-medium">เข้างาน%</th>
                      <th className="text-right py-2 text-slate-500 font-medium">รีคัฟ (฿)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.deptStats.filter(d => d.tasksTotal > 0 || d.lateCount > 0 || d.recoveryAmount > 0).map(d => (
                      <tr key={d.dept} className="border-b border-slate-50 dark:border-white/[0.03]">
                        <td className="py-2 font-medium text-slate-800 dark:text-slate-200">{d.dept}</td>
                        <td className="py-2 text-right text-slate-600">{d.tasksCompleted}/{d.tasksTotal}</td>
                        <td className="py-2 text-right">
                          <span className={`font-semibold ${d.completionRate >= 80 ? 'text-green-600' : d.completionRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{d.completionRate}%</span>
                        </td>
                        <td className="py-2 text-right text-slate-600">{d.lateCount}</td>
                        <td className="py-2 text-right">
                          <span className={d.attendancePct >= 90 ? 'text-green-600' : 'text-orange-600'}>{d.attendancePct}%</span>
                        </td>
                        <td className="py-2 text-right text-green-600 font-medium">฿{fmtB(d.recoveryAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Leaderboards */}
            <div className="grid md:grid-cols-2 gap-4">
              <LeaderboardCard title="Top Performers" subtitle="งานเสร็จ%" entries={team.leaderboard.topPerformers} metric={e => `${e.completionRate}%`} color="green" />
              <LeaderboardCard title="Top Collectors" subtitle="รีคัฟเวอรี่เดือนนี้" entries={team.leaderboard.topCollectors} metric={e => `฿${fmtB(e.recoveryAmount)}`} color="blue" />
              <LeaderboardCard title="Bottom Performers" subtitle="งานเสร็จ%" entries={team.leaderboard.bottomPerformers} metric={e => `${e.completionRate}%`} color="red" />
              <LeaderboardCard title="Late Frequency" subtitle="ครั้งที่มาสาย" entries={team.leaderboard.frequentLate} metric={e => `${e.lateCount} ครั้ง`} color="orange" />
            </div>
          </div>
        )}

        {/* ── TAB: กฎหมาย ── */}
        {tab === 'กฎหมาย' && analytics?.legal && (
          <div className="space-y-4">
            {/* Court success rate */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <BigStat label="Court Success Rate" value={`${analytics.legal.courtSuccessRate}%`} color={analytics.legal.courtSuccessRate >= 70 ? 'green' : 'orange'} />
              <BigStat label="Court by Status (30d)" value={analytics.legal.courtByStatus.map(r => `${r.status}: ${r.count}`).join(' · ')} color="blue" small />
            </div>

            {/* Case by status */}
            <SectionCard title="สถานะคดีทั้งหมด">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {analytics.legal.caseByStatus.map(r => (
                  <div key={r.status} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                    <span className="text-[12px] text-slate-600 dark:text-slate-400">{r.status}</span>
                    <span className="text-[13px] font-bold text-slate-800 dark:text-white">{r.count}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Upcoming critical hearings */}
            <SectionCard title="นัดศาลสำคัญที่จะมาถึง">
              {analytics.legal.upcomingCritical.length === 0 ? (
                <p className="text-[13px] text-slate-400">ไม่มีนัดสำคัญที่ใกล้มาถึง</p>
              ) : (
                <div className="space-y-2">
                  {analytics.legal.upcomingCritical.map(e => (
                    <div key={e.id} className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-white/[0.05] p-3">
                      <div>
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-white">{e.courtName}</p>
                        <p className="text-[11px] text-slate-500">{e.case.caseNumber} · {e.case.caseTitle}</p>
                        {e.assignedLawyer && <p className="text-[11px] text-slate-400">ทนาย: {e.assignedLawyer.name}</p>}
                      </div>
                      <div className="text-right">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${e.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{e.priority}</span>
                        <p className="text-[11px] text-slate-500 mt-1">{fmtDate(e.appointmentDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Lawyer workload */}
            <SectionCard title="ภาระงานทนาย (นัดที่เหลือ)">
              <div className="space-y-2">
                {analytics.legal.lawyerWorkload.map((l, i) => (
                  <div key={l.lawyerId ?? i} className="flex items-center gap-3">
                    <span className="text-[12px] text-slate-600 dark:text-slate-400 w-40 truncate">{l.lawyerName}</span>
                    <div className="flex-1">{pctBar(Math.min(100, l.upcoming * 10), 'bg-purple-500')}</div>
                    <span className="text-[12px] font-bold text-slate-700 dark:text-slate-300 w-6 text-right">{l.upcoming}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── TAB: รีคัฟเวอรี่ ── */}
        {tab === 'รีคัฟเวอรี่' && analytics?.recovery && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <BigStat label="Expected Cashflow" value={`฿${fmtB(analytics.recovery.expectedCashflow.amount)}`} color="green" sub={`${analytics.recovery.expectedCashflow.count} สัญญา`} />
              <BigStat label="Promise Stats (90d)" value={analytics.recovery.promiseStats.map(p => `${p.status}: ${p.count}`).slice(0,3).join(' / ')} color="blue" small />
            </div>

            {/* Daily trend */}
            <SectionCard title="การเก็บเงิน 30 วันล่าสุด">
              <div className="flex items-end gap-0.5 h-20">
                {analytics.recovery.dailyTrend.map((d, i) => {
                  const max = Math.max(...analytics.recovery!.dailyTrend.map(x => x.amount), 1)
                  const h   = Math.max(4, Math.round((d.amount / max) * 72))
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${fmtDate(d.date)}: ฿${fmtB(d.amount)}`}>
                      <div className="w-full rounded-t bg-green-400 dark:bg-green-500 transition-all" style={{ height: `${h}px` }} />
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 text-center">hover เพื่อดูวันและยอด</p>
            </SectionCard>

            {/* Top debtors */}
            <SectionCard title="ลูกหนี้ชำระสูงสุด (90 วัน)">
              <div className="space-y-2">
                {analytics.recovery.topDebtors.map((d, i) => (
                  <div key={d.id ?? i} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-white/[0.04] last:border-0">
                    <div>
                      <p className="text-[13px] font-medium text-slate-800 dark:text-white">{d.firstName} {d.lastName}</p>
                      <p className="text-[11px] text-slate-400">{d.debtorNumber} · {d.times} ครั้ง</p>
                    </div>
                    <span className="text-[14px] font-bold text-green-600">฿{fmtB(d.paid)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Collector ranking */}
            <SectionCard title="Collector Ranking (เดือนนี้)">
              <div className="space-y-2">
                {analytics.recovery.collectorRank.map((c, i) => (
                  <div key={c.collectorId} className="flex items-center gap-3">
                    <span className="text-[13px] font-bold text-slate-400 w-5">{i + 1}</span>
                    <span className="text-[13px] text-slate-700 dark:text-slate-300 flex-1">{c.name}</span>
                    <div className="w-32">{pctBar(Math.min(100, (c.amount / (analytics.recovery!.collectorRank[0]?.amount ?? 1)) * 100), 'bg-green-500')}</div>
                    <span className="text-[13px] font-bold text-green-600 w-16 text-right">฿{fmtB(c.amount)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── TAB: CRM ── */}
        {tab === 'CRM' && analytics?.crm && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <BigStat label="Contact Success Rate" value={`${analytics.crm.contactSuccessRate}%`} color={analytics.crm.contactSuccessRate >= 60 ? 'green' : 'orange'} />
              <BigStat label="ไม่ติดต่อ >7 วัน" value={fmt(analytics.crm.noContactDebtors.length)} color={analytics.crm.noContactDebtors.length > 5 ? 'red' : 'orange'} sub="ลูกหนี้" />
            </div>

            {/* Risk distribution */}
            <SectionCard title="ลูกหนี้ตามระดับความเสี่ยง">
              <div className="space-y-2">
                {analytics.crm.debtorByRisk.map(r => (
                  <div key={r.risk} className="flex items-center gap-3">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full w-20 text-center ${riskColor(r.risk)}`}>{r.risk}</span>
                    <div className="flex-1">{pctBar(Math.min(100, r.count * 5), r.risk === 'CRITICAL' ? 'bg-red-500' : r.risk === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500')}</div>
                    <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300 w-8 text-right">{r.count}</span>
                    <span className="text-[12px] text-slate-500 w-20 text-right">฿{fmtB(r.debt)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Contact stats */}
            <SectionCard title="ผลการติดต่อ (30 วัน)">
              <div className="grid grid-cols-2 gap-2">
                {analytics.crm.contactStats.map(c => (
                  <div key={c.result} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                    <span className="text-[12px] text-slate-600 dark:text-slate-400">{c.result}</span>
                    <span className="text-[13px] font-bold text-slate-800 dark:text-white">{c.count}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* No-contact debtors */}
            {analytics.crm.noContactDebtors.length > 0 && (
              <SectionCard title="ลูกหนี้ไม่ติดต่อ >7 วัน">
                <div className="space-y-2">
                  {analytics.crm.noContactDebtors.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-white/[0.04] last:border-0">
                      <div>
                        <p className="text-[13px] font-medium text-slate-800 dark:text-white">{d.firstName} {d.lastName}</p>
                        <p className="text-[11px] text-slate-400">{d.debtorNumber} · {d.assignedTo?.name ?? 'ไม่ระบุ'}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${riskColor(d.riskLevel)}`}>{d.riskLevel}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">฿{fmtB(d.remainingDebt)}</p>
                        <p className="text-[10px] text-red-400">{d.lastContactAt ? `ล่าสุด: ${fmtDate(d.lastContactAt)}` : 'ไม่เคยติดต่อ'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* ── TAB: Automation ── */}
        {tab === 'Automation' && analytics?.automation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BigStat label="กฎ Automation" value={fmt(analytics.automation.totalRules)} color="blue" />
              <BigStat label="Success Rate" value={`${analytics.automation.successRate}%`} color={analytics.automation.successRate >= 80 ? 'green' : 'orange'} />
              <BigStat label="Runs ทั้งหมด" value={fmt(analytics.automation.totalRuns)} color="slate" />
              <BigStat label="Failed" value={fmt(analytics.automation.failRuns)} color={analytics.automation.failRuns > 0 ? 'red' : 'green'} />
            </div>

            {/* Time saved */}
            <div className="rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
              <p className="text-[13px] font-bold text-green-700 dark:text-green-400 mb-2">⚡ Manual Work Reduced (30 วัน)</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className="text-xl font-bold text-green-700">{fmt(analytics.automation.manualWorkReduced.tasksAutoCreated)}</p><p className="text-[11px] text-green-600">Tasks Auto-Created</p></div>
                <div><p className="text-xl font-bold text-green-700">{fmt(analytics.automation.manualWorkReduced.notificationsAutoSent)}</p><p className="text-[11px] text-green-600">Notifs Auto-Sent</p></div>
                <div><p className="text-xl font-bold text-green-700">{fmt(analytics.automation.manualWorkReduced.minutesSaved)}</p><p className="text-[11px] text-green-600">นาทีที่ประหยัด</p></div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <SectionCard title="Most Triggered Rules">
                <div className="space-y-2">
                  {analytics.automation.topRules.map(r => (
                    <div key={r.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-800 dark:text-white truncate">{r.name}</p>
                        <p className="text-[11px] text-slate-400">{r.trigger}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-bold text-blue-600">{r.runCount}</p>
                        <p className="text-[10px] text-green-500">{r.runCount > 0 ? Math.round((r.successCount / r.runCount) * 100) : 0}% ok</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Failed Rules">
                {analytics.automation.failedRules.length === 0 ? (
                  <p className="text-[13px] text-green-600">ไม่มี failures</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.automation.failedRules.map(r => (
                      <div key={r.id} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-slate-800 dark:text-white truncate">{r.name}</p>
                          <p className="text-[11px] text-slate-400">{r.trigger}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-bold text-red-600">{r.failCount} fails</p>
                          <p className="text-[10px] text-slate-400">{r.runCount} total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="text-center">
              <Link href="/automation" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:underline">
                จัดการ Automation Rules →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon, href, bar }: {
  label: string; value: string; sub: string; color: string; icon: string; href?: string; bar?: number
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600', red: 'text-red-600', green: 'text-green-600',
    orange: 'text-orange-600', purple: 'text-purple-600', yellow: 'text-yellow-600',
    slate: 'text-slate-700 dark:text-slate-300',
  }
  const barColorMap: Record<string, string> = {
    blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500',
    orange: 'bg-orange-500', purple: 'bg-purple-500', yellow: 'bg-yellow-500', slate: 'bg-slate-400',
  }
  const content = (
    <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] p-3.5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight pr-1">{label}</p>
        <span className="text-[16px]">{icon}</span>
      </div>
      <p className={`text-[22px] font-bold leading-none mb-1 ${colorMap[color] ?? colorMap.slate}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
      {bar !== undefined && pctBar(bar, barColorMap[color] ?? 'bg-blue-500')}
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function RiskPanel({ risk }: { risk: RiskData }) {
  const hasRisks = risk.criticalCases.length > 0 || risk.missedHearings.length > 0 || risk.highDebtDebtors.length > 0 || risk.brokenPromises.length > 0

  if (!hasRisks && risk.noContactCount === 0 && risk.slaOverdueCount === 0) {
    return (
      <div className="rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-center">
        <p className="text-[14px] font-semibold text-green-700 dark:text-green-400">ไม่มีความเสี่ยงเร่งด่วนในขณะนี้</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-red-200 dark:border-red-900/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[16px]">🚨</span>
        <h3 className="text-[13px] font-bold text-red-700 dark:text-red-400">Risk Panel — ต้องดำเนินการทันที</h3>
      </div>
      <div className="space-y-3">
        {risk.criticalCases.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wider mb-1.5">คดีวิกฤต ({risk.criticalCases.length})</p>
            <div className="space-y-1.5">
              {risk.criticalCases.map(c => (
                <Link key={c.id} href={`/cases/${c.id}`} className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-900/10 px-3 py-2 hover:bg-red-100 transition-colors">
                  <div>
                    <p className="text-[12px] font-medium text-slate-800 dark:text-white">{c.caseNumber} — {c.caseTitle}</p>
                    <p className="text-[11px] text-slate-500">{c.assignedEmployee?.name ?? 'ไม่ระบุ'}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${riskColor(c.riskLevel)}`}>{c.riskLevel}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        {risk.missedHearings.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider mb-1.5">พลาดนัดศาล ({risk.missedHearings.length})</p>
            <div className="space-y-1.5">
              {risk.missedHearings.map(e => (
                <div key={e.id} className="flex items-center justify-between rounded-lg bg-orange-50 dark:bg-orange-900/10 px-3 py-2">
                  <div>
                    <p className="text-[12px] font-medium text-slate-800 dark:text-white">{e.courtName}</p>
                    <p className="text-[11px] text-slate-500">{e.case.caseNumber} · {e.assignedLawyer?.name ?? 'ไม่ระบุ'}</p>
                  </div>
                  <p className="text-[11px] text-slate-400">{fmtDate(e.appointmentDate)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {risk.highDebtDebtors.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-yellow-600 uppercase tracking-wider mb-1.5">หนี้สูง (top 5)</p>
            <div className="space-y-1.5">
              {risk.highDebtDebtors.map(d => (
                <div key={d.id} className="flex items-center justify-between rounded-lg bg-yellow-50 dark:bg-yellow-900/10 px-3 py-2">
                  <div>
                    <p className="text-[12px] font-medium text-slate-800 dark:text-white">{d.firstName} {d.lastName}</p>
                    <p className="text-[11px] text-slate-500">{d.debtorNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-orange-600">฿{fmtB(d.remainingDebt)}</p>
                    {d.lastContactAt && <p className="text-[10px] text-slate-400">ล่าสุด: {fmtDate(d.lastContactAt)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {risk.brokenPromises.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">สัญญาผิดนัด ({risk.brokenPromises.length})</p>
            <div className="space-y-1.5">
              {risk.brokenPromises.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-900/10 px-3 py-2">
                  <p className="text-[12px] text-slate-700 dark:text-slate-300">{p.debtor.firstName} {p.debtor.lastName} <span className="text-slate-400">({p.debtor.debtorNumber})</span></p>
                  <p className="text-[12px] font-bold text-red-600">฿{fmtB(p.promisedAmount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {(risk.noContactCount > 0 || risk.slaOverdueCount > 0) && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {risk.noContactCount > 0 && (
              <Link href="/debtors" className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-center hover:bg-slate-100 transition-colors">
                <p className="text-[18px] font-bold text-orange-600">{risk.noContactCount}</p>
                <p className="text-[11px] text-slate-500">ไม่ติดต่อ &gt;7 วัน</p>
              </Link>
            )}
            {risk.slaOverdueCount > 0 && (
              <Link href="/cases" className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-center hover:bg-slate-100 transition-colors">
                <p className="text-[18px] font-bold text-red-600">{risk.slaOverdueCount}</p>
                <p className="text-[11px] text-slate-500">SLA เกินกำหนด</p>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function BigStat({ label, value, color, sub, small }: { label: string; value: string; color: string; sub?: string; small?: boolean }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600', red: 'text-red-600', green: 'text-green-600',
    orange: 'text-orange-600', purple: 'text-purple-600', slate: 'text-slate-700 dark:text-slate-300',
  }
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] p-4 text-center">
      <p className={`${small ? 'text-[13px] leading-tight' : 'text-2xl'} font-bold ${colorMap[color] ?? colorMap.slate}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      <p className="text-[11px] text-slate-400 mt-1">{label}</p>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] p-4">
      <h3 className="text-[13px] font-bold text-slate-800 dark:text-white mb-3">{title}</h3>
      {children}
    </div>
  )
}

function LeaderboardCard({ title, subtitle, entries, metric, color }: {
  title: string; subtitle: string; entries: LeaderEntry[]; metric: (e: LeaderEntry) => string; color: string
}) {
  const colorMap: Record<string, string> = { green: 'text-green-600', red: 'text-red-600', blue: 'text-blue-600', orange: 'text-orange-600' }
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] p-4">
      <h3 className="text-[13px] font-bold text-slate-800 dark:text-white">{title}</h3>
      <p className="text-[11px] text-slate-400 mb-3">{subtitle}</p>
      {entries.length === 0 ? (
        <p className="text-[12px] text-slate-400">ไม่มีข้อมูล</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={e.userId} className="flex items-center gap-2">
              <span className={`text-[12px] font-bold w-5 ${i === 0 ? 'text-yellow-500' : 'text-slate-400'}`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-slate-800 dark:text-white truncate">{e.name}</p>
                <p className="text-[10px] text-slate-400">{e.department ?? e.role}</p>
              </div>
              <span className={`text-[13px] font-bold ${colorMap[color] ?? 'text-slate-600'}`}>{metric(e)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
