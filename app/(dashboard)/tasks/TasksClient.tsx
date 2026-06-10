'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, ChevronDown, ChevronUp, Clock, CheckCircle, AlertCircle, RotateCcw, Loader2, Eye } from 'lucide-react'
import { apiJson } from '@/lib/client-api'

// ── Types ───────────────────────────────────────────────────────────────────

type UserSnip = { id: string; name: string; department: string | null; employeeId: string | null; role: string }

type Task = {
  id: string
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  assigneeId: string
  assignedById: string
  startDate: string | null
  dueDate: string | null
  notes: string | null
  resultNote: string | null
  resultUrl: string | null
  submittedAt: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  assignee: UserSnip
  assignedBy: UserSnip
}

type Props = {
  role: string
  userId: string
  userName: string
  myTasks: Task[]
  assignedByMeTasks: Task[]
  allTasks: Task[]
  employees: UserSnip[]
  canAssign: boolean
  canSeeAll: boolean
}

// ── Label maps ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING:        'รอมอบหมาย',
  IN_PROGRESS:    'กำลังทำ',
  WAITING_REVIEW: 'รอตรวจสอบ',
  REVISION:       'แก้ไขงาน',
  COMPLETED:      'เสร็จสิ้น',
  OVERDUE:        'เกินกำหนด',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING:        'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-500/10',
  IN_PROGRESS:    'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10',
  WAITING_REVIEW: 'text-amber-700 dark:text-yellow-400 bg-amber-100 dark:bg-yellow-500/10',
  REVISION:       'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10',
  COMPLETED:      'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-500/10',
  OVERDUE:        'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/10',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING:        <Clock className="w-3 h-3" />,
  IN_PROGRESS:    <Clock className="w-3 h-3" />,
  WAITING_REVIEW: <Eye className="w-3 h-3" />,
  REVISION:       <RotateCcw className="w-3 h-3" />,
  COMPLETED:      <CheckCircle className="w-3 h-3" />,
  OVERDUE:        <AlertCircle className="w-3 h-3" />,
}

const PRIORITY_LABEL: Record<string, string> = {
  LOW:    'ต่ำ',
  MEDIUM: 'ปานกลาง',
  HIGH:   'สูง',
  URGENT: 'เร่งด่วน',
}

const PRIORITY_COLOR: Record<string, string> = {
  LOW:    'text-slate-500 dark:text-slate-400',
  MEDIUM: 'text-blue-600 dark:text-blue-400',
  HIGH:   'text-amber-700 dark:text-amber-400',
  URGENT: 'text-red-700 dark:text-red-500 font-bold',
}

const TYPE_LABEL: Record<string, string> = {
  OFFICE:   'งานสำนักงาน',
  FIELD:    'งานภาคสนาม',
  LEGAL:    'งานทนาย/บังคับคดี',
  DOCUMENT: 'งานเอกสาร',
  OTHER:    'อื่นๆ',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' })
}

function isOverdue(task: Task) {
  if (!task.dueDate) return false
  if (['COMPLETED'].includes(task.status)) return false
  return new Date(task.dueDate) < new Date()
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[status] ?? STATUS_COLOR.PENDING}`}>
      {STATUS_ICON[status]}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function PriorityDot({ priority }: { priority: string }) {
  return (
    <span className={`text-[11px] font-medium ${PRIORITY_COLOR[priority] ?? 'text-slate-500'}`}>
      {priority === 'URGENT' ? '🔴' : priority === 'HIGH' ? '🟠' : priority === 'MEDIUM' ? '🟡' : '⚪'} {PRIORITY_LABEL[priority] ?? priority}
    </span>
  )
}

function TaskCard({
  task,
  showAssignee = false,
  showAssigner = false,
  onOpen,
}: {
  task: Task
  showAssignee?: boolean
  showAssigner?: boolean
  onOpen: (t: Task) => void
}) {
  const overdue = isOverdue(task)

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className={`w-full text-left rounded-2xl p-4 border transition-all hover:-translate-y-0.5 hover:shadow-md group ${
        overdue
          ? 'bg-red-50 dark:bg-red-500/[0.05] border-red-200 dark:border-red-500/20'
          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/[0.07] shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-[14px] font-semibold text-slate-900 dark:text-white leading-snug flex-1">{task.title}</p>
        <StatusBadge status={overdue && task.status !== 'COMPLETED' ? 'OVERDUE' : task.status} />
      </div>

      {task.description && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">{task.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span>{TYPE_LABEL[task.type] ?? task.type}</span>
        <PriorityDot priority={task.priority} />
        {task.dueDate && (
          <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
            ครบกำหนด {fmt(task.dueDate)}
          </span>
        )}
        {showAssignee && (
          <span>→ <span className="font-medium text-slate-700 dark:text-slate-300">{task.assignee.name}</span></span>
        )}
        {showAssigner && (
          <span>โดย <span className="font-medium text-slate-700 dark:text-slate-300">{task.assignedBy.name}</span></span>
        )}
      </div>

      {task.reviewNote && task.status === 'REVISION' && (
        <p className="mt-2 text-[11px] text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 rounded-lg px-2.5 py-1.5">
          หมายเหตุแก้ไข: {task.reviewNote}
        </p>
      )}
    </button>
  )
}

