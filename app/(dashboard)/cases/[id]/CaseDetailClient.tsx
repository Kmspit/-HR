'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import CaseDocumentsTab from './CaseDocumentsTab'
import CourtEventsTab from './CourtEventsTab'

// ── Types ──────────────────────────────────────────────────────────────────
type CaseType     = 'DEBT_COLLECTION' | 'LEGAL' | 'COURT' | 'ASSET_INVESTIGATION' | 'ENFORCEMENT' | 'INTERNAL_LEGAL'
type CaseStatus   = 'NEW' | 'ASSIGNED' | 'INVESTIGATING' | 'NEGOTIATING' | 'WAITING_DOCUMENT' | 'FILED' | 'COURT_PROCESS' | 'ENFORCEMENT' | 'SETTLED' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type TaskStatus   = 'PENDING' | 'IN_PROGRESS' | 'WAITING_REVIEW' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE' | 'REVISION' | 'WAITING_APPROVAL' | 'REJECTED' | 'NEW' | 'ASSIGNED' | 'WAITING_DOC'

interface CaseData {
  id: string; caseNumber: string; caseTitle: string; caseType: CaseType
  status: CaseStatus; priority: CasePriority; description: string | null
  debtAmount: number | null; department: string | null; dueDate: string | null
  openedAt: string; closedAt: string | null; createdAt: string; updatedAt: string
  riskLevel: string; slaDeadline: string | null
  collectedAmount: number; legalFee: number; courtFee: number; enforcementFee: number
  assignedEmployee: { id: string; name: string; department: string | null; employeeId: string | null; role: string } | null
  createdBy: { id: string; name: string; role: string }
  client: CaseClientData | null
  debtor: CaseDebtorData | null
  courts: CourtData[]
  timeline: TimelineEntry[]
  tasks: TaskSummary[]
  checklists: ChecklistItem[]
  debtorActivities: DebtorActivity[]
  financial: CaseFinancial | null
  _count: { tasks: number; courts: number; checklists: number }
}
interface CaseClientData { id: string; clientName: string | null; companyName: string | null; taxId: string | null; phone: string | null; email: string | null; address: string | null; contactPerson: string | null; note: string | null }
interface CaseDebtorData { id: string; fullName: string; idCard: string | null; phone: string | null; email: string | null; address: string | null; workplace: string | null; riskLevel: string; assetInfo: string | null; note: string | null }
interface CourtData { id: string; courtName: string; courtDate: string; appointmentTime: string | null; judgeName: string | null; result: string | null; note: string | null; createdBy: { id: string; name: string } }
interface TimelineEntry { id: string; action: string; description: string; meta: string | null; createdAt: string; user: { id: string; name: string; role: string } }
interface TaskSummary { id: string; title: string; status: TaskStatus; priority: string; dueDate: string | null; type: string; assignee: { id: string; name: string } }
interface ChecklistItem { id: string; label: string; done: boolean; required: boolean; sortOrder: number; doneAt: string | null; doneBy: { id: string; name: string } | null }
interface DebtorActivity { id: string; activityType: string; note: string | null; promisedDate: string | null; promisedAmount: number | null; createdAt: string; actor: { id: string; name: string; role: string } }
interface CaseFinancial { id: string; debtAmount: number; collectedAmount: number; legalFee: number; courtFee: number; enforcementFee: number; otherFee: number; updatedBy: { id: string; name: string } | null; updatedAt: string }

