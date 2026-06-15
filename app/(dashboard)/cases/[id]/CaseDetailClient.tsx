'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

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
  assignedEmployee: { id: string; name: string; department: string | null; employeeId: string | null; role: string } | null
  createdBy: { id: string; name: string; role: string }
  client: CaseClientData | null
  debtor: CaseDebtorData | null
  courts: CourtData[]
  timeline: TimelineEntry[]
  tasks: TaskSummary[]
  _count: { tasks: number; courts: number }
}
interface CaseClientData { id: string; clientName: string | null; companyName: string | null; taxId: string | null; phone: string | null; email: string | null; address: string | null; contactPerson: string | null; note: string | null }
interface CaseDebtorData { id: string; fullName: string; idCard: string | null; phone: string | null; email: string | null; address: string | null; workplace: string | null; riskLevel: string; assetInfo: string | null; note: string | null }
interface CourtData { id: string; courtName: string; courtDate: string; appointmentTime: string | null; judgeName: string | null; result: string | null; note: string | null; createdBy: { id: string; name: string } }
interface TimelineEntry { id: string; action: string; description: string; meta: string | null; createdAt: string; user: { id: string; name: string; role: string } }
interface TaskSummary { id: string; title: string; status: TaskStatus; priority: string; dueDate: string | null; type: string; assignee: { id: string; name: string } }

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
const TASK_STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600', IN_PROGRESS: 'bg-blue-100 text-blue-700',
  WAITING_REVIEW: 'bg-amber-100 text-amber-700', COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600', OVERDUE: 'bg-red-200 text-red-800',
}
const ACTION_ICON: Record<string, string> = {
  created: '📁', status_changed: '🔄', assigned: '👤', task_created: '📋',
  task_completed: '✅', court_added: '⚖️', court_removed: '🗑️', doc_uploaded: '📄',
  comment_added: '💬', cancelled: '❌', default: '📌',
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function thb(n: number) { return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) }

const TABS = ['ภาพรวม', 'ไทม์ไลน์', 'งาน', 'ศาล', 'เอกสาร', 'ลูกหนี้', 'การเงิน', 'ออดิต'] as const
type Tab = typeof TABS[number]

