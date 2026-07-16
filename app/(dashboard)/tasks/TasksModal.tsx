'use client'

import { useState, useTransition, useEffect, type FocusEvent } from 'react'
import {
  Plus, X, Clock, CheckCircle, AlertCircle,
  RotateCcw, Eye, Loader2, ClipboardList,
  ExternalLink, MessageSquare, Paperclip, Upload,
  FileText, Download, Trash2,
  Calendar, MapPin, User2,
  Square, CheckSquare, Send,
  Ban, XCircle, Pencil, Save,
} from 'lucide-react'
import { apiJson } from '@/lib/client-api'
import { useModalA11y } from '@/hooks/useModalA11y'
import {
  type Task, type TaskAttachment, type TaskLink, type ProgressNote,
  type TaskCommentItem, type CommentReply, type ChecklistItem, type TaskTimelineEntry,
  type TaskTemplate, type WorkloadInfo, type UserSnip,
  DEPT_OPTIONS, DEPT_LABEL, DEPT_COLOR, DEPT_TASK_OPTIONS,
  TYPE_LABEL, PRIORITY_LABEL, PRIORITY_TEXT,
  WORKLOAD_CLS, ACCEPTED_FILE_TYPES,
  fmtDate, fmtDateTime, toDateInputValue, isOverdue, effectiveStatus,
  parseLinks, parseNotes, isValidUrl, fmtFileSize, fileIcon,
  StatusBadge, DeptBadge, OverdueSeverityBadge, BlockedBadge,
  AttachmentItem, FileUploadZone,
} from './tasks-constants'

// On iOS/Android the on-screen keyboard can cover a field that was already
// scrolled into view before the keyboard opened — re-centering it once the
// keyboard finishes animating in is more reliable than computing viewport
// math by hand. Delegated on the scroll container so every field is covered
// without wiring an onFocus handler per input.
function scrollFocusedFieldIntoView(e: FocusEvent<HTMLElement>) {
  const target = e.target
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, 300)
}

// ── Checklist Section ────────────────────────────────────────────────────────