// ── Labels ────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<CaseType, string> = {
  DEBT_COLLECTION: 'เร่งรัดหนี้', LEGAL: 'กฎหมาย', COURT: 'คดีศาล',
  ASSET_INVESTIGATION: 'สืบทรัพย์', ENFORCEMENT: 'บังคับคดี', INTERNAL_LEGAL: 'กฎหมายภายใน',
}
const STATUS_LABELS: Record<CaseStatus, string> = {
  NEW: 'ใหม่', ASSIGNED: 'มอบหมายแล้ว', INVESTIGATING: 'กำลังสืบสวน',
  NEGOTIATING: 'เจรจา', WAITING_DOCUMENT: 'รอเอกสาร', FILED: 'ยื่นฟ้อง',
  COURT_PROCESS: 'ชั้นศาล', ENFORCEMENT: 'บังคับคดี', SETTLED: 'ยุติ/ตกลง',
  COMPLETED: 'เสร็จสิ้น', ON_HOLD: 'พักคดี', CANCELLED: 'ยกเลิก',
}
const STATUS_COLOR: Record<CaseStatus, string> = {
  NEW:           'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  ASSIGNED:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  INVESTIGATING: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  NEGOTIATING:   'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  WAITING_DOCUMENT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  FILED:         'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  COURT_PROCESS: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ENFORCEMENT:   'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  SETTLED:       'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  COMPLETED:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ON_HOLD:       'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  CANCELLED:     'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
}
const PRIORITY_LABELS: Record<CasePriority, string> = { LOW: 'ต่ำ', MEDIUM: 'ปกติ', HIGH: 'สูง', CRITICAL: 'วิกฤต' }
const PRIORITY_COLOR: Record<CasePriority, string> = {
  LOW: 'text-slate-500', MEDIUM: 'text-blue-600', HIGH: 'text-orange-600 font-semibold', CRITICAL: 'text-red-600 font-bold',
}
const RISK_COLOR: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700', MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700', CRITICAL: 'bg-red-100 text-red-700 font-bold',
}
const TASK_STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600', IN_PROGRESS: 'bg-blue-100 text-blue-700',
  WAITING_REVIEW: 'bg-amber-100 text-amber-700', COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600', OVERDUE: 'bg-red-200 text-red-800',
}
const ACTION_ICON: Record<string, string> = {
  created: '📁', status_changed: '🔄', assigned: '👤', task_created: '📋',
  task_completed: '✅', court_added: '⚖️', court_removed: '🗑️', doc_uploaded: '📄',
  comment_added: '💬', cancelled: '❌', checklist_done: '☑️', checklist_undone: '☐',
  debtor_activity: '📞', financial_updated: '💰', auto_tasks_created: '🤖',
  risk_changed: '⚠️', default: '📌',
}
const ACTIVITY_LABELS: Record<string, string> = {
  phone_contacted:       '📞 โทรติดต่อสำเร็จ',
  unable_to_contact:     '📵 โทรติดต่อไม่ได้',
  payment_promise:       '🤝 นัดชำระหนี้',
  payment_completed:     '✅ ชำระหนี้แล้ว',
  refused_payment:       '❌ ปฏิเสธการชำระ',
  settlement_discussion: '💬 เจรจาประนอม',
  lawsuit_filed:         '⚖️ ยื่นฟ้องแล้ว',
  letter_sent:           '📄 ส่งหนังสือแล้ว',
  visit_in_person:       '🚗 เข้าพบลูกหนี้',
  other:                 '📌 อื่นๆ',
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function thb(n: number) { return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) }

const TABS = ['ภาพรวม', 'ไทม์ไลน์', 'งาน', 'เช็คลิสต์', 'ศาล', 'ลูกหนี้', 'การเงิน', 'เอกสาร', 'ออดิต'] as const
type Tab = typeof TABS[number]