// ── Main Component ─────────────────────────────────────────────────────────
export default function CaseDetailClient({ initialCase, role, userId, canEdit }: {
  initialCase: CaseData
  role: string
  userId: string
  canEdit: boolean
}) {
  const [caseData,   setCaseData]   = useState<CaseData>(initialCase)
  const [activeTab,  setActiveTab]  = useState<Tab>('ภาพรวม')
  const [showStatus, setShowStatus] = useState(false)
  const [showCourtModal, setShowCourtModal] = useState(false)
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
          <div className="space-y-4 max-w-3xl">
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 space-y-3">
              <h3 className="font-semibold text-slate-900 dark:text-white text-[14px]">ข้อมูลทั่วไป</h3>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <Info label="เลขคดี"      value={c.caseNumber} mono />
                <Info label="ประเภท"      value={TYPE_LABELS[c.caseType]} />
                <Info label="สถานะ"       value={STATUS_LABELS[c.status]} />
                <Info label="ความเร่งด่วน" value={PRIORITY_LABELS[c.priority]} />
                {c.debtAmount != null && <Info label="มูลหนี้" value={`฿${thb(c.debtAmount)}`} />}
                {c.department  && <Info label="ฝ่าย" value={c.department} />}
                <Info label="วันเปิดคดี"   value={fmtDate(c.openedAt)} />
                {c.dueDate && <Info label="วันครบกำหนด" value={fmtDate(c.dueDate)} />}
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
                  <Stat label="งาน" value={c._count.tasks} color="text-blue-600" />
                  <Stat label="นัดศาล" value={c._count.courts} color="text-purple-600" />
                  <Stat label="เหตุการณ์" value={c.timeline.length} color="text-slate-600" />
                  <Stat label="อัปเดต" value={fmtDate(c.updatedAt)} color="text-slate-500" small />
                </div>
              </div>
            </div>

            {c.client && (
              <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4 space-y-2">
                <h3 className="font-semibold text-slate-900 dark:text-white text-[14px]">ลูกค้า (ผู้ว่าจ้าง)</h3>
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  {c.client.companyName   && <Info label="บริษัท"    value={c.client.companyName} />}
                  {c.client.clientName    && <Info label="ชื่อ"       value={c.client.clientName} />}
                  {c.client.taxId         && <Info label="เลขภาษี"    value={c.client.taxId} mono />}
                  {c.client.phone         && <Info label="โทรศัพท์"   value={c.client.phone} />}
                  {c.client.email         && <Info label="อีเมล"      value={c.client.email} />}
                  {c.client.contactPerson && <Info label="ผู้ติดต่อ"  value={c.client.contactPerson} />}
                </div>
                {c.client.address && <p className="text-[12px] text-slate-500">{c.client.address}</p>}
              </div>
            )}
          </div>
        )}

        {/* ── Timeline ────────────────────────────────── */}
        {activeTab === 'ไทม์ไลน์' && (
          <div className="max-w-2xl space-y-3">
            {/* Add comment */}
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

            {/* Timeline list */}
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
          <div className="max-w-3xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-slate-500">{c.tasks.length} งานที่เชื่อมกับคดีนี้</p>
              <Link href={`/tasks?search=${c.caseNumber}`} className="text-[12px] text-blue-600 hover:underline">ดูทั้งหมดใน Tasks →</Link>
            </div>
            {c.tasks.length === 0 ? (
              <p className="text-[13px] text-slate-400">ยังไม่มีงานที่เชื่อมกับคดีนี้</p>
            ) : c.tasks.map(t => (
              <Link key={t.id} href={`/tasks`} className="block rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm px-4 py-3 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900 dark:text-white text-[13px] truncate">{t.title}</p>
                  <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TASK_STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {t.status}
                  </span>
                </div>
                <p className="text-[12px] text-slate-400 mt-0.5">ผู้รับ: {t.assignee.name} {t.dueDate ? `· ครบ ${fmtDate(t.dueDate)}` : ''}</p>
              </Link>
            ))}
          </div>
        )}

        {/* ── Court ───────────────────────────────────── */}
        {activeTab === 'ศาล' && (
          <div className="max-w-3xl space-y-3">
            {canEdit && isActive && (
              <button onClick={() => setShowCourtModal(true)} className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-purple-500 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                เพิ่มนัดศาล
              </button>
            )}
            {c.courts.length === 0 ? (
              <p className="text-[13px] text-slate-400">ยังไม่มีนัดศาล</p>
            ) : c.courts.map(court => (
              <div key={court.id} className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-[14px]">⚖️ {court.courtName}</p>
                    <p className="text-[13px] text-slate-700 dark:text-slate-300 mt-0.5">
                      {fmtDate(court.courtDate)}{court.appointmentTime ? ` เวลา ${court.appointmentTime}` : ''}
                    </p>
                    {court.judgeName && <p className="text-[12px] text-slate-400 mt-0.5">ผู้พิพากษา: {court.judgeName}</p>}
                    {court.result   && <p className="text-[12px] text-green-600 dark:text-green-400 mt-0.5">ผล: {court.result}</p>}
                    {court.note     && <p className="text-[12px] text-slate-400 mt-1 whitespace-pre-wrap">{court.note}</p>}
                  </div>
                  {canEdit && (
                    <button onClick={async () => {
                      if (!confirm('ลบนัดศาลนี้?')) return
                      await fetch(`/api/cases/${c.id}/court/${court.id}`, { method: 'DELETE' })
                      await refetch()
                    }} className="h-7 w-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">เพิ่มโดย: {court.createdBy.name}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Documents ───────────────────────────────── */}
        {activeTab === 'เอกสาร' && (
          <div className="max-w-3xl">
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-6 text-center">
              <svg className="h-10 w-10 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              <p className="text-[13px] text-slate-500 mb-3">จัดการเอกสารคดีในระบบเอกสาร</p>
              <Link href={`/case-documents?search=${c.caseNumber}`} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-500 transition-colors">
                ดูเอกสารคดี {c.caseNumber} →
              </Link>
            </div>
          </div>
        )}

        {/* ── Debtor ──────────────────────────────────── */}
        {activeTab === 'ลูกหนี้' && (
          <div className="max-w-2xl">
            {c.debtor ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{c.debtor.fullName}</h3>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    c.debtor.riskLevel === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                    c.debtor.riskLevel === 'HIGH'     ? 'bg-orange-100 text-orange-700' :
                    c.debtor.riskLevel === 'MEDIUM'   ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    ความเสี่ยง: {c.debtor.riskLevel}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  {c.debtor.idCard    && <Info label="เลขบัตรประชาชน" value={c.debtor.idCard} mono />}
                  {c.debtor.phone     && <Info label="โทรศัพท์"       value={c.debtor.phone} />}
                  {c.debtor.email     && <Info label="อีเมล"          value={c.debtor.email} />}
                  {c.debtor.workplace && <Info label="ที่ทำงาน"       value={c.debtor.workplace} />}
                </div>
                {c.debtor.address  && <div><p className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">ที่อยู่</p><p className="text-[13px] text-slate-700 dark:text-slate-300">{c.debtor.address}</p></div>}
                {c.debtor.assetInfo && <div><p className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">ทรัพย์สิน</p><p className="text-[13px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.debtor.assetInfo}</p></div>}
                {c.debtor.note     && <div><p className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">หมายเหตุ</p><p className="text-[13px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.debtor.note}</p></div>}
              </div>
            ) : (
              <p className="text-[13px] text-slate-400">ยังไม่มีข้อมูลลูกหนี้</p>
            )}
          </div>
        )}

        {/* ── Finance ─────────────────────────────────── */}
        {activeTab === 'การเงิน' && (
          <div className="max-w-2xl">
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-6 text-center">
              <svg className="h-10 w-10 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {c.debtAmount != null && <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">฿{thb(c.debtAmount)}</p>}
              <p className="text-[13px] text-slate-500 mb-3">จัดการการเงินในระบบการเงินคดี</p>
              <Link href={`/case-finance?search=${c.caseNumber}`} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-500 transition-colors">
                ดูการเงินคดี {c.caseNumber} →
              </Link>
            </div>
          </div>
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

      {/* Court Add Modal */}
      {showCourtModal && (
        <CourtModal
          caseId={c.id}
          onClose={() => setShowCourtModal(false)}
          onSaved={async () => { setShowCourtModal(false); await refetch() }}
        />
      )}
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
      <p className={`${small ? 'text-[12px]' : 'text-xl font-bold'} ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}

function CourtModal({ caseId, onClose, onSaved }: { caseId: string; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm]     = useState({ courtName: '', courtDate: '', appointmentTime: '', judgeName: '', result: '', note: '' })
  function set(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.courtName || !form.courtDate) { setError('กรุณาระบุชื่อศาลและวันนัด'); return }
    setSaving(true); setError('')
    const res = await fetch(`/api/cases/${caseId}/court`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'เกิดข้อผิดพลาด'); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full md:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
          <h2 className="font-bold text-slate-900 dark:text-white">เพิ่มนัดศาล</h2>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ชื่อศาล <span className="text-red-500">*</span></label>
            <input value={form.courtName} onChange={e => set('courtName', e.target.value)} required className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="เช่น ศาลแพ่งกรุงเทพใต้" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">วันนัด <span className="text-red-500">*</span></label>
              <input type="date" value={form.courtDate} onChange={e => set('courtDate', e.target.value)} required className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">เวลา</label>
              <input type="time" value={form.appointmentTime} onChange={e => set('appointmentTime', e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">ผู้พิพากษา</label>
            <input value={form.judgeName} onChange={e => set('judgeName', e.target.value)} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1">หมายเหตุ</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
          </div>
          {error && <p className="text-[13px] text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 py-2.5 text-[14px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]">ยกเลิก</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-purple-600 py-2.5 text-[14px] font-semibold text-white hover:bg-purple-500 disabled:opacity-60">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