function ChecklistSection({ taskId, initial, currentUserId }: { taskId: string; initial: ChecklistItem[]; currentUserId: string }) {
  const [items, setItems] = useState<ChecklistItem[]>(initial)
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const done = items.filter((i) => i.isCompleted).length
  const pct  = items.length > 0 ? Math.round((done / items.length) * 100) : 0

  async function toggleItem(item: ChecklistItem) {
    setLoading(item.id)
    const res = await fetch(`/api/tasks/${taskId}/checklist?itemId=${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted: !item.isCompleted }),
    })
    if (res.ok) {
      const json = await res.json() as { item: ChecklistItem }
      setItems((p) => p.map((i) => i.id === item.id ? json.item : i))
    }
    setLoading(null)
  }

  async function addItem() {
    if (!newTitle.trim()) return
    setAdding(true)
    const res = await fetch(`/api/tasks/${taskId}/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    })
    if (res.ok) {
      const json = await res.json() as { item: ChecklistItem }
      setItems((p) => [...p, json.item])
      setNewTitle('')
    }
    setAdding(false)
  }

  async function deleteItem(itemId: string) {
    setLoading(itemId)
    const res = await fetch(`/api/tasks/${taskId}/checklist?itemId=${itemId}`, { method: 'DELETE' })
    if (res.ok) setItems((p) => p.filter((i) => i.id !== itemId))
    setLoading(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <CheckSquare className="w-3 h-3" />รายการตรวจสอบ
          {items.length > 0 && <span className="rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 text-[12px] font-bold">{done}/{items.length}</span>}
        </p>
      </div>
      {items.length > 0 && (
        <>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 mb-3 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="space-y-1.5 mb-3">
            {items.map((item) => (
              <div key={item.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 border transition-colors ${item.isCompleted ? 'bg-green-50 dark:bg-green-500/[0.06] border-green-100 dark:border-green-500/20' : 'bg-slate-50 dark:bg-white/[0.03] border-slate-100 dark:border-white/[0.05]'}`}>
                <button type="button" disabled={loading === item.id} onClick={() => toggleItem(item)}
                  className="flex-shrink-0 text-slate-400 hover:text-green-500 transition-colors disabled:opacity-40">
                  {loading === item.id
                    ? <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                    : item.isCompleted
                      ? <CheckSquare className="w-4 h-4 text-green-500" />
                      : <Square className="w-4 h-4" />
                  }
                </button>
                <span className={`flex-1 text-[13px] ${item.isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{item.title}</span>
                {item.completedBy && (
                  <span className="text-[12px] text-slate-400 truncate max-w-[80px]">{item.completedBy.name}</span>
                )}
                <button type="button" onClick={() => deleteItem(item.id)} disabled={loading === item.id} aria-label={`ลบ: ${item.title}`}
                  className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flex gap-2">
        <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
          placeholder="เพิ่มรายการตรวจสอบ..."
          className="flex-1 rounded-xl px-3 py-2 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-green-400/60" />
        <button type="button" disabled={adding || !newTitle.trim()} onClick={addItem}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/25 hover:bg-green-100 transition-colors disabled:opacity-40">
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          เพิ่ม
        </button>
      </div>
    </div>
  )
}

// ── Comments Section ──────────────────────────────────────────────────────────

function CommentsSection({ taskId, initial, currentUserId }: { taskId: string; initial: TaskCommentItem[]; currentUserId: string }) {
  const [comments, setComments]   = useState<TaskCommentItem[]>(initial)
  const [text, setText]           = useState('')
  const [replyingTo, setReplyTo]  = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [posting, setPosting]     = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)

  async function postComment(content: string, parentId?: string) {
    if (!content.trim()) return
    setPosting(true)
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim(), parentId: parentId ?? null }),
    })
    if (res.ok) {
      const json = await res.json() as { comment: TaskCommentItem }
      if (parentId) {
        setComments((p) => p.map((c) =>
          c.id === parentId
            ? { ...c, replies: [...(c.replies ?? []), json.comment as unknown as CommentReply] }
            : c
        ))
        setReplyTo(null); setReplyText('')
      } else {
        setComments((p) => [...p, json.comment])
        setText('')
      }
    }
    setPosting(false)
  }

  async function deleteComment(commentId: string) {
    setDeleting(commentId)
    const res = await fetch(`/api/tasks/${taskId}/comments?commentId=${commentId}`, { method: 'DELETE' })
    if (res.ok) {
      setComments((p) => p.filter((c) => c.id !== commentId).map((c) => ({
        ...c, replies: c.replies?.filter((r) => r.id !== commentId) ?? []
      })))
    }
    setDeleting(null)
  }

  function fmtRelative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'เมื่อกี้'
    if (m < 60) return `${m} นาทีที่แล้ว`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} ชั่วโมงที่แล้ว`
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3" />ความคิดเห็น
        {comments.length > 0 && <span className="rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 text-[12px] font-bold">{comments.length}</span>}
      </p>

      {comments.length === 0 && (
        <p className="text-center text-[13px] text-slate-400 dark:text-slate-600 py-4">ยังไม่มีความคิดเห็น</p>
      )}

      <div className="space-y-3 mb-4">
        {comments.map((c) => (
          <div key={c.id}>
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{c.user.name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-slate-400">{fmtRelative(c.createdAt)}</span>
                  {c.user.id === currentUserId && (
                    <button type="button" disabled={deleting === c.id} onClick={() => deleteComment(c.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40">
                      {deleting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{c.content}</p>
              <button type="button" onClick={() => setReplyTo(replyingTo === c.id ? null : c.id)}
                className="mt-1 text-[11px] text-green-500 hover:text-green-600 transition-colors">
                ตอบกลับ
              </button>
            </div>

            {c.replies && c.replies.length > 0 && (
              <div className="ml-5 mt-1.5 space-y-1.5">
                {c.replies.map((r) => (
                  <div key={r.id} className="rounded-xl bg-green-50/50 dark:bg-green-500/[0.04] border border-green-100 dark:border-green-500/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{r.user.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-slate-400">{fmtRelative(r.createdAt)}</span>
                        {r.user.id === currentUserId && (
                          <button type="button" disabled={deleting === r.id} onClick={() => deleteComment(r.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40">
                            {deleting === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))}
              </div>
            )}

            {replyingTo === c.id && (
              <div className="ml-5 mt-1.5 flex gap-2">
                <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(replyText, c.id) } }}
                  placeholder={`ตอบกลับ ${c.user.name}...`}
                  className="flex-1 rounded-xl px-3 py-2 text-[12px] bg-white dark:bg-white/5 border border-green-200 dark:border-green-500/25 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
                <button type="button" disabled={posting || !replyText.trim()} onClick={() => postComment(replyText, c.id)}
                  className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl text-green-600 bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/25 hover:bg-green-100 transition-colors disabled:opacity-40">
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="เพิ่มความคิดเห็น..."
          className="flex-1 rounded-xl px-3 py-2 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:border-green-400/60" />
        <button type="button" disabled={posting || !text.trim()} onClick={() => postComment(text)}
          className="flex-shrink-0 self-end flex h-9 w-9 items-center justify-center rounded-xl text-green-600 bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/25 hover:bg-green-100 transition-colors disabled:opacity-40">
          {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}

// ── Timeline Section ──────────────────────────────────────────────────────────

const TIMELINE_ACTION_ICON: Record<string, React.ReactNode> = {
  created:              <Plus className="w-3 h-3 text-green-500" />,
  status_changed:       <RotateCcw className="w-3 h-3 text-amber-500" />,
  edited:               <FileText className="w-3 h-3 text-slate-400" />,
  commented:            <MessageSquare className="w-3 h-3 text-purple-400" />,
  checklist_completed:  <CheckCircle className="w-3 h-3 text-green-500" />,
  attachment_uploaded:  <Paperclip className="w-3 h-3 text-slate-400" />,
  escalated:            <AlertCircle className="w-3 h-3 text-red-500" />,
}

function TimelineSection({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<TaskTimelineEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/timeline`)
      .then(r => r.json())
      .then((d: { timeline?: TaskTimelineEntry[] }) => {
        if (d.timeline) setEntries(d.timeline)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [taskId])

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[13px] text-slate-400 dark:text-slate-600">ยังไม่มีประวัติการดำเนินงาน</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        ประวัติการดำเนินงาน ({entries.length})
      </p>
      <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-1 before:bottom-1 before:w-px before:bg-slate-200 dark:before:bg-white/[0.06]">
        {entries.map((entry) => (
          <div key={entry.id} className="relative">
            <div className="absolute -left-[15px] top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08]">
              {TIMELINE_ACTION_ICON[entry.action] ?? <span className="w-3 h-3 text-slate-400" />}
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{entry.user.name}</span>
                <span className="text-[12px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                  {new Date(entry.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}
                </span>
              </div>
              <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed">{entry.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Task Detail Modal ─────────────────────────────────────────────────────────

type DetailModalProps = {
  task: Task
  role: string
  userId: string
  onClose: () => void
  onUpdated: (t: Task) => void
}

export function TaskDetailModal({ task, role, userId, onClose, onUpdated }: DetailModalProps) {
  const panelRef = useModalA11y(true)
  const [resultNote,    setResultNote]   = useState(task.resultNote ?? '')
  const [reviewNote,    setReviewNote]   = useState('')
  const [progressInput, setProgress]     = useState('')
  const [error,         setError]        = useState<string | null>(null)
  const [isPending,     startTransition] = useTransition()
  const [detailTab,     setDetailTab]    = useState<'info' | 'checklist' | 'comments' | 'timeline'>('info')

  const [attachments,  setAttachments]  = useState<TaskAttachment[]>(task.attachments ?? [])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploading,    setUploading]    = useState(false)
  const [uploadError,  setUploadError]  = useState<string | null>(null)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)

  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist ?? [])
  const [comments, setComments] = useState<TaskCommentItem[]>(task.comments ?? [])
  const [loadedDetail, setLoadedDetail] = useState(false)

  const [isEditing,            setIsEditing]            = useState(false)
  const [editCaseNumber,       setEditCaseNumber]       = useState('')
  const [editClientName,       setEditClientName]       = useState('')
  const [editTaskDepartment,   setEditTaskDepartment]   = useState('')
  const [editType,             setEditType]             = useState('')
  const [editTitle,            setEditTitle]            = useState('')
  const [editDescription,      setEditDescription]      = useState('')
  const [editPriority,         setEditPriority]         = useState('')
  const [editStartDate,        setEditStartDate]        = useState('')
  const [editDueDate,          setEditDueDate]          = useState('')
  const [editDueTime,          setEditDueTime]          = useState('')
  const [editAppointmentDate,  setEditAppointmentDate]  = useState('')
  const [editCourtDate,        setEditCourtDate]        = useState('')
  const [editAppointmentPlace, setEditAppointmentPlace] = useState('')
  const [editNotes,            setEditNotes]            = useState('')
  const [editLinks,            setEditLinks]            = useState<TaskLink[]>([])

  useEffect(() => {
    if (loadedDetail) return
    setLoadedDetail(true)
    fetch(`/api/tasks/${task.id}`).then(r => r.json()).then((d: { task?: Task }) => {
      if (d.task?.checklist) setChecklist(d.task.checklist)
      if (d.task?.comments) setComments(d.task.comments)
      if (d.task?.attachments) setAttachments(d.task.attachments)
    }).catch(() => {})
  }, [task.id, loadedDetail])

  const isAssignee  = task.assigneeId   === userId
  const isAssigner  = task.assignedById === userId
  const isFullAdmin = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR'].includes(role)
  const isReviewer  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(role)
                       && (isAssigner || isFullAdmin)

  const canAct        = isAssignee || isReviewer || isFullAdmin
  const canUploadFile = isAssignee || isReviewer || isFullAdmin
  const links         = parseLinks(task.taskLinks)
  const noteHist      = parseNotes(task.progressNotes)
  const eff           = effectiveStatus(task)

  const editInputCls = 'w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-green-400/60'

  const isWorkable = !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(task.status)
  const canStart   = ['PENDING', 'NEW', 'ASSIGNED'].includes(task.status)
  const canWork    = ['IN_PROGRESS', 'REVISION', 'WAITING_DOC'].includes(task.status)

  function patch(body: Record<string, unknown>) {
    setError(null)
    startTransition(async () => {
      const { ok, data } = await apiJson<{ task: Task; error?: string }>(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!ok || data.error) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      onUpdated(data.task)
    })
  }

  const editTaskTypeOptions = DEPT_TASK_OPTIONS[editTaskDepartment] ?? DEPT_TASK_OPTIONS['']

  function startEdit() {
    setEditCaseNumber(task.caseNumber ?? '')
    setEditClientName(task.clientName ?? '')
    setEditTaskDepartment(task.taskDepartment ?? '')
    setEditType(task.type)
    setEditTitle(task.title)
    setEditDescription(task.description ?? '')
    setEditPriority(task.priority)
    setEditStartDate(toDateInputValue(task.startDate))
    setEditDueDate(toDateInputValue(task.dueDate))
    setEditDueTime(task.dueTime ?? '')
    setEditAppointmentDate(toDateInputValue(task.appointmentDate))
    setEditCourtDate(toDateInputValue(task.courtDate))
    setEditAppointmentPlace(task.appointmentPlace ?? '')
    setEditNotes(task.notes ?? '')
    setEditLinks(parseLinks(task.taskLinks))
    setError(null)
    setIsEditing(true)
  }

  function handleEditDeptChange(d: string) {
    setEditTaskDepartment(d)
    const opts = DEPT_TASK_OPTIONS[d] ?? DEPT_TASK_OPTIONS['']
    setEditType(opts[0].value)
  }

  function saveEdit() {
    if (!editTitle.trim()) { setError('กรุณาระบุชื่องาน'); return }
    const cleanLinks = editLinks.filter((l) => l.url.trim())
    for (const lk of cleanLinks) {
      if (!isValidUrl(lk.url.trim())) { setError(`URL ไม่ถูกต้อง: ${lk.url}`); return }
    }
    setError(null)
    startTransition(async () => {
      const { ok, data } = await apiJson<{ task: Task; error?: string }>(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseNumber:       editCaseNumber.trim()       || null,
          clientName:       editClientName.trim()       || null,
          taskDepartment:   editTaskDepartment          || null,
          type:             editType,
          title:            editTitle.trim(),
          description:      editDescription.trim()      || null,
          priority:         editPriority,
          startDate:        editStartDate               || null,
          dueDate:          editDueDate                 || null,
          dueTime:          editDueTime                 || null,
          appointmentDate:  editAppointmentDate         || null,
          courtDate:        editCourtDate               || null,
          appointmentPlace: editAppointmentPlace.trim() || null,
          notes:            editNotes.trim()            || null,
          taskLinks:        cleanLinks.map(({ _key: _, ...rest }) => rest),
        }),
      })
      if (!ok || data.error) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return }
      onUpdated(data.task)
      setIsEditing(false)
    })
  }

  async function handleUploadFiles() {
    if (!pendingFiles.length) return
    setUploading(true); setUploadError(null)
    const uploaded: TaskAttachment[] = []
    for (const file of pendingFiles) {
      const fd = new FormData(); fd.append('file', file)
      try {
        const res = await fetch(`/api/tasks/${task.id}/attachments`, { method: 'POST', body: fd })
        const json = await res.json() as { attachment?: TaskAttachment; error?: string }
        if (!res.ok || json.error) { setUploadError(json.error ?? 'อัปโหลดไม่สำเร็จ'); setUploading(false); return }
        if (json.attachment) uploaded.push(json.attachment)
      } catch { setUploadError('เกิดข้อผิดพลาดในการอัปโหลด'); setUploading(false); return }
    }
    setAttachments((p) => [...p, ...uploaded]); setPendingFiles([]); setUploading(false)
  }

  async function handleDeleteAttachment(att: TaskAttachment) {
    setDeletingId(att.id)
    try {
      const res = await fetch(`/api/tasks/${task.id}/attachments?attachmentId=${att.id}`, { method: 'DELETE' })
      if (res.ok) setAttachments((p) => p.filter((a) => a.id !== att.id))
      else { const j = await res.json() as { error?: string }; setUploadError(j.error ?? 'ลบไม่สำเร็จ') }
    } catch { setUploadError('เกิดข้อผิดพลาด') }
    setDeletingId(null)
  }

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal aria-label={task.title} className="fixed z-60 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4">
        <div ref={panelRef} tabIndex={-1} className="relative w-full md:max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[90vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}>

          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          <div className="flex-shrink-0 flex items-start justify-between gap-3 px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                {task.caseNumber && (
                  <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.07] px-2 py-0.5 rounded-md">
                    {task.caseNumber}
                  </span>
                )}
                <DeptBadge dept={task.taskDepartment} />
              </div>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-snug">{task.title}</h2>
              {task.clientName && (
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                  <User2 className="w-3 h-3" />{task.clientName}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex items-center gap-1">
              {(isAssigner || isFullAdmin) && isWorkable && !isEditing && (
                <button type="button" onClick={startEdit} title="แก้ไขงาน" aria-label="แก้ไขงาน"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={onClose} aria-label="ปิด"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-shrink-0 flex gap-1 px-5 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            {([
              { id: 'info' as const,      label: 'ข้อมูล' },
              { id: 'checklist' as const, label: `รายการ${checklist.length > 0 ? ` (${checklist.filter(i => i.isCompleted).length}/${checklist.length})` : ''}` },
              { id: 'comments' as const,  label: `ความคิดเห็น${comments.length > 0 ? ` (${comments.length})` : ''}` },
              { id: 'timeline' as const,  label: 'ประวัติ' },
            ]).map((t) => (
              <button key={t.id} type="button" onClick={() => setDetailTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${detailTab === t.id ? 'bg-green-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4 scroll-pb-24" onFocusCapture={scrollFocusedFieldIntoView}>

            {detailTab === 'checklist' && (
              <ChecklistSection taskId={task.id} initial={checklist} currentUserId={userId} />
            )}

            {detailTab === 'comments' && (
              <CommentsSection taskId={task.id} initial={comments} currentUserId={userId} />
            )}

            {detailTab === 'timeline' && (
              <TimelineSection taskId={task.id} />
            )}

            {detailTab === 'info' && isEditing && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="field-1" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">เลขคดี / รหัสงาน</label>
                    <input id="field-1" type="text" value={editCaseNumber} onChange={(e) => setEditCaseNumber(e.target.value)} className={editInputCls} />
                  </div>
                  <div>
                    <label htmlFor="field-2" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ชื่อลูกค้า</label>
                    <input id="field-2" type="text" value={editClientName} onChange={(e) => setEditClientName(e.target.value)} className={editInputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="field-3" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ฝ่าย</label>
                    <select id="field-3" value={editTaskDepartment} onChange={(e) => handleEditDeptChange(e.target.value)} className={editInputCls}>
                      {DEPT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="field-4" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ประเภทงาน</label>
                    <select id="field-4" value={editType} onChange={(e) => setEditType(e.target.value)} className={editInputCls}>
                      {editTaskTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="field-5" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">
                    ชื่องาน / รายละเอียดสั้น <span className="text-red-500">*</span>
                  </label>
                  <input id="field-5" type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={editInputCls} />
                </div>

                <div>
                  <label htmlFor="field-6" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">รายละเอียดงาน</label>
                  <textarea id="field-6" rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={`${editInputCls} resize-none`} />
                </div>

                <div>
                  <label htmlFor="field-7" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ความสำคัญ</label>
                  <select id="field-7" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className={editInputCls}>
                    <option value="LOW">⚪ ต่ำ</option>
                    <option value="MEDIUM">🟡 ปานกลาง</option>
                    <option value="HIGH">🟠 สูง</option>
                    <option value="URGENT">🔴 เร่งด่วน</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="field-8" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">วันเริ่มงาน</label>
                    <input id="field-8" type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} className={editInputCls} />
                  </div>
                  <div>
                    <label htmlFor="field-9" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">กำหนดเสร็จ</label>
                    <input id="field-9" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className={editInputCls} />
                  </div>
                  <div>
                    <label htmlFor="field-10" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">เวลากำหนดส่ง</label>
                    <input id="field-10" type="time" value={editDueTime} onChange={(e) => setEditDueTime(e.target.value)} className={editInputCls} />
                  </div>
                </div>

                <div className="rounded-xl bg-amber-50/60 dark:bg-amber-500/[0.05] border border-amber-100 dark:border-amber-500/15 px-4 py-3 space-y-3">
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />วันนัดหมาย (ถ้ามี)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="field-11" className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">วันนัดหมาย</label>
                      <input id="field-11" type="date" value={editAppointmentDate} onChange={(e) => setEditAppointmentDate(e.target.value)} className={editInputCls} />
                    </div>
                    <div>
                      <label htmlFor="field-12" className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">วันนัดศาล</label>
                      <input id="field-12" type="date" value={editCourtDate} onChange={(e) => setEditCourtDate(e.target.value)} className={editInputCls} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="field-13" className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">สถานที่นัด</label>
                    <input id="field-13" type="text" value={editAppointmentPlace} onChange={(e) => setEditAppointmentPlace(e.target.value)} className={editInputCls} />
                  </div>
                </div>

                <div>
                  <label htmlFor="field-14" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">หมายเหตุ</label>
                  <textarea id="field-14" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={`${editInputCls} resize-none`} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] text-slate-500 dark:text-slate-400">แนบลิงก์งาน</span>
                    <button type="button" onClick={() => setEditLinks((p) => [...p, { _key: String(Date.now()), label: '', url: '' }])}
                      className="flex items-center gap-1 text-[12px] text-green-600 dark:text-green-400 hover:text-green-700 font-medium">
                      <Plus className="w-3.5 h-3.5" />เพิ่มลิงก์
                    </button>
                  </div>
                  {editLinks.length > 0 && (
                    <div className="space-y-2">
                      {editLinks.map((lk, i) => (
                        <div key={lk._key ?? String(i)} className="flex gap-2 items-start">
                          <div className="flex-1 space-y-1.5">
                            <input type="text" value={lk.label}
                              onChange={(e) => setEditLinks((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                              placeholder="ชื่อลิงก์ (ไม่บังคับ)" className={editInputCls} />
                            <input type="url" value={lk.url}
                              onChange={(e) => setEditLinks((p) => p.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x))}
                              placeholder="https://..." className={editInputCls} />
                          </div>
                          <button type="button" onClick={() => setEditLinks((p) => p.filter((_, idx) => idx !== i))} aria-label="ลบลิงก์"
                            className="flex-shrink-0 mt-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error && <p className="rounded-xl text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button type="button" disabled={isPending} onClick={() => setIsEditing(false)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors disabled:opacity-50">
                    ยกเลิก
                  </button>
                  <button type="button" disabled={isPending} onClick={saveEdit}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    บันทึกการแก้ไข
                  </button>
                </div>
              </div>
            )}

            {detailTab === 'info' && !isEditing && <>

            <div className="flex flex-wrap gap-2 items-center">
              <StatusBadge status={eff} />
              <span className={`text-[12px] font-medium ${PRIORITY_TEXT[task.priority] ?? 'text-slate-500'}`}>
                {PRIORITY_LABEL[task.priority] ?? task.priority}
              </span>
              <OverdueSeverityBadge task={task} />
              {task.isBlocked && <BlockedBadge />}
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] divide-y divide-slate-100 dark:divide-white/[0.04]">
              {([
                ['ผู้รับผิดชอบ', task.assignee.name],
                ['มอบหมายโดย',  task.assignedBy.name],
                ['แผนก/ฝ่าย',   task.assignee.department ?? '—'],
                ['ประเภทงาน',   TYPE_LABEL[task.type] ?? task.type],
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

            {(task.appointmentDate || task.courtDate || task.appointmentPlace) && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/[0.07] border border-amber-100 dark:border-amber-500/15 px-4 py-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />วันนัดหมาย
                </p>
                {task.appointmentDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 w-20">วันนัด</span>
                    <span className="text-[13px] font-medium text-amber-900 dark:text-amber-200">{fmtDate(task.appointmentDate)}</span>
                  </div>
                )}
                {task.courtDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 w-20">วันนัดศาล</span>
                    <span className="text-[13px] font-medium text-amber-900 dark:text-amber-200">{fmtDate(task.courtDate)}</span>
                  </div>
                )}
                {task.appointmentPlace && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" />
                    <span className="text-[13px] text-amber-900 dark:text-amber-200">{task.appointmentPlace}</span>
                  </div>
                )}
              </div>
            )}

            {links.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">ลิงก์ที่เกี่ยวข้อง</p>
                <div className="space-y-1.5">
                  {links.map((lk) => (
                    <a key={lk._key ?? lk.url} href={lk.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors group">
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-60 group-hover:opacity-100" />
                      <span className="flex-1 truncate">{lk.label || lk.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Paperclip className="w-3 h-3" />ไฟล์แนบ
                {attachments.length > 0 && (
                  <span className="rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 text-[12px] font-bold">{attachments.length}</span>
                )}
              </p>
              {attachments.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {attachments.map((att) => (
                    <AttachmentItem key={att.id} att={att}
                      canDelete={att.uploadedBy.id === userId || isFullAdmin}
                      onDelete={() => handleDeleteAttachment(att)}
                      isDeleting={deletingId === att.id} />
                  ))}
                </div>
              )}
              {canUploadFile && (
                <div className="space-y-2">
                  <FileUploadZone pendingFiles={pendingFiles}
                    onFilesAdded={(f) => setPendingFiles((p) => [...p, ...f])}
                    onRemove={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
                    uploading={uploading} />
                  {pendingFiles.length > 0 && (
                    <button type="button" disabled={uploading} onClick={handleUploadFiles}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploading ? 'กำลังอัปโหลด...' : `อัปโหลด ${pendingFiles.length} ไฟล์`}
                    </button>
                  )}
                  {uploadError && <p className="rounded-xl text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2">{uploadError}</p>}
                </div>
              )}
              {!canUploadFile && attachments.length === 0 && (
                <p className="text-[12px] text-slate-400 dark:text-slate-600 italic">ยังไม่มีไฟล์แนบ</p>
              )}
            </div>

            {task.description && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">รายละเอียด</p>
                <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{task.description}</p>
              </div>
            )}

            {task.notes && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">หมายเหตุ</p>
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
              <div className="rounded-xl bg-green-50 dark:bg-green-500/[0.07] border border-green-100 dark:border-green-500/15 px-4 py-3">
                <p className="text-[11px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">ผลงานที่ส่ง</p>
                <p className="text-[13px] text-green-800 dark:text-green-300">{task.resultNote}</p>
                {task.submittedAt && <p className="text-[12px] text-green-500 dark:text-green-400/60 mt-1">ส่งเมื่อ {fmtDate(task.submittedAt)}</p>}
              </div>
            )}

            {noteHist.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" />ประวัติการอัปเดต
                </p>
                <div className="relative pl-4 space-y-2 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-slate-200 dark:before:bg-white/[0.06]">
                  {noteHist.map((n) => (
                    <div key={n.timestamp} className="relative">
                      <div className="absolute -left-[11px] top-2 w-2 h-2 rounded-full bg-green-400 dark:bg-green-500 ring-2 ring-white dark:ring-slate-900" />
                      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{n.userName}</span>
                          <span className="text-[12px] text-slate-400 dark:text-slate-500 flex-shrink-0">{fmtDateTime(n.timestamp)}</span>
                        </div>
                        <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{n.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canAct && isWorkable && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">เพิ่มบันทึก</p>
                <div className="flex gap-2">
                  <textarea rows={2} value={progressInput} onChange={(e) => setProgress(e.target.value)}
                    placeholder="บันทึกความคืบหน้า..."
                    className="flex-1 rounded-xl px-3 py-2 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-green-400/60" />
                  <button type="button" disabled={isPending || !progressInput.trim()}
                    onClick={() => { if (!progressInput.trim()) return; patch({ progressNote: progressInput.trim() }); setProgress('') }}
                    className="flex-shrink-0 self-end flex items-center justify-center rounded-xl px-3 py-2 text-[12px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/25 hover:bg-green-100 transition-colors disabled:opacity-40">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'บันทึก'}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="rounded-xl text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2">{error}</p>}

            {isAssignee && isWorkable && (
              <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-1">อัปเดตงาน</p>

                {canStart && (
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'IN_PROGRESS' })}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/25 hover:bg-green-100 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    รับงาน / เริ่มทำ
                  </button>
                )}

                {canWork && (
                  <div className="space-y-2">
                    <textarea rows={3} value={resultNote} onChange={(e) => setResultNote(e.target.value)}
                      placeholder="รายละเอียดผลงาน / สิ่งที่ทำเสร็จแล้ว..."
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:border-green-400/60" />
                    <div className="grid grid-cols-2 gap-2">
                      {task.status === 'IN_PROGRESS' && (
                        <button type="button" disabled={isPending} onClick={() => patch({ status: 'WAITING_DOC' })}
                          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-200 dark:border-yellow-500/25 hover:bg-yellow-100 transition-colors disabled:opacity-50">
                          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                          รอเอกสาร
                        </button>
                      )}
                      {task.status === 'WAITING_DOC' && (
                        <button type="button" disabled={isPending} onClick={() => patch({ status: 'IN_PROGRESS' })}
                          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/25 hover:bg-green-100 transition-colors disabled:opacity-50">
                          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                          ได้รับเอกสารแล้ว
                        </button>
                      )}
                      <button type="button" disabled={isPending}
                        onClick={() => patch({ status: 'WAITING_REVIEW', resultNote })}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/25 hover:bg-amber-100 transition-colors disabled:opacity-50 ${task.status === 'IN_PROGRESS' ? '' : 'col-span-2'}`}>
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                        ส่งตรวจสอบ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isReviewer && (task.status === 'WAITING_REVIEW' || task.status === 'WAITING_APPROVAL') && (
              <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-1">ตรวจงาน</p>
                <textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="หมายเหตุ (ไม่บังคับ)..."
                  className="w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:border-green-400/60" />
                <div className="flex gap-2">
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'COMPLETED', reviewNote })}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/15 border border-green-200 dark:border-green-500/25 hover:bg-green-100 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    อนุมัติ
                  </button>
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'REVISION', reviewNote })}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/25 hover:bg-orange-100 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    ขอแก้ไข
                  </button>
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'REJECTED', reviewNote })}
                    className="flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-[13px] font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/25 hover:bg-red-100 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    ปฏิเสธ
                  </button>
                </div>
              </div>
            )}

            {(isAssigner || isFullAdmin) && isWorkable && (
              <div className="pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <button type="button" disabled={isPending} onClick={() => { if (confirm('ยืนยันยกเลิกงานนี้?')) patch({ status: 'CANCELLED' }) }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors disabled:opacity-50">
                  <Ban className="w-3.5 h-3.5" />
                  ยกเลิกงาน
                </button>
              </div>
            )}

            </>}
          </div>

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

// ── Create Task Modal ─────────────────────────────────────────────────────────

type CreateModalProps = {
  employees: UserSnip[]
  assignerName: string
  onClose: () => void
  onCreated: (t: Task) => void
  templates?: TaskTemplate[]
  workloadMap?: Record<string, WorkloadInfo>
}

export function CreateTaskModal({ employees, assignerName, onClose, onCreated, templates = [], workloadMap = {} }: CreateModalProps) {
  const panelRef = useModalA11y(true)
  const [isPending, startTransition] = useTransition()
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [caseNumber,       setCaseNumber]  = useState('')
  const [clientName,       setClientName]  = useState('')
  const [taskDepartment,   setDept]        = useState('')
  const [title,            setTitle]       = useState('')
  const [description,      setDesc]        = useState('')
  const [type,             setType]        = useState('OFFICE')
  const [priority,         setPriority]    = useState('MEDIUM')
  const [assigneeId,       setAssignee]    = useState('')
  const [startDate,        setStart]       = useState('')
  const [dueDate,          setDue]         = useState('')
  const [appointmentDate,  setApptDate]    = useState('')
  const [courtDate,        setCourtDate]   = useState('')
  const [appointmentPlace, setApptPlace]   = useState('')
  const [notes,            setNotes]       = useState('')
  const [links,            setLinks]       = useState<TaskLink[]>([])
  const [pendingFiles,     setPendingFiles]= useState<File[]>([])
  const [uploading,        setUploading]   = useState(false)
  const [error,            setError]       = useState<string | null>(null)
  const [checklistItems,   setChecklistItems] = useState<{ _key: string; value: string }[]>([])
  const [dueTime,          setDueTime]        = useState('')

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-green-400/60'

  const taskTypeOptions = DEPT_TASK_OPTIONS[taskDepartment] ?? DEPT_TASK_OPTIONS['']

  function applyTemplate(tpl: TaskTemplate) {
    if (tpl.description)    setDesc(tpl.description)
    if (tpl.taskType)       setType(tpl.taskType)
    if (tpl.priority)       setPriority(tpl.priority)
    if (tpl.department)     { setDept(tpl.department); setType(tpl.taskType ?? (DEPT_TASK_OPTIONS[tpl.department]?.[0]?.value ?? 'OFFICE')) }
    if (tpl.notes)          setNotes(tpl.notes)
    try {
      const items: { title: string }[] = JSON.parse(tpl.defaultChecklist)
      if (items.length > 0) setChecklistItems(items.map((item, i) => ({ _key: String(Date.now() + i), value: item.title })))
    } catch { /* ignore */ }
    setSelectedTemplateId(tpl.id)
    setShowTemplatePicker(false)
  }

  function handleDeptChange(d: string) {
    setDept(d)
    const opts = DEPT_TASK_OPTIONS[d] ?? DEPT_TASK_OPTIONS['']
    setType(opts[0].value)
  }

  async function uploadFiles(taskId: string): Promise<string | null> {
    for (const file of pendingFiles) {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: fd })
      if (!res.ok) { const j = await res.json() as { error?: string }; return j.error ?? 'อัปโหลดไฟล์ไม่สำเร็จ' }
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim())  { setError('กรุณาระบุชื่องาน/รายละเอียดงาน'); return }
    if (!assigneeId)    { setError('กรุณาเลือกผู้รับผิดชอบ'); return }
    if (!dueDate)       { setError('กรุณาระบุกำหนดเสร็จ'); return }

    const cleanLinks = links.filter((l) => l.url.trim())
    for (const lk of cleanLinks) {
      if (!isValidUrl(lk.url.trim())) { setError(`URL ไม่ถูกต้อง: ${lk.url}`); return }
    }
    setError(null)

    startTransition(async () => {
      const { ok, data } = await apiJson<{ task: Task; error?: string }>('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseNumber:       caseNumber.trim()       || null,
          clientName:       clientName.trim()       || null,
          taskDepartment:   taskDepartment          || null,
          title:            title.trim(),
          description:      description.trim()      || null,
          type,
          priority,
          assigneeId,
          startDate:        startDate               || null,
          dueDate,
          appointmentDate:  appointmentDate         || null,
          courtDate:        courtDate               || null,
          appointmentPlace: appointmentPlace.trim() || null,
          notes:            notes.trim()            || null,
          taskLinks:        cleanLinks.length > 0 ? cleanLinks.map(({ _key: _, ...rest }) => rest) : undefined,
          checklist:        checklistItems.filter(c => c.value.trim()).map(c => ({ title: c.value.trim() })),
          dueTime:          dueTime || null,
          templateId:       selectedTemplateId || null,
        }),
      })
      if (!ok || data.error) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return }

      if (pendingFiles.length > 0) {
        setUploading(true)
        const uploadErr = await uploadFiles(data.task.id)
        setUploading(false)
        if (uploadErr) { setError(`สร้างงานสำเร็จ แต่อัปโหลดไฟล์ไม่สำเร็จ: ${uploadErr}`); onCreated(data.task); return }
        const refetch = await apiJson<{ task: Task }>(`/api/tasks/${data.task.id}`, { method: 'GET' })
        if (refetch.ok && refetch.data.task) { onCreated(refetch.data.task); return }
      }
      onCreated(data.task)
    })
  }

  const isSubmitting = isPending || uploading

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal aria-label="สร้างงาน / รับเรื่อง" className="fixed z-60 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4">
        <div ref={panelRef} tabIndex={-1} className="relative w-full md:max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[92vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}>

          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">สร้างงาน / รับเรื่อง</h2>
            <button type="button" onClick={onClose} aria-label="ปิด"
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain scroll-pb-24" onFocusCapture={scrollFocusedFieldIntoView}>
            <div className="px-5 py-4 space-y-4">

              {templates.length > 0 && (
                <div className="rounded-xl border border-dashed border-green-300 dark:border-green-500/30 bg-green-50/50 dark:bg-green-500/[0.04] px-3 py-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5" />
                      {selectedTemplateId ? `เทมเพลต: ${templates.find(t => t.id === selectedTemplateId)?.name ?? ''}` : 'สร้างจากเทมเพลต (ไม่บังคับ)'}
                    </p>
                    <button type="button" onClick={() => setShowTemplatePicker(v => !v)}
                      className="text-[11px] text-green-600 dark:text-green-400 font-medium hover:underline">
                      {showTemplatePicker ? 'ซ่อน' : selectedTemplateId ? 'เปลี่ยน' : 'เลือก'}
                    </button>
                  </div>
                  {showTemplatePicker && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {templates.map((tpl) => (
                        <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl)}
                          className="w-full text-left rounded-lg px-3 py-2 text-[12px] hover:bg-green-100 dark:hover:bg-green-500/15 transition-colors border border-transparent hover:border-green-200 dark:hover:border-green-500/30">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{tpl.name}</p>
                          {tpl.description && <p className="text-slate-500 dark:text-slate-400 truncate text-[11px]">{tpl.description}</p>}
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            {tpl.department && <span className={`text-[12px] font-semibold rounded-full px-1.5 py-0.5 border ${DEPT_COLOR[tpl.department] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>{DEPT_LABEL[tpl.department] ?? tpl.department}</span>}
                            <span className="text-[12px] text-slate-400">{PRIORITY_LABEL[tpl.priority]}</span>
                            {tpl.defaultSlaHours && <span className="text-[12px] text-slate-400">SLA {tpl.defaultSlaHours}h</span>}
                            {tpl.defaultChecklist !== '[]' && (() => { try { return JSON.parse(tpl.defaultChecklist).length } catch { return 0 } })() > 0 && (
                              <span className="text-[12px] text-slate-400">✓ {(() => { try { return JSON.parse(tpl.defaultChecklist).length } catch { return 0 } })()} รายการ</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-15" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">เลขคดี / รหัสงาน</label>
                  <input id="field-15" type="text" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="เช่น KM-2024-001" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="field-16" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ชื่อลูกค้า</label>
                  <input id="field-16" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="ชื่อลูกค้า / เจ้าหนี้" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-17" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ฝ่าย <span className="text-red-500">*</span></label>
                  <select id="field-17" value={taskDepartment} onChange={(e) => handleDeptChange(e.target.value)} className={inputCls}>
                    {DEPT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="field-18" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ประเภทงาน <span className="text-red-500">*</span></label>
                  <select id="field-18" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                    {taskTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="field-19" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">
                  ชื่องาน / รายละเอียดสั้น <span className="text-red-500">*</span>
                </label>
                <input id="field-19" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ระบุชื่องาน..." className={inputCls} />
              </div>

              <div>
                <label htmlFor="field-20" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">รายละเอียดงาน</label>
                <textarea id="field-20" rows={3} value={description} onChange={(e) => setDesc(e.target.value)} placeholder="อธิบายรายละเอียดงาน..." className={`${inputCls} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="field-21" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ผู้รับผิดชอบ <span className="text-red-500">*</span></label>
                  <select id="field-21" value={assigneeId} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
                    <option value="">เลือกพนักงาน...</option>
                    {employees.map((emp) => {
                      const wl = workloadMap[emp.id]
                      const wlLabel = wl ? ` [${wl.statusLabel} ${wl.activeCount}งาน]` : ''
                      return (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}{emp.department ? ` — ${emp.department}` : ''}{wlLabel}
                        </option>
                      )
                    })}
                  </select>
                  {assigneeId && workloadMap[assigneeId] && (() => {
                    const wl = workloadMap[assigneeId]
                    return (
                      <p className={`mt-1 text-[11px] font-medium px-1 ${WORKLOAD_CLS[wl.status]?.split(' ').slice(2).join(' ') ?? ''}`}>
                        {wl.statusLabel}: {wl.activeCount} งาน{wl.overdueCount > 0 ? `, เกินกำหนด ${wl.overdueCount}` : ''}
                      </p>
                    )
                  })()}
                </div>
                <div>
                  <label htmlFor="field-22" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ความสำคัญ</label>
                  <select id="field-22" value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                    <option value="LOW">⚪ ต่ำ</option>
                    <option value="MEDIUM">🟡 ปานกลาง</option>
                    <option value="HIGH">🟠 สูง</option>
                    <option value="URGENT">🔴 เร่งด่วน</option>
                  </select>
                </div>
              </div>

              <div>
                <span className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ผู้มอบหมาย</span>
                <div className={`${inputCls} text-slate-400 dark:text-slate-500 cursor-not-allowed`}>{assignerName}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-23" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">วันเริ่มงาน</label>
                  <input id="field-23" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="field-24" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">กำหนดเสร็จ <span className="text-red-500">*</span></label>
                  <input id="field-24" type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="field-25" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">เวลากำหนดส่ง</label>
                  <input id="field-25" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="rounded-xl bg-amber-50/60 dark:bg-amber-500/[0.05] border border-amber-100 dark:border-amber-500/15 px-4 py-3 space-y-3">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />วันนัดหมาย (ถ้ามี)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="field-26" className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">วันนัดหมาย</label>
                    <input id="field-26" type="date" value={appointmentDate} onChange={(e) => setApptDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="field-27" className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">วันนัดศาล</label>
                    <input id="field-27" type="date" value={courtDate} onChange={(e) => setCourtDate(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label htmlFor="field-28" className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">สถานที่นัด</label>
                  <input id="field-28" type="text" value={appointmentPlace} onChange={(e) => setApptPlace(e.target.value)}
                    placeholder="สถานที่ / ศาล / สำนักงาน..." className={inputCls} />
                </div>
              </div>

              <div>
                <label htmlFor="field-29" className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">หมายเหตุ</label>
                <textarea id="field-29" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="หมายเหตุเพิ่มเติม..." className={`${inputCls} resize-none`} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">แนบลิงก์งาน</span>
                  <button type="button" onClick={() => setLinks((p) => [...p, { _key: String(Date.now()), label: '', url: '' }])}
                    className="flex items-center gap-1 text-[12px] text-green-600 dark:text-green-400 hover:text-green-700 font-medium">
                    <Plus className="w-3.5 h-3.5" />เพิ่มลิงก์
                  </button>
                </div>
                {links.length > 0 && (
                  <div className="space-y-2">
                    {links.map((lk, i) => (
                      <div key={lk._key ?? String(i)} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1.5">
                          <input type="text" value={lk.label}
                            onChange={(e) => setLinks((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                            placeholder="ชื่อลิงก์ (ไม่บังคับ)" className={inputCls} />
                          <input type="url" value={lk.url}
                            onChange={(e) => setLinks((p) => p.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x))}
                            placeholder="https://..." className={inputCls} />
                        </div>
                        <button type="button" onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))} aria-label="ลบลิงก์"
                          className="flex-shrink-0 mt-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5" />รายการตรวจสอบ (ไม่บังคับ)
                  </span>
                  <button type="button" onClick={() => setChecklistItems((p) => [...p, { _key: String(Date.now()), value: '' }])}
                    className="flex items-center gap-1 text-[12px] text-green-600 dark:text-green-400 hover:text-green-700 font-medium">
                    <Plus className="w-3.5 h-3.5" />เพิ่ม
                  </button>
                </div>
                {checklistItems.length > 0 && (
                  <div className="space-y-1.5">
                    {checklistItems.map((item, i) => (
                      <div key={item._key} className="flex gap-2 items-center">
                        <Square className="w-3.5 h-3.5 flex-shrink-0 text-slate-300 dark:text-slate-600" />
                        <input type="text" value={item.value}
                          onChange={(e) => setChecklistItems((p) => p.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
                          placeholder={`รายการที่ ${i + 1}...`} className={`flex-1 ${inputCls}`} />
                        <button type="button" onClick={() => setChecklistItems((p) => p.filter((_, idx) => idx !== i))} aria-label="ลบรายการ"
                          className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-red-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span className="block text-[12px] text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />แนบไฟล์งาน
                </span>
                <FileUploadZone pendingFiles={pendingFiles}
                  onFilesAdded={(f) => setPendingFiles((p) => [...p, ...f])}
                  onRemove={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
                  uploading={isSubmitting} />
                {pendingFiles.length > 0 && <p className="mt-1 text-[11px] text-slate-400">ไฟล์จะถูกอัปโหลดพร้อมกับการสร้างงาน</p>}
              </div>

              {error && <p className="rounded-xl text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2">{error}</p>}
            </div>

            <div className="sticky bottom-0 px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-slate-900">
              <button type="submit" disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white shadow-sm transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#22c55e,#6366f1)' }}>
                {isSubmitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{uploading ? 'กำลังอัปโหลดไฟล์...' : 'กำลังสร้างงาน...'}</>
                  : <><Plus className="w-4 h-4" />สร้างงาน / มอบหมาย</>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
