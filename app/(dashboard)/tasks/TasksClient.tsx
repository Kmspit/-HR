'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Clock, CheckCircle, AlertCircle,
  RotateCcw, Eye, Loader2, ClipboardList,
  ExternalLink, MessageSquare,
} from 'lucide-react'
import { apiJson } from '@/lib/client-api'

// ── Types ────────────────────────────────────────────────────────────────────

type UserSnip = {
  id: string
  name: string
  department: string | null
  employeeId: string | null
  role: string
}

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
  taskLinks: string | null
  progressNotes: string | null
  assignee: UserSnip
  assignedBy: UserSnip
}

type TaskLink      = { label: string; url: string }
type ProgressNote  = { note: string; timestamp: string; userId: string; userName: string }

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

// ── Lookup maps ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING:        'รอมอบหมาย',
  IN_PROGRESS:    'กำลังทำ',
  WAITING_REVIEW: 'รอตรวจสอบ',
  REVISION:       'แก้ไขงาน',
  COMPLETED:      'เสร็จสิ้น',
  OVERDUE:        'เกินกำหนด',
}

const STATUS_CLS: Record<string, string> = {
  PENDING:        'text-slate-600  dark:text-slate-400  bg-slate-100  dark:bg-slate-500/10',
  IN_PROGRESS:    'text-blue-700   dark:text-blue-400   bg-blue-100   dark:bg-blue-500/10',
  WAITING_REVIEW: 'text-amber-700  dark:text-amber-400  bg-amber-100  dark:bg-amber-500/10',
  REVISION:       'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10',
  COMPLETED:      'text-green-700  dark:text-green-400  bg-green-100  dark:bg-green-500/10',
  OVERDUE:        'text-red-700    dark:text-red-400    bg-red-100    dark:bg-red-500/10',
}

const PRIORITY_LABEL: Record<string, string> = {
  LOW:    '⚪ ต่ำ',
  MEDIUM: '🟡 ปานกลาง',
  HIGH:   '🟠 สูง',
  URGENT: '🔴 เร่งด่วน',
}

const PRIORITY_TEXT: Record<string, string> = {
  LOW:    'text-slate-500 dark:text-slate-400',
  MEDIUM: 'text-blue-600  dark:text-blue-400',
  HIGH:   'text-amber-700 dark:text-amber-400',
  URGENT: 'text-red-700   dark:text-red-400 font-bold',
}

const TYPE_LABEL: Record<string, string> = {
  OFFICE:   'งานสำนักงาน',
  FIELD:    'งานภาคสนาม',
  LEGAL:    'งานทนาย/บังคับคดี',
  DOCUMENT: 'งานเอกสาร',
  OTHER:    'อื่นๆ',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  })
}

function isOverdue(task: Task): boolean {
  if (!task.dueDate) return false
  if (task.status === 'COMPLETED') return false
  return new Date(task.dueDate) < new Date()
}

function effectiveStatus(task: Task): string {
  return isOverdue(task) ? 'OVERDUE' : task.status
}

function parseLinks(raw: string | null): TaskLink[] {
  if (!raw) return []
  try { return JSON.parse(raw) as TaskLink[] } catch { return [] }
}

function parseNotes(raw: string | null): ProgressNote[] {
  if (!raw) return []
  try { return JSON.parse(raw) as ProgressNote[] } catch { return [] }
}

function isValidUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

// ── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const icons: Record<string, React.ReactNode> = {
    PENDING:        <Clock className="w-3 h-3" />,
    IN_PROGRESS:    <Clock className="w-3 h-3" />,
    WAITING_REVIEW: <Eye className="w-3 h-3" />,
    REVISION:       <RotateCcw className="w-3 h-3" />,
    COMPLETED:      <CheckCircle className="w-3 h-3" />,
    OVERDUE:        <AlertCircle className="w-3 h-3" />,
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CLS[status] ?? STATUS_CLS.PENDING}`}>
      {icons[status]}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── Task Detail / Action Modal ────────────────────────────────────────────────

type DetailModalProps = {
  task: Task
  role: string
  userId: string
  onClose: () => void
  onUpdated: (t: Task) => void
}

function TaskDetailModal({ task, role, userId, onClose, onUpdated }: DetailModalProps) {
  const [resultNote,     setResultNote]    = useState(task.resultNote ?? '')
  const [reviewNote,     setReviewNote]    = useState('')
  const [progressInput,  setProgressInput] = useState('')
  const [error,          setError]         = useState<string | null>(null)
  const [isPending,      startTransition]  = useTransition()

  const isAssignee  = task.assigneeId   === userId
  const isAssigner  = task.assignedById === userId
  const isFullAdmin = ['SUPER_ADMIN','CEO','MANAGER_HR','HR'].includes(role)
  const isReviewer  = ['SUPER_ADMIN','CEO','MANAGER_HR','HR','ADMIN','MANAGER','TEAM_LEADER'].includes(role)
                       && (isAssigner || isFullAdmin)

  const canAct    = isAssignee || isReviewer || isFullAdmin
  const links     = parseLinks(task.taskLinks)
  const noteHist  = parseNotes(task.progressNotes)
  const eff       = effectiveStatus(task)

  function patch(body: Record<string, unknown>) {
    setError(null)
    startTransition(async () => {
      const { ok, data } = await apiJson<{ task: Task; error?: string }>(`/api/tasks/${task.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!ok || data.error) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      onUpdated(data.task)
    })
  }

  function handleAddNote() {
    if (!progressInput.trim()) return
    patch({ progressNote: progressInput.trim() })
    setProgressInput('')
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal className="fixed z-50 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4">
        <div
          className="relative w-full md:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[88vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-start justify-between gap-3 px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-snug">{task.title}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{TYPE_LABEL[task.type]} · สร้างเมื่อ {fmtDate(task.createdAt)}</p>
            </div>
            <button type="button" onClick={onClose}
              className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

            {/* Status + priority */}
            <div className="flex flex-wrap gap-2 items-center">
              <StatusBadge status={eff} />
              <span className={`text-[12px] font-medium ${PRIORITY_TEXT[task.priority] ?? 'text-slate-500'}`}>
                {PRIORITY_LABEL[task.priority] ?? task.priority}
              </span>
            </div>

            {/* Info rows */}
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] divide-y divide-slate-100 dark:divide-white/[0.04]">
              {([
                ['ผู้รับผิดชอบ', task.assignee.name],
                ['มอบหมายโดย',  task.assignedBy.name],
                ['แผนก',        task.assignee.department ?? '—'],
                ['ประเภทงาน',   TYPE_LABEL[task.type]],
                ['วันเริ่ม',    fmtDate(task.startDate)],
                ['ครบกำหนด',   task.dueDate ? `${fmtDate(task.dueDate)}${isOverdue(task) ? '  ⚠️' : ''}` : '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex gap-3 px-4 py-2.5">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 w-28 flex-shrink-0">{label}</span>
                  <span className={`text-[13px] font-medium flex-1 ${label === 'ครบกำหนด' && isOverdue(task) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Links */}
            {links.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">ลิงก์ที่เกี่ยวข้อง</p>
                <div className="space-y-1.5">
                  {links.map((lk, i) => (
                    <a
                      key={i}
                      href={lk.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors group"
                    >
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-60 group-hover:opacity-100" />
                      <span className="flex-1 truncate">{lk.label || lk.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {task.description && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">รายละเอียด</p>
                <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{task.description}</p>
              </div>
            )}

            {task.notes && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">บันทึก</p>
                <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed">{task.notes}</p>
              </div>
            )}

            {/* Review note (revision request) */}
            {task.reviewNote && (
              <div className="rounded-xl bg-orange-50 dark:bg-orange-500/[0.07] border border-orange-100 dark:border-orange-500/15 px-4 py-3">
                <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide mb-1">หมายเหตุจากผู้ตรวจ</p>
                <p className="text-[13px] text-orange-800 dark:text-orange-300">{task.reviewNote}</p>
              </div>
            )}

            {/* Submitted result */}
            {task.resultNote && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-500/[0.07] border border-blue-100 dark:border-blue-500/15 px-4 py-3">
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">ผลงานที่ส่ง</p>
                <p className="text-[13px] text-blue-800 dark:text-blue-300">{task.resultNote}</p>
                {task.submittedAt && (
                  <p className="text-[10px] text-blue-500 dark:text-blue-400/60 mt-1">ส่งเมื่อ {fmtDate(task.submittedAt)}</p>
                )}
              </div>
            )}

            {/* Progress notes history */}
            {noteHist.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" />
                  ประวัติการอัปเดต
                </p>
                <div className="space-y-2">
                  {noteHist.map((n, i) => (
                    <div key={i} className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{n.userName}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">{fmtDateTime(n.timestamp)}</span>
                      </div>
                      <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{n.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add progress note (anyone who can act) */}
            {canAct && task.status !== 'COMPLETED' && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">เพิ่มบันทึก</p>
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={progressInput}
                    onChange={(e) => setProgressInput(e.target.value)}
                    placeholder="บันทึกความคืบหน้า..."
                    className="flex-1 rounded-xl px-3 py-2 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-400/60"
                  />
                  <button
                    type="button"
                    disabled={isPending || !progressInput.trim()}
                    onClick={handleAddNote}
                    className="flex-shrink-0 self-end flex items-center justify-center rounded-xl px-3 py-2 text-[12px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition-colors disabled:opacity-40"
                  >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'บันทึก'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-xl text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2">
                {error}
              </p>
            )}

            {/* ── Employee actions ── */}
            {isAssignee && task.status !== 'COMPLETED' && (
              <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-1">อัปเดตงาน</p>

                {task.status === 'PENDING' && (
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'IN_PROGRESS' })}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    เริ่มทำงาน
                  </button>
                )}

                {(task.status === 'IN_PROGRESS' || task.status === 'REVISION') && (
                  <div className="space-y-2">
                    <textarea rows={3} value={resultNote} onChange={(e) => setResultNote(e.target.value)}
                      placeholder="รายละเอียดผลงาน / สิ่งที่ทำเสร็จแล้ว..."
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-400/60" />
                    <button type="button" disabled={isPending} onClick={() => patch({ status: 'WAITING_REVIEW', resultNote })}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/25 hover:bg-amber-100 dark:hover:bg-amber-500/25 transition-colors disabled:opacity-50">
                      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      ส่งงานเพื่อตรวจสอบ
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Reviewer actions ── */}
            {isReviewer && task.status === 'WAITING_REVIEW' && (
              <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-1">ตรวจงาน</p>
                <textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="หมายเหตุ (ไม่บังคับ)..."
                  className="w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-400/60" />
                <div className="flex gap-2">
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'COMPLETED', reviewNote })}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/25 hover:bg-green-100 dark:hover:bg-green-500/25 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    อนุมัติ
                  </button>
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'REVISION', reviewNote })}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/25 hover:bg-orange-100 dark:hover:bg-orange-500/25 transition-colors disabled:opacity-50">
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

type CreateModalProps = {
  employees: UserSnip[]
  assignerName: string
  onClose: () => void
  onCreated: (t: Task) => void
}

function CreateTaskModal({ employees, assignerName, onClose, onCreated }: CreateModalProps) {
  const [isPending, startTransition] = useTransition()
  const [title,       setTitle]       = useState('')
  const [description, setDesc]        = useState('')
  const [type,        setType]        = useState('OFFICE')
  const [priority,    setPriority]    = useState('MEDIUM')
  const [assigneeId,  setAssignee]    = useState('')
  const [startDate,   setStart]       = useState('')
  const [dueDate,     setDue]         = useState('')
  const [notes,       setNotes]       = useState('')
  const [links,       setLinks]       = useState<TaskLink[]>([])
  const [error,       setError]       = useState<string | null>(null)

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-400/60'

  function addLink() {
    setLinks((prev) => [...prev, { label: '', url: '' }])
  }

  function updateLink(i: number, field: keyof TaskLink, val: string) {
    setLinks((prev) => prev.map((lk, idx) => idx === i ? { ...lk, [field]: val } : lk))
  }

  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim())  { setError('กรุณาระบุชื่องาน'); return }
    if (!assigneeId)    { setError('กรุณาเลือกผู้รับผิดชอบ'); return }
    if (!dueDate)       { setError('กรุณาระบุวันครบกำหนด'); return }

    const cleanLinks = links.filter((l) => l.url.trim())
    for (const lk of cleanLinks) {
      if (!isValidUrl(lk.url.trim())) {
        setError(`URL ไม่ถูกต้อง: ${lk.url} (ต้องขึ้นต้นด้วย http:// หรือ https://)`)
        return
      }
    }

    setError(null)

    startTransition(async () => {
      const { ok, data } = await apiJson<{ task: Task; error?: string }>('/api/tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          type,
          priority,
          assigneeId,
          startDate: startDate || null,
          dueDate,
          notes: notes.trim() || null,
          taskLinks: cleanLinks.length > 0 ? cleanLinks : undefined,
        }),
      })
      if (!ok || data.error) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      onCreated(data.task)
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal className="fixed z-50 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4">
        <div
          className="relative w-full md:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[90vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">สร้างงานใหม่</h2>
            <button type="button" onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 py-4 space-y-4">

              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">
                  ชื่องาน <span className="text-red-500">*</span>
                </label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="ระบุชื่องาน..." className={inputCls} />
              </div>

              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">รายละเอียดงาน</label>
                <textarea rows={3} value={description} onChange={(e) => setDesc(e.target.value)}
                  placeholder="อธิบายรายละเอียดงาน..." className={`${inputCls} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ประเภทงาน</label>
                  <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                    <option value="OFFICE">งานสำนักงาน</option>
                    <option value="FIELD">งานภาคสนาม</option>
                    <option value="LEGAL">งานทนาย/บังคับคดี</option>
                    <option value="DOCUMENT">งานเอกสาร</option>
                    <option value="OTHER">อื่นๆ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">
                    ความสำคัญ <span className="text-red-500">*</span>
                  </label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                    <option value="LOW">⚪ ต่ำ</option>
                    <option value="MEDIUM">🟡 ปานกลาง</option>
                    <option value="HIGH">🟠 สูง</option>
                    <option value="URGENT">🔴 เร่งด่วน</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">
                  ผู้รับผิดชอบ <span className="text-red-500">*</span>
                </label>
                <select value={assigneeId} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
                  <option value="">เลือกพนักงาน...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}{emp.department ? ` — ${emp.department}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ผู้มอบหมาย</label>
                <div className={`${inputCls} text-slate-400 dark:text-slate-500 cursor-not-allowed`}>{assignerName}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">วันเริ่มงาน</label>
                  <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">
                    วันครบกำหนด <span className="text-red-500">*</span>
                  </label>
                  <input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">หมายเหตุ</label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="หมายเหตุเพิ่มเติม..." className={`${inputCls} resize-none`} />
              </div>

              {/* Links section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] text-slate-500 dark:text-slate-400">ลิงก์ที่เกี่ยวข้อง</label>
                  <button type="button" onClick={addLink}
                    className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มลิงก์
                  </button>
                </div>
                {links.length > 0 && (
                  <div className="space-y-2">
                    {links.map((lk, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1.5">
                          <input
                            type="text"
                            value={lk.label}
                            onChange={(e) => updateLink(i, 'label', e.target.value)}
                            placeholder="ชื่อลิงก์ (ไม่บังคับ)"
                            className={inputCls}
                          />
                          <input
                            type="url"
                            value={lk.url}
                            onChange={(e) => updateLink(i, 'url', e.target.value)}
                            placeholder="https://..."
                            className={inputCls}
                          />
                        </div>
                        <button type="button" onClick={() => removeLink(i)}
                          className="flex-shrink-0 mt-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p className="rounded-xl text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Sticky footer */}
            <div className="sticky bottom-0 px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-slate-900">
              <button type="submit" disabled={isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white shadow-sm transition-all disabled:opacity-50"
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

// ── Stat strip ────────────────────────────────────────────────────────────────

function StatStrip({ tasks }: { tasks: Task[] }) {
  const s = useMemo(() => ({
    total:    tasks.length,
    progress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    review:   tasks.filter((t) => t.status === 'WAITING_REVIEW').length,
    done:     tasks.filter((t) => t.status === 'COMPLETED').length,
    overdue:  tasks.filter(isOverdue).length,
  }), [tasks])

  const cells = [
    { label: 'ทั้งหมด',    val: s.total,    icon: <ClipboardList className="w-4 h-4" />, color: 'text-slate-700 dark:text-slate-200',  bg: 'bg-white dark:bg-slate-900/60',     border: 'border-slate-200 dark:border-white/[0.07]' },
    { label: 'กำลังทำ',    val: s.progress, icon: <Clock         className="w-4 h-4" />, color: 'text-blue-700  dark:text-blue-400',   bg: 'bg-blue-50   dark:bg-blue-500/10',  border: 'border-blue-200  dark:border-blue-500/20'  },
    { label: 'รอตรวจ',     val: s.review,   icon: <Eye           className="w-4 h-4" />, color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-50  dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
    { label: 'เสร็จสิ้น',  val: s.done,     icon: <CheckCircle   className="w-4 h-4" />, color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50  dark:bg-green-500/10', border: 'border-green-200 dark:border-green-500/20' },
    { label: 'เกินกำหนด',  val: s.overdue,  icon: <AlertCircle   className="w-4 h-4" />, color: 'text-red-700   dark:text-red-400',    bg: 'bg-red-50    dark:bg-red-500/10',   border: 'border-red-200   dark:border-red-500/20'   },
  ]

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {cells.map(({ label, val, icon, color, bg, border }) => (
        <div key={label} className={`rounded-2xl p-3 border shadow-sm ${bg} ${border}`}>
          <div className={`mb-1 ${color} opacity-60`}>{icon}</div>
          <p className={`text-xl font-bold ${color}`}>{val}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Task table row ────────────────────────────────────────────────────────────

function TaskRow({
  task,
  showAssignee,
  showAssigner,
  onClick,
}: {
  task: Task
  showAssignee: boolean
  showAssigner: boolean
  onClick: () => void
}) {
  const eff    = effectiveStatus(task)
  const overdue = isOverdue(task)

  return (
    <tr
      onClick={onClick}
      className={`border-b border-slate-100 dark:border-white/[0.04] hover:bg-blue-50/60 dark:hover:bg-white/[0.03] transition-colors cursor-pointer ${overdue ? 'bg-red-50/40 dark:bg-red-500/[0.03]' : ''}`}
    >
      {/* Title */}
      <td className="px-4 py-3">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug max-w-[200px] truncate">
          {task.title}
        </p>
        {task.description && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[200px]">{task.description}</p>
        )}
      </td>

      {/* ประเภทงาน */}
      <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
        <span className="text-[12px] text-slate-500 dark:text-slate-400">
          {TYPE_LABEL[task.type] ?? task.type}
        </span>
      </td>

      {/* Assignee / Assigner */}
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-[13px] text-slate-700 dark:text-slate-300">
          {showAssignee ? task.assignee.name : showAssigner ? task.assignedBy.name : task.assignee.name}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {task.assignee.department ?? ''}
        </p>
      </td>

      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={eff} />
      </td>

      {/* Priority */}
      <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
        <span className={`text-[12px] font-medium ${PRIORITY_TEXT[task.priority] ?? 'text-slate-500'}`}>
          {PRIORITY_LABEL[task.priority] ?? task.priority}
        </span>
      </td>

      {/* Due date */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`text-[12px] ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
          {fmtDate(task.dueDate)}
        </span>
      </td>

      {/* Chevron */}
      <td className="px-3 py-3 text-slate-300 dark:text-slate-600 text-[10px]">›</td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TasksClient({
  role,
  userId,
  userName,
  myTasks:            initMy,
  assignedByMeTasks:  initByMe,
  allTasks:           initAll,
  employees,
  canAssign,
  canSeeAll,
}: Props) {
  const router = useRouter()

  type TabId = 'my' | 'by_me' | 'all'

  const [tab,         setTab]      = useState<TabId>('my')
  const [filter,      setFilter]   = useState('all')
  const [myTasks,     setMyTasks]  = useState<Task[]>(initMy)
  const [byMeTasks,   setByMe]     = useState<Task[]>(initByMe)
  const [allList,     setAll]      = useState<Task[]>(initAll)
  const [showCreate,  setCreate]   = useState(false)
  const [selected,    setSelected] = useState<Task | null>(null)

  const currentList = tab === 'my' ? myTasks : tab === 'by_me' ? byMeTasks : allList

  const filtered = useMemo(() => {
    if (filter === 'all')    return currentList
    if (filter === 'overdue') return currentList.filter(isOverdue)
    return currentList.filter((t) => t.status === filter)
  }, [currentList, filter])

  function applyUpdate(updated: Task) {
    const apply = (list: Task[]) => list.map((t) => (t.id === updated.id ? updated : t))
    setMyTasks(apply)
    setByMe(apply)
    setAll(apply)
    setSelected(updated)
    router.refresh()
  }

  function handleCreated(task: Task) {
    setByMe((p) => [task, ...p])
    setAll((p)   => [task, ...p])
    if (task.assigneeId === userId) setMyTasks((p) => [task, ...p])
    setCreate(false)
    router.refresh()
  }

  const tabs = [
    { id: 'my'    as TabId, label: 'งานของฉัน',     count: myTasks.length,   show: true },
    { id: 'by_me' as TabId, label: 'มอบหมายโดยฉัน', count: byMeTasks.length, show: canAssign },
    { id: 'all'   as TabId, label: 'ทุกงาน',        count: allList.length,   show: canSeeAll },
  ].filter((t) => t.show)

  const FILTERS = [
    { id: 'all',             label: 'ทั้งหมด' },
    { id: 'PENDING',         label: 'รอมอบหมาย' },
    { id: 'IN_PROGRESS',     label: 'กำลังทำ' },
    { id: 'WAITING_REVIEW',  label: 'รอตรวจ' },
    { id: 'REVISION',        label: 'แก้ไข' },
    { id: 'COMPLETED',       label: 'เสร็จ' },
    { id: 'overdue',         label: '⚠️ เกินกำหนด' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 dark:text-white">มอบหมายงาน</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">จัดการ ติดตาม และมอบหมายงานพนักงาน</p>
        </div>
        {canAssign && (
          <button type="button" onClick={() => setCreate(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">สร้างงาน</span>
            <span className="sm:hidden">สร้าง</span>
          </button>
        )}
      </div>

      {/* Stat strip */}
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

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
              filter === id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">รายการงาน</h2>
          <span className="text-[12px] text-slate-400">{filtered.length} รายการ</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400">ยังไม่มีงาน</p>
            {canAssign && filter === 'all' && (
              <button type="button" onClick={() => setCreate(true)}
                className="mt-2 text-[13px] text-blue-600 dark:text-blue-400 hover:underline">
                + สร้างงานใหม่
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.05]">
                  {[
                    { label: 'ชื่องาน',                                          cls: '' },
                    { label: 'ประเภทงาน',                                        cls: 'hidden sm:table-cell' },
                    { label: tab === 'my' ? 'มอบหมายโดย' : 'ผู้รับผิดชอบ',      cls: '' },
                    { label: 'สถานะ',                                            cls: '' },
                    { label: 'ความสำคัญ',                                        cls: 'hidden md:table-cell' },
                    { label: 'กำหนดส่ง',                                         cls: '' },
                    { label: '',                                                  cls: '' },
                  ].map(({ label, cls }) => (
                    <th key={label} className={`text-left px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${cls}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    showAssignee={tab === 'by_me' || tab === 'all'}
                    showAssigner={tab === 'my'}
                    onClick={() => setSelected(task)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {selected && (
        <TaskDetailModal
          task={selected}
          role={role}
          userId={userId}
          onClose={() => setSelected(null)}
          onUpdated={applyUpdate}
        />
      )}
      {showCreate && (
        <CreateTaskModal
          employees={employees}
          assignerName={userName}
          onClose={() => setCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