// ── Main Component ─────────────────────────────────────────────────────────
export default function CaseDetailClient({ initialCase, role, userId, canEdit, cloudName }: {
  initialCase: CaseData
  role: string
  userId: string
  canEdit: boolean
  cloudName?: string
}) {
  const [caseData,   setCaseData]   = useState<CaseData>(initialCase)
  const [activeTab,  setActiveTab]  = useState<Tab>('ภาพรวม')
  const [showStatus, setShowStatus] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [posting,    setPosting]    = useState(false)

  const c = caseData

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cases/${c.id}`)
    if (res.ok) { const d = await res.json(); setCaseData(d.case) }
  }, [c.id])

  async function changeStatus(newStatus: string) {
    setShowStatus(false)
    await fetch(`/api/cases/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    await refetch()
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    setPosting(true)
    await fetch(`/api/cases/${c.id}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: commentText.trim() }),
    })
    setCommentText('')
    setPosting(false)
    await refetch()
  }

  async function recalcRisk() {
    await fetch(`/api/cases/${c.id}/risk`, { method: 'POST' })
    await refetch()
  }

  const isActive = !['COMPLETED', 'CANCELLED'].includes(c.status)

  return (
    <div className="flex flex-col pb-24 md:pb-0">
      {/* Case Header */}
      <div className="bg-white dark:bg-slate-900/60 border-b border-slate-200 dark:border-white/[0.06] px-4 py-4 md:px-6">
        <div className="flex items-start gap-3 mb-3">
          <Link href="/cases" className="flex-shrink-0 mt-0.5 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[12px] text-blue-600 dark:text-blue-400 font-semibold">{c.caseNumber}</p>
            <h1 className="font-bold text-slate-900 dark:text-white text-[17px] leading-tight">{c.caseTitle}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS_COLOR[c.status]}`}>
                {STATUS_LABELS[c.status]}
              </span>
              <span className={`text-[12px] ${PRIORITY_COLOR[c.priority]}`}>{PRIORITY_LABELS[c.priority]}</span>
              <span className="text-[12px] text-slate-400">{TYPE_LABELS[c.caseType]}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${RISK_COLOR[c.riskLevel] ?? 'bg-slate-100 text-slate-600'}`}>
                ⚡ {c.riskLevel}
              </span>
              {c.debtAmount != null && <span className="text-[12px] text-slate-500">฿{thb(c.debtAmount)}</span>}
            </div>
          </div>
          {canEdit && isActive && (
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowStatus(!showStatus)} className="h-8 px-3 flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 text-[12px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors">
                เปลี่ยนสถานะ
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showStatus && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-20 py-1 overflow-hidden">
                  {(Object.entries(STATUS_LABELS) as [CaseStatus, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => changeStatus(v)} className={`w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors ${c.status === v ? 'font-semibold text-blue-600' : 'text-slate-700 dark:text-slate-300'}`}>{l}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab Nav */}
        <div className="flex overflow-x-auto scrollbar-none gap-0 -mb-px">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`flex-shrink-0 px-3 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4 md:p-6">

        {/* ── Overview ───────────────────────────────── */}
        {activeTab === 'ภาพรวม' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white text-[14px]">ข้อมูลทั่วไป</h3>
                <button onClick={recalcRisk} className="text-[11px] text-blue-600 hover:underline">คำนวณความเสี่ยงใหม่</button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <Info label="เลขคดี"        value={c.caseNumber} mono />
                <Info label="ประเภท"        value={TYPE_LABELS[c.caseType]} />
                <Info label="สถานะ"         value={STATUS_LABELS[c.status]} />
                <Info label="ความเร่งด่วน"  value={PRIORITY_LABELS[c.priority]} />
                <Info label="ความเสี่ยง"    value={c.riskLevel} />
                {c.debtAmount != null && <Info label="มูลหนี้" value={`฿${thb(c.debtAmount)}`} />}
                {c.department  && <Info label="ฝ่าย" value={c.department} />}
                <Info label="วันเปิดคดี"    value={fmtDate(c.openedAt)} />
                {c.dueDate && <Info label="วันครบกำหนด" value={fmtDate(c.dueDate)} />}
                {c.slaDeadline && <Info label="SLA Deadline" value={fmtDate(c.slaDeadline)} />}
                {c.closedAt && <Info label="วันปิดคดี" value={fmtDate(c.closedAt)} />}
              </div>
              {c.description && (
                <div>
                  <p className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">รายละเอียด</p>
                  <p className="text-[13px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.description}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 space-y-2">
                <h3 className="font-semibold text-slate-900 dark:text-white text-[14px]">ผู้รับผิดชอบ</h3>
                {c.assignedEmployee ? (
                  <div className="text-[13px] space-y-1">
                    <p className="font-medium text-slate-900 dark:text-white">{c.assignedEmployee.name}</p>
                    {c.assignedEmployee.department && <p className="text-slate-500">{c.assignedEmployee.department}</p>}
                    {c.assignedEmployee.employeeId  && <p className="text-slate-400 font-mono text-[11px]">{c.assignedEmployee.employeeId}</p>}
                  </div>
                ) : <p className="text-[13px] text-slate-400">ยังไม่ได้มอบหมาย</p>}
                <p className="text-[11px] text-slate-400">สร้างโดย: {c.createdBy.name}</p>
              </div>

              <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 space-y-2">
                <h3 className="font-semibold text-slate-900 dark:text-white text-[14px]">สถิติ</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="งาน"        value={c._count.tasks}      color="text-blue-600" />
                  <Stat label="นัดศาล"     value={c._count.courts}     color="text-purple-600" />
                  <Stat label="เช็คลิสต์" value={`${c.checklists.filter(ch => ch.done).length}/${c._count.checklists}`} color="text-green-600" small />
                  <Stat label="เหตุการณ์" value={c.timeline.length}    color="text-slate-600" />
                </div>
              </div>
            </div>

            {/* Quick Financial Summary */}
            {c.debtAmount != null && (
              <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white text-[14px] mb-3">สรุปการเงิน</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[18px] font-bold text-slate-900 dark:text-white">฿{thb(c.debtAmount)}</p>
                    <p className="text-[11px] text-slate-400">มูลหนี้รวม</p>
                  </div>
                  <div>
                    <p className="text-[18px] font-bold text-green-600">฿{thb(c.collectedAmount ?? 0)}</p>
                    <p className="text-[11px] text-slate-400">เก็บได้แล้ว</p>
                  </div>
                  <div>
                    <p className="text-[18px] font-bold text-orange-600">
                      {c.debtAmount > 0 ? Math.round(((c.collectedAmount ?? 0) / c.debtAmount) * 100) : 0}%
                    </p>
                    <p className="text-[11px] text-slate-400">Recovery Rate</p>
                  </div>
                </div>
              </div>
            )}

            {c.client && (
              <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 space-y-2">
                <h3 className="font-semibold text-slate-900 dark:text-white text-[14px]">ลูกค้า (ผู้ว่าจ้าง)</h3>
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  {c.client.companyName   && <Info label="บริษัท"   value={c.client.companyName} />}
                  {c.client.clientName    && <Info label="ชื่อ"      value={c.client.clientName} />}
                  {c.client.taxId         && <Info label="เลขภาษี"   value={c.client.taxId} mono />}
                  {c.client.phone         && <Info label="โทรศัพท์"  value={c.client.phone} />}
                  {c.client.email         && <Info label="อีเมล"     value={c.client.email} />}
                  {c.client.contactPerson && <Info label="ผู้ติดต่อ" value={c.client.contactPerson} />}
                </div>
                {c.client.address && <p className="text-[12px] text-slate-500">{c.client.address}</p>}
              </div>
            )}
          </div>
        )}

        {/* ── Timeline ────────────────────────────────── */}
        {activeTab === 'ไทม์ไลน์' && (
          <div className="max-w-2xl space-y-3">
            <form onSubmit={postComment} className="flex gap-2">
              <input
                value={commentText} onChange={e => setCommentText(e.target.value)}
                placeholder="เพิ่มบันทึก / ความคิดเห็น..."
                className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" disabled={posting || !commentText.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
                {posting ? '...' : 'บันทึก'}
              </button>
            </form>
            <div className="relative pl-6">
              <div className="absolute left-[9px] top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-white/[0.08]" />
              {[...c.timeline].reverse().map(entry => (
                <div key={entry.id} className="relative mb-4">
                  <div className="absolute -left-[15px] top-[3px] h-4 w-4 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center text-[10px]">
                    {ACTION_ICON[entry.action] ?? ACTION_ICON.default}
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm px-3 py-2.5">
                    <p className="text-[13px] text-slate-800 dark:text-slate-200">{entry.description}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{entry.user.name} · {fmtDateTime(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
              {c.timeline.length === 0 && <p className="text-[13px] text-slate-400 py-4">ยังไม่มีประวัติ</p>}
            </div>
          </div>
        )}

        {/* ── Tasks ───────────────────────────────────── */}
        {activeTab === 'งาน' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-slate-500">{c.tasks.length} งานที่เชื่อมกับคดีนี้</p>
              <Link href={`/tasks?search=${c.caseNumber}`} className="text-[12px] text-blue-600 hover:underline">ดูทั้งหมดใน Tasks →</Link>
            </div>
            {c.tasks.length === 0 ? (
              <p className="text-[13px] text-slate-400">ยังไม่มีงานที่เชื่อมกับคดีนี้</p>
            ) : c.tasks.map(t => (
              <div key={t.id} className="block rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900 dark:text-white text-[13px] truncate">{t.title}</p>
                  <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TASK_STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {t.status}
                  </span>
                </div>
                <p className="text-[12px] text-slate-400 mt-0.5">ผู้รับ: {t.assignee.name} {t.dueDate ? `· ครบ ${fmtDate(t.dueDate)}` : ''}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Checklist ───────────────────────────────── */}
        {activeTab === 'เช็คลิสต์' && (
          <ChecklistTab caseId={c.id} items={c.checklists} canEdit={canEdit} onRefresh={refetch} />
        )}

        {/* ── Court ───────────────────────────────────── */}
        {activeTab === 'ศาล' && (
          <CourtEventsTab caseId={c.id} canEdit={canEdit && isActive} />
        )}

        {/* ── Debtor ──────────────────────────────────── */}
        {activeTab === 'ลูกหนี้' && (
          <DebtorTab caseId={c.id} debtor={c.debtor} activities={c.debtorActivities} canEdit={canEdit} onRefresh={refetch} />
        )}

        {/* ── Finance ─────────────────────────────────── */}
        {activeTab === 'การเงิน' && (
          <FinanceTab caseId={c.id} caseData={c} canEdit={canEdit} onRefresh={refetch} />
        )}

        {/* ── Documents ───────────────────────────────── */}
        {activeTab === 'เอกสาร' && (
          <CaseDocumentsTab
            caseId={c.id}
            caseNumber={c.caseNumber}
            cloudName={cloudName ?? ''}
            canEdit={canEdit}
          />
        )}

        {/* ── Audit Log ───────────────────────────────── */}
        {activeTab === 'ออดิต' && (
          <div className="max-w-2xl space-y-2">
            <p className="text-[12px] text-slate-400 mb-3">ประวัติการเปลี่ยนแปลงทั้งหมด (immutable)</p>
            {c.timeline.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-white/[0.05] px-3 py-2.5 text-[12px]">
                <span className="flex-shrink-0 text-[14px]">{ACTION_ICON[entry.action] ?? ACTION_ICON.default}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 dark:text-slate-200">{entry.description}</p>
                  <p className="text-slate-400 mt-0.5">{entry.user.name} · {fmtDateTime(entry.createdAt)}</p>
                </div>
              </div>
            ))}
            {c.timeline.length === 0 && <p className="text-[13px] text-slate-400">ยังไม่มีประวัติ</p>}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Checklist Tab ──────────────────────────────────────────────────────────
function ChecklistTab({ caseId, items, canEdit, onRefresh }: {
  caseId: string; items: ChecklistItem[]; canEdit: boolean; onRefresh: () => void
}) {
  const [newLabel, setNewLabel] = useState('')
  const [adding,   setAdding]   = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setAdding(true)
    await fetch(`/api/cases/${caseId}/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim() }),
    })
    setNewLabel('')
    setAdding(false)
    onRefresh()
  }

  async function toggleItem(id: string) {
    setToggling(id)
    await fetch(`/api/cases/${caseId}/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', checklistId: id }),
    })
    setToggling(null)
    onRefresh()
  }

  async function deleteItem(id: string) {
    await fetch(`/api/cases/${caseId}/checklist?checklistId=${id}`, { method: 'DELETE' })
    onRefresh()
  }

  const done  = items.filter(i => i.done).length
  const total = items.length

  return (
    <div className="max-w-2xl space-y-3">
      {total > 0 && (
        <div className="flex items-center gap-3 mb-1">
          <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div className="h-2 bg-green-500 rounded-full transition-all" style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
          </div>
          <span className="text-[12px] text-slate-500 whitespace-nowrap">{done}/{total} เสร็จแล้ว</span>
        </div>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className={`flex items-center gap-3 rounded-xl bg-white dark:bg-slate-900/60 border px-4 py-3 transition-colors ${item.done ? 'border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10' : 'border-slate-200 dark:border-white/[0.07]'}`}>
            <button
              onClick={() => toggleItem(item.id)}
              disabled={toggling === item.id || !canEdit}
              className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${item.done ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-green-400'}`}
            >
              {item.done && <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] ${item.done ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                {item.required && <span className="text-red-500 mr-1">*</span>}
                {item.label}
              </p>
              {item.done && item.doneBy && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {item.doneBy.name} · {item.doneAt ? fmtDateTime(item.doneAt) : ''}
                </p>
              )}
            </div>
            {canEdit && (
              <button onClick={() => deleteItem(item.id)} className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded text-slate-300 hover:text-red-400 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-[13px] text-slate-400">ยังไม่มีรายการเช็คลิสต์</p>}
      </div>

      {canEdit && (
        <form onSubmit={addItem} className="flex gap-2 mt-2">
          <input
            value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="เพิ่มรายการใหม่..."
            className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" disabled={adding || !newLabel.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
            {adding ? '...' : 'เพิ่ม'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Debtor Tab ─────────────────────────────────────────────────────────────
function DebtorTab({ caseId, debtor, activities, canEdit, onRefresh }: {
  caseId: string; debtor: CaseDebtorData | null; activities: DebtorActivity[]; canEdit: boolean; onRefresh: () => void
}) {
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form, setForm] = useState({ activityType: 'phone_contacted', note: '', promisedDate: '', promisedAmount: '' })

  async function submitActivity(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/cases/${caseId}/debtor-activity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activityType:   form.activityType,
        note:           form.note || null,
        promisedDate:   form.promisedDate  || null,
        promisedAmount: form.promisedAmount ? Number(form.promisedAmount) : null,
      }),
    })
    setForm({ activityType: 'phone_contacted', note: '', promisedDate: '', promisedAmount: '' })
    setShowForm(false)
    setSaving(false)
    onRefresh()
  }

  return (
    <div className="max-w-2xl space-y-4">
      {debtor && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">{debtor.fullName}</h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${RISK_COLOR[debtor.riskLevel] ?? 'bg-slate-100 text-slate-600'}`}>
              ⚡ {debtor.riskLevel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            {debtor.idCard    && <Info label="เลขบัตร"  value={debtor.idCard} mono />}
            {debtor.phone     && <Info label="โทรศัพท์" value={debtor.phone} />}
            {debtor.email     && <Info label="อีเมล"    value={debtor.email} />}
            {debtor.workplace && <Info label="ที่ทำงาน" value={debtor.workplace} />}
          </div>
          {debtor.address  && <p className="text-[12px] text-slate-500">{debtor.address}</p>}
          {debtor.assetInfo && <p className="text-[12px] text-slate-500">ทรัพย์สิน: {debtor.assetInfo}</p>}
        </div>
      )}

      {/* Activity history */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-slate-900 dark:text-white text-[14px]">ประวัติการติดต่อ ({activities.length})</h3>
          {canEdit && (
            <button onClick={() => setShowForm(!showForm)} className="text-[12px] text-blue-600 hover:underline">
              {showForm ? 'ยกเลิก' : '+ บันทึกการติดต่อ'}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={submitActivity} className="rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 mb-3 space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ประเภทการติดต่อ</label>
              <select value={form.activityType} onChange={e => setForm(p => ({ ...p, activityType: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(ACTIVITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">บันทึก</label>
              <textarea value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} rows={2} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="รายละเอียดการติดต่อ..." />
            </div>
            {['payment_promise'].includes(form.activityType) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">วันที่นัดชำระ</label>
                  <input type="date" value={form.promisedDate} onChange={e => setForm(p => ({ ...p, promisedDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">จำนวนเงิน (บาท)</label>
                  <input type="number" value={form.promisedAmount} onChange={e => setForm(p => ({ ...p, promisedAmount: e.target.value }))} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 py-2 text-[13px] text-slate-600 dark:text-slate-300">ยกเลิก</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-[13px] font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        )}

        <div className="relative pl-6 space-y-3">
          <div className="absolute left-[9px] top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-white/[0.08]" />
          {activities.map(act => (
            <div key={act.id} className="relative">
              <div className="absolute -left-[15px] top-[3px] h-4 w-4 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center text-[9px]">
                {(ACTIVITY_LABELS[act.activityType] ?? '').slice(0, 2)}
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] px-3 py-2.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-medium text-slate-800 dark:text-slate-200">{ACTIVITY_LABELS[act.activityType] ?? act.activityType}</span>
                </div>
                {act.note && <p className="text-[12px] text-slate-600 dark:text-slate-400">{act.note}</p>}
                {act.promisedDate && <p className="text-[11px] text-blue-600">นัดชำระ: {fmtDate(act.promisedDate)} {act.promisedAmount ? `฿${thb(act.promisedAmount)}` : ''}</p>}
                <p className="text-[11px] text-slate-400 mt-0.5">{act.actor.name} · {fmtDateTime(act.createdAt)}</p>
              </div>
            </div>
          ))}
          {activities.length === 0 && <p className="text-[13px] text-slate-400 py-2">ยังไม่มีประวัติการติดต่อ</p>}
        </div>
      </div>
    </div>
  )
}

// ── Finance Tab ────────────────────────────────────────────────────────────
function FinanceTab({ caseId, caseData, canEdit, onRefresh }: {
  caseId: string; caseData: CaseData; canEdit: boolean; onRefresh: () => void
}) {
  const f = caseData.financial
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [form, setForm] = useState({
    debtAmount:      String(f?.debtAmount      ?? caseData.debtAmount ?? 0),
    collectedAmount: String(f?.collectedAmount  ?? 0),
    legalFee:        String(f?.legalFee         ?? 0),
    courtFee:        String(f?.courtFee         ?? 0),
    enforcementFee:  String(f?.enforcementFee   ?? 0),
    otherFee:        String(f?.otherFee         ?? 0),
  })

  const debt      = Number(form.debtAmount)
  const collected = Number(form.collectedAmount)
  const totalFee  = Number(form.legalFee) + Number(form.courtFee) + Number(form.enforcementFee) + Number(form.otherFee)
  const remaining = Math.max(0, debt - collected)
  const recovery  = debt > 0 ? Math.round((collected / debt) * 100) : 0

  // Sync when financial data loads
  useEffect(() => {
    if (f) {
      setForm({
        debtAmount:      String(f.debtAmount),
        collectedAmount: String(f.collectedAmount),
        legalFee:        String(f.legalFee),
        courtFee:        String(f.courtFee),
        enforcementFee:  String(f.enforcementFee),
        otherFee:        String(f.otherFee),
      })
    }
  }, [f])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/cases/${caseId}/financial`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        debtAmount:      Number(form.debtAmount),
        collectedAmount: Number(form.collectedAmount),
        legalFee:        Number(form.legalFee),
        courtFee:        Number(form.courtFee),
        enforcementFee:  Number(form.enforcementFee),
        otherFee:        Number(form.otherFee),
      }),
    })
    setSaving(false)
    setEditing(false)
    onRefresh()
  }

  function field(k: keyof typeof form, label: string) {
    return (
      <div key={k}>
        <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
        <input
          type="number" min="0" step="0.01"
          value={form[k]}
          onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
          disabled={!editing}
          className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 disabled:bg-slate-50 dark:disabled:bg-slate-900 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-3 text-center">
          <p className="text-[18px] font-bold text-slate-900 dark:text-white">฿{thb(debt)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">มูลหนี้รวม</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-3 text-center">
          <p className="text-[18px] font-bold text-green-600">฿{thb(collected)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">เก็บได้แล้ว</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-3 text-center">
          <p className="text-[18px] font-bold text-orange-600">฿{thb(remaining)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">คงค้าง</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-3 text-center">
          <p className="text-[18px] font-bold text-blue-600">{recovery}%</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Recovery</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4">
        <div className="flex justify-between text-[12px] text-slate-500 mb-1.5">
          <span>Progress</span><span>{recovery}%</span>
        </div>
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div className="h-3 rounded-full transition-all" style={{ width: `${Math.min(100, recovery)}%`, background: recovery >= 80 ? '#22c55e' : recovery >= 50 ? '#3b82f6' : '#f97316' }} />
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 dark:text-white text-[14px]">รายละเอียดการเงิน</h3>
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="text-[12px] text-blue-600 hover:underline">แก้ไข</button>
          )}
        </div>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field('debtAmount', 'มูลหนี้รวม (บาท)')}
            {field('collectedAmount', 'เก็บได้แล้ว (บาท)')}
            {field('legalFee', 'ค่าทนาย (บาท)')}
            {field('courtFee', 'ค่าศาล (บาท)')}
            {field('enforcementFee', 'ค่าบังคับคดี (บาท)')}
            {field('otherFee', 'ค่าอื่นๆ (บาท)')}
          </div>
          <div className="flex items-center justify-between text-[13px] bg-slate-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
            <span className="text-slate-500">ค่าใช้จ่ายรวม</span>
            <span className="font-semibold text-slate-900 dark:text-white">฿{thb(totalFee)}</span>
          </div>
          {editing && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 py-2.5 text-[14px] font-medium text-slate-700 dark:text-slate-300">ยกเลิก</button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          )}
          {f?.updatedBy && <p className="text-[11px] text-slate-400">อัปเดตโดย: {f.updatedBy.name} · {fmtDateTime(f.updatedAt)}</p>}
        </form>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────
function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-[13px] text-slate-800 dark:text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
function Stat({ label, value, color, small }: { label: string; value: number | string; color: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] p-2.5">
      <p className={`${small ? 'text-[13px] font-semibold' : 'text-xl font-bold'} ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}