// ── Task Detail / Action Modal ───────────────────────────────────────────────

function TaskModal({
  task,
  role,
  userId,
  onClose,
  onUpdated,
}: {
  task: Task
  role: string
  userId: string
  onClose: () => void
  onUpdated: (t: Task) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [resultNote, setResultNote]  = useState(task.resultNote ?? '')
  const [reviewNote, setReviewNote]  = useState('')
  const [error, setError]            = useState<string | null>(null)

  const isAssignee   = task.assigneeId   === userId
  const isAssigner   = task.assignedById === userId
  const isFullAdmin  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR'].includes(role)
  const isReviewer   = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(role)
    && (isAssigner || isFullAdmin)

  const overdue = isOverdue(task)

  const patch = (body: Record<string, unknown>) => {
    setError(null)
    startTransition(async () => {
      const { ok, data } = await apiJson<{ task: Task; error?: string }>(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!ok || data.error) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      onUpdated(data.task)
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog" aria-modal
        className="fixed z-50 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4"
      >
        <div
          className="relative w-full md:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[90vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-start justify-between gap-3 px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-tight">{task.title}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{TYPE_LABEL[task.type]} · สร้างเมื่อ {fmt(task.createdAt)}</p>
            </div>
            <button type="button" onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07] flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
            {/* Status / priority row */}
            <div className="flex flex-wrap gap-2 items-center">
              <StatusBadge status={overdue && task.status !== 'COMPLETED' ? 'OVERDUE' : task.status} />
              <PriorityDot priority={task.priority} />
            </div>

            {/* Details */}
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-4 py-1">
              {[
                ['ผู้รับผิดชอบ', task.assignee.name],
                ['มอบหมายโดย', task.assignedBy.name],
                ['แผนก', task.assignee.department ?? '—'],
                ['ประเภท', TYPE_LABEL[task.type]],
                ['วันเริ่ม', fmt(task.startDate)],
                ['ครบกำหนด', task.dueDate ? `${fmt(task.dueDate)}${overdue ? ' ⚠️ เกินกำหนด' : ''}` : '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-3 py-2.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 w-28 flex-shrink-0">{label}</span>
                  <span className={`text-[13px] font-medium flex-1 ${overdue && label === 'ครบกำหนด' ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>{val}</span>
                </div>
              ))}
            </div>

            {task.description && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">รายละเอียด</p>
                <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed">{task.description}</p>
              </div>
            )}

            {task.notes && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">บันทึก</p>
                <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed">{task.notes}</p>
              </div>
            )}

            {task.reviewNote && (
              <div className="rounded-xl bg-orange-50 dark:bg-orange-500/[0.07] border border-orange-100 dark:border-orange-500/15 px-4 py-3">
                <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide mb-1">หมายเหตุจากผู้ตรวจ</p>
                <p className="text-[13px] text-orange-800 dark:text-orange-300">{task.reviewNote}</p>
              </div>
            )}

            {task.resultNote && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-500/[0.07] border border-blue-100 dark:border-blue-500/15 px-4 py-3">
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">ผลงานที่ส่ง</p>
                <p className="text-[13px] text-blue-800 dark:text-blue-300">{task.resultNote}</p>
                {task.submittedAt && <p className="text-[10px] text-blue-600 dark:text-blue-400/70 mt-1">ส่งเมื่อ {fmt(task.submittedAt)}</p>}
              </div>
            )}

            {error && (
              <p className="text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            {/* ── Employee actions ── */}
            {isAssignee && !['COMPLETED'].includes(task.status) && (
              <div className="space-y-3 pt-1">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">อัปเดตงาน</p>

                {task.status === 'PENDING' && (
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'IN_PROGRESS' })}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-200 dark:hover:bg-blue-500/25 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    เริ่มทำงาน
                  </button>
                )}

                {['IN_PROGRESS', 'REVISION'].includes(task.status) && (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={resultNote}
                      onChange={(e) => setResultNote(e.target.value)}
                      placeholder="รายละเอียดผลงาน / สิ่งที่ทำ..."
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-500/50"
                    />
                    <button type="button" disabled={isPending} onClick={() => patch({ status: 'WAITING_REVIEW', resultNote })}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/25 hover:bg-amber-200 dark:hover:bg-amber-500/25 transition-colors disabled:opacity-50">
                      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      ส่งงานเพื่อตรวจสอบ
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Reviewer actions ── */}
            {isReviewer && task.status === 'WAITING_REVIEW' && (
              <div className="space-y-3 pt-1">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">ตรวจงาน</p>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="หมายเหตุ (ไม่บังคับ)..."
                  className="w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-500/50"
                />
                <div className="flex gap-2">
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'COMPLETED', reviewNote })}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-500/15 border border-green-300 dark:border-green-500/25 hover:bg-green-200 dark:hover:bg-green-500/25 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    อนุมัติ
                  </button>
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'REVISION', reviewNote })}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-500/15 border border-orange-300 dark:border-orange-500/25 hover:bg-orange-200 dark:hover:bg-orange-500/25 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    ขอแก้ไข
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <button type="button" onClick={onClose}
              className="w-full rounded-xl py-3 text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors">
              ปิด
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Create Task Modal ────────────────────────────────────────────────────────

function CreateTaskModal({
  employees,
  assignerName,
  onClose,
  onCreated,
}: {
  employees: UserSnip[]
  assignerName: string
  onClose: () => void
  onCreated: (t: Task) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    title: '', description: '', type: 'OFFICE', priority: 'MEDIUM',
    assigneeId: '', startDate: '', dueDate: '', notes: '',
  })
  const [error, setError] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('กรุณาระบุชื่องาน'); return }
    if (!form.assigneeId)   { setError('กรุณาเลือกผู้รับผิดชอบ'); return }
    setError(null)

    startTransition(async () => {
      const { ok, data } = await apiJson<{ task: Task; error?: string }>('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          startDate: form.startDate || null,
          dueDate:   form.dueDate   || null,
        }),
      })
      if (!ok || data.error) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      onCreated(data.task)
    })
  }

  const inputCls = "w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog" aria-modal
        className="fixed z-50 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4"
      >
        <div
          className="relative w-full md:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[90vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">มอบหมายงานใหม่</h2>
            <button type="button" onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={submit} className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 py-4 space-y-4">

              {/* Title */}
              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ชื่องาน <span className="text-red-500">*</span></label>
                <input type="text" required value={form.title} onChange={(e) => set('title', e.target.value)}
                  placeholder="ระบุชื่องาน..." className={inputCls} />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">รายละเอียดงาน</label>
                <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
                  placeholder="อธิบายรายละเอียดงาน..." className={`${inputCls} resize-none`} />
              </div>

              {/* Type + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ประเภทงาน</label>
                  <select value={form.type} onChange={(e) => set('type', e.target.value)} className={inputCls}>
                    <option value="OFFICE">งานสำนักงาน</option>
                    <option value="FIELD">งานภาคสนาม</option>
                    <option value="LEGAL">งานทนาย/บังคับคดี</option>
                    <option value="DOCUMENT">งานเอกสาร</option>
                    <option value="OTHER">อื่นๆ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ความสำคัญ</label>
                  <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={inputCls}>
                    <option value="LOW">⚪ ต่ำ</option>
                    <option value="MEDIUM">🟡 ปานกลาง</option>
                    <option value="HIGH">🟠 สูง</option>
                    <option value="URGENT">🔴 เร่งด่วน</option>
                  </select>
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ผู้รับผิดชอบ <span className="text-red-500">*</span></label>
                <select required value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)} className={inputCls}>
                  <option value="">เลือกพนักงาน...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}{emp.department ? ` (${emp.department})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigner (read-only display) */}
              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ผู้มอบหมาย</label>
                <div className={`${inputCls} text-slate-500 dark:text-slate-400 cursor-not-allowed`}>{assignerName}</div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">วันเริ่ม</label>
                  <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ครบกำหนด</label>
                  <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">บันทึก</label>
                <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)}
                  placeholder="บันทึกเพิ่มเติม..." className={`${inputCls} resize-none`} />
              </div>

              {error && (
                <p className="text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="sticky bottom-0 px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-slate-900">
              <button type="submit" disabled={isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                มอบหมายงาน
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

// ── Summary stats strip ──────────────────────────────────────────────────────

function StatStrip({ tasks }: { tasks: Task[] }) {
  const counts = useMemo(() => ({
    pending:        tasks.filter((t) => t.status === 'PENDING').length,
    in_progress:    tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    waiting_review: tasks.filter((t) => t.status === 'WAITING_REVIEW').length,
    revision:       tasks.filter((t) => t.status === 'REVISION').length,
    overdue:        tasks.filter((t) => isOverdue(t)).length,
    completed:      tasks.filter((t) => t.status === 'COMPLETED').length,
  }), [tasks])

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {[
        { label: 'รอมอบหมาย',   val: counts.pending,        color: 'text-slate-600 dark:text-slate-400' },
        { label: 'กำลังทำ',     val: counts.in_progress,    color: 'text-blue-700 dark:text-blue-400' },
        { label: 'รอตรวจ',      val: counts.waiting_review, color: 'text-amber-700 dark:text-amber-400' },
        { label: 'แก้ไข',       val: counts.revision,       color: 'text-orange-700 dark:text-orange-400' },
        { label: 'เกินกำหนด',   val: counts.overdue,        color: 'text-red-700 dark:text-red-400' },
        { label: 'เสร็จสิ้น',   val: counts.completed,      color: 'text-green-700 dark:text-green-400' },
      ].map(({ label, val, color }) => (
        <div key={label} className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm p-3 text-center">
          <p className={`text-xl font-bold ${color}`}>{val}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TasksClient({
  role, userId, userName,
  myTasks: initMy, assignedByMeTasks: initByMe, allTasks: initAll,
  employees, canAssign, canSeeAll,
}: Props) {
  const router = useRouter()

  type TabType = 'my' | 'by_me' | 'all'
  const [tab, setTab]             = useState<TabType>('my')
  const [statusFilter, setFilter] = useState<string>('all')
  const [myTasks, setMyTasks]     = useState<Task[]>(initMy)
  const [byMeTasks, setByMe]      = useState<Task[]>(initByMe)
  const [allTasksList, setAll]    = useState<Task[]>(initAll)
  const [showCreate, setCreate]   = useState(false)
  const [selected, setSelected]   = useState<Task | null>(null)

  // Current task list based on tab
  const currentList = tab === 'my' ? myTasks : tab === 'by_me' ? byMeTasks : allTasksList

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return currentList
    if (statusFilter === 'overdue') return currentList.filter(isOverdue)
    return currentList.filter((t) => t.status === statusFilter)
  }, [currentList, statusFilter])

  const updateTask = (updated: Task) => {
    const patch = (list: Task[]) => list.map((t) => t.id === updated.id ? updated : t)
    setMyTasks(patch)
    setByMe(patch)
    setAll(patch)
    setSelected(updated)
  }

  const addTask = (task: Task) => {
    setByMe((prev) => [task, ...prev])
    setAll((prev) => [task, ...prev])
    setCreate(false)
    // If assigning to myself, also add to myTasks
    if (task.assigneeId === userId) setMyTasks((prev) => [task, ...prev])
  }

  const tabs: { id: TabType; label: string; count: number; show: boolean }[] = [
    { id: 'my',    label: 'งานของฉัน',   count: myTasks.length,    show: true },
    { id: 'by_me', label: 'มอบหมายโดยฉัน', count: byMeTasks.length, show: canAssign },
    { id: 'all',   label: 'ทุกงาน',      count: allTasksList.length, show: canSeeAll },
  ].filter((t) => t.show)

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 dark:text-white">มอบหมายงาน</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">ระบบติดตามงานและความคืบหน้า</p>
        </div>
        {canAssign && (
          <button type="button" onClick={() => setCreate(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">มอบหมายงาน</span>
            <span className="sm:hidden">สร้าง</span>
          </button>
        )}
      </div>

      {/* Stats strip */}
      <StatStrip tasks={currentList} />

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/[0.05]">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => { setTab(t.id); setFilter('all') }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}>
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.id ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all',            label: 'ทั้งหมด' },
          { id: 'PENDING',        label: 'รอมอบหมาย' },
          { id: 'IN_PROGRESS',    label: 'กำลังทำ' },
          { id: 'WAITING_REVIEW', label: 'รอตรวจ' },
          { id: 'REVISION',       label: 'แก้ไข' },
          { id: 'COMPLETED',      label: 'เสร็จ' },
          { id: 'overdue',        label: '⚠️ เกินกำหนด' },
        ].map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
              statusFilter === id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl py-16 text-center bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.05]">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-slate-500 dark:text-slate-400 text-[14px]">ไม่มีงานในหมวดนี้</p>
          {canAssign && tab === 'my' && (
            <button type="button" onClick={() => setCreate(true)}
              className="mt-3 text-[13px] text-blue-600 dark:text-blue-400 hover:underline">
              + มอบหมายงานใหม่
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showAssignee={tab === 'by_me' || tab === 'all'}
              showAssigner={tab === 'my'}
              onOpen={setSelected}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {selected && (
        <TaskModal
          task={selected}
          role={role}
          userId={userId}
          onClose={() => setSelected(null)}
          onUpdated={(t) => { updateTask(t); router.refresh() }}
        />
      )}
      {showCreate && (
        <CreateTaskModal
          employees={employees}
          assignerName={userName}
          onClose={() => setCreate(false)}
          onCreated={addTask}
        />
      )}
    </div>
  )
}
