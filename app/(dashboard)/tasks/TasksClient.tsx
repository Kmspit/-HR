'use client'

import { useState, useTransition, useMemo, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Clock, CheckCircle, AlertCircle,
  RotateCcw, Eye, Loader2, ClipboardList,
  ExternalLink, MessageSquare, Paperclip, Upload,
  FileText, Download, Trash2, File, Building2,
  Calendar, MapPin, User2,
  LayoutGrid, List, Square, CheckSquare, Send,
  Ban, XCircle, ChevronDown, ChevronRight, SlidersHorizontal,
  Search, History,
} from 'lucide-react'
import { apiJson } from '@/lib/client-api'
import { getOverdueInfo, getSeverityBadgeClass } from '@/lib/task-sla'

// ── Types ────────────────────────────────────────────────────────────────────

type UserSnip = {
  id: string
  name: string
  department: string | null
  employeeId: string | null
  role: string
}

type TaskAttachment = {
  id: string
  fileName: string
  fileUrl: string
  publicId: string
  fileType: string
  fileSize: number | null
  createdAt: string
  uploadedBy: { id: string; name: string }
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
  attachments: TaskAttachment[]
  assignee: UserSnip
  assignedBy: UserSnip
  // Phase 1 — department workflow
  caseNumber: string | null
  clientName: string | null
  taskDepartment: string | null
  appointmentDate: string | null
  courtDate: string | null
  appointmentPlace: string | null
  // Phase 2 — comments + checklist (loaded on detail view)
  comments?: TaskCommentItem[]
  checklist?: ChecklistItem[]
  timeline?: TaskTimelineEntry[]
  // Phase 2 — SLA fields
  dueTime: string | null
  slaHours: number | null
  slaDeadline: string | null
  // Phase 3 — Template & dependency
  templateId: string | null
  debtorId: string | null
  rejectedCount: number
  isBlocked?: boolean
}

type TaskLink     = { label: string; url: string }
type ProgressNote = { note: string; timestamp: string; userId: string; userName: string }

type CommentUser  = { id: string; name: string; role: string }
type CommentReply = { id: string; content: string; parentId: string; createdAt: string; updatedAt: string; user: CommentUser }
type TaskCommentItem = { id: string; content: string; parentId: string | null; createdAt: string; updatedAt: string; user: CommentUser; replies: CommentReply[] }

type ChecklistItem = {
  id: string
  title: string
  isCompleted: boolean
  order: number
  completedAt: string | null
  completedBy: { id: string; name: string } | null
}

type TaskTimelineEntry = {
  id: string
  action: string
  description: string
  meta: string | null
  createdAt: string
  user: { id: string; name: string; role: string }
}

type TaskTemplate = {
  id: string
  name: string
  description: string | null
  category: string
  taskType: string | null
  priority: string
  defaultSlaHours: number | null
  defaultChecklist: string
  defaultAssigneeRole: string | null
  department: string | null
  notes: string | null
  createdBy: { id: string; name: string }
}

type WorkloadInfo = {
  userId: string
  activeCount: number
  overdueCount: number
  score: number
  status: 'LOW' | 'NORMAL' | 'HIGH' | 'OVERLOADED'
  statusLabel: string
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

// ── Department constants ──────────────────────────────────────────────────────

const DEPT_OPTIONS = [
  { value: '',         label: 'ทั่วไป (ไม่ระบุฝ่าย)' },
  { value: 'DEBT',     label: 'ฝ่ายเร่งรัดหนี้' },
  { value: 'LAW',      label: 'ฝ่ายกฎหมาย' },
  { value: 'ASSET',    label: 'ฝ่ายสืบทรัพย์' },
  { value: 'ENFORCE',  label: 'ฝ่ายบังคับคดี' },
] as const

const DEPT_LABEL: Record<string, string> = {
  DEBT:    'ฝ่ายเร่งรัดหนี้',
  LAW:     'ฝ่ายกฎหมาย',
  ASSET:   'ฝ่ายสืบทรัพย์',
  ENFORCE: 'ฝ่ายบังคับคดี',
}

const DEPT_COLOR: Record<string, string> = {
  DEBT:    'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20',
  LAW:     'text-blue-700   dark:text-blue-400   bg-blue-50   dark:bg-blue-500/10   border-blue-200   dark:border-blue-500/20',
  ASSET:   'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20',
  ENFORCE: 'text-red-700    dark:text-red-400    bg-red-50    dark:bg-red-500/10    border-red-200    dark:border-red-500/20',
}

const DEPT_TASK_OPTIONS: Record<string, { value: string; label: string }[]> = {
  DEBT: [
    { value: 'DEBT_CALL',   label: 'โทรติดตามลูกหนี้' },
    { value: 'DEBT_APPT',   label: 'นัดชำระหนี้' },
    { value: 'DEBT_DOC',    label: 'ติดตามเอกสาร' },
    { value: 'DEBT_REPORT', label: 'รายงานติดตาม' },
    { value: 'OTHER',       label: 'อื่นๆ' },
  ],
  LAW: [
    { value: 'LEGAL_DRAFT',      label: 'จัดทำคำฟ้อง' },
    { value: 'LEGAL_FILE',       label: 'ยื่นฟ้อง' },
    { value: 'LEGAL_COURT_PREP', label: 'เตรียมเอกสารศาล' },
    { value: 'LEGAL_HEARING',    label: 'เข้าพิจารณาคดี' },
    { value: 'OTHER',            label: 'อื่นๆ' },
  ],
  ASSET: [
    { value: 'ASSET_CHECK',  label: 'ตรวจสอบทรัพย์' },
    { value: 'ASSET_SURVEY', label: 'สำรวจทรัพย์' },
    { value: 'ASSET_REPORT', label: 'จัดทำรายงานสืบทรัพย์' },
    { value: 'OTHER',        label: 'อื่นๆ' },
  ],
  ENFORCE: [
    { value: 'ENF_FILE',    label: 'ยื่นคำร้องบังคับคดี' },
    { value: 'ENF_SEIZE',   label: 'ติดตามยึดทรัพย์' },
    { value: 'ENF_SUMMARY', label: 'สรุปผลดำเนินงาน' },
    { value: 'OTHER',       label: 'อื่นๆ' },
  ],
  '': [
    { value: 'OFFICE',   label: 'งานสำนักงาน' },
    { value: 'FIELD',    label: 'งานภาคสนาม' },
    { value: 'LEGAL',    label: 'งานทนาย/บังคับคดี' },
    { value: 'DOCUMENT', label: 'งานเอกสาร' },
    { value: 'OTHER',    label: 'อื่นๆ' },
  ],
}

// ── Lookup maps ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING:          'รอมอบหมาย',
  NEW:              'รับเรื่องใหม่',
  ASSIGNED:         'มอบหมายแล้ว',
  IN_PROGRESS:      'กำลังดำเนินการ',
  WAITING_DOC:      'รอเอกสาร',
  WAITING_REVIEW:   'รอตรวจสอบ',
  WAITING_APPROVAL: 'รออนุมัติ',
  REVISION:         'แก้ไขงาน',
  REJECTED:         'ถูกปฏิเสธ',
  CANCELLED:        'ยกเลิกแล้ว',
  COMPLETED:        'เสร็จสิ้น',
  OVERDUE:          'เกินกำหนด',
}

const STATUS_CLS: Record<string, string> = {
  PENDING:          'text-slate-600  dark:text-slate-400  bg-slate-100  dark:bg-slate-500/10',
  NEW:              'text-slate-600  dark:text-slate-400  bg-slate-100  dark:bg-slate-500/10',
  ASSIGNED:         'text-teal-700   dark:text-teal-400   bg-teal-100   dark:bg-teal-500/10',
  IN_PROGRESS:      'text-blue-700   dark:text-blue-400   bg-blue-100   dark:bg-blue-500/10',
  WAITING_DOC:      'text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-500/10',
  WAITING_REVIEW:   'text-amber-700  dark:text-amber-400  bg-amber-100  dark:bg-amber-500/10',
  WAITING_APPROVAL: 'text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10',
  REVISION:         'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10',
  REJECTED:         'text-red-700    dark:text-red-400    bg-red-100    dark:bg-red-500/10',
  CANCELLED:        'text-slate-500  dark:text-slate-500  bg-slate-100  dark:bg-slate-500/10',
  COMPLETED:        'text-green-700  dark:text-green-400  bg-green-100  dark:bg-green-500/10',
  OVERDUE:          'text-red-700    dark:text-red-400    bg-red-100    dark:bg-red-500/10',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING:          <Clock className="w-3 h-3" />,
  NEW:              <Clock className="w-3 h-3" />,
  ASSIGNED:         <User2 className="w-3 h-3" />,
  IN_PROGRESS:      <Clock className="w-3 h-3" />,
  WAITING_DOC:      <FileText className="w-3 h-3" />,
  WAITING_REVIEW:   <Eye className="w-3 h-3" />,
  WAITING_APPROVAL: <Eye className="w-3 h-3" />,
  REVISION:         <RotateCcw className="w-3 h-3" />,
  REJECTED:         <XCircle className="w-3 h-3" />,
  CANCELLED:        <Ban className="w-3 h-3" />,
  COMPLETED:        <CheckCircle className="w-3 h-3" />,
  OVERDUE:          <AlertCircle className="w-3 h-3" />,
}

const TYPE_LABEL: Record<string, string> = {
  OFFICE:          'งานสำนักงาน',
  FIELD:           'งานภาคสนาม',
  LEGAL:           'งานทนาย/บังคับคดี',
  DOCUMENT:        'งานเอกสาร',
  OTHER:           'อื่นๆ',
  DEBT_CALL:       'โทรติดตามลูกหนี้',
  DEBT_APPT:       'นัดชำระหนี้',
  DEBT_DOC:        'ติดตามเอกสาร',
  DEBT_REPORT:     'รายงานติดตาม',
  LEGAL_DRAFT:     'จัดทำคำฟ้อง',
  LEGAL_FILE:      'ยื่นฟ้อง',
  LEGAL_COURT_PREP:'เตรียมเอกสารศาล',
  LEGAL_HEARING:   'เข้าพิจารณาคดี',
  ASSET_CHECK:     'ตรวจสอบทรัพย์',
  ASSET_SURVEY:    'สำรวจทรัพย์',
  ASSET_REPORT:    'จัดทำรายงานสืบทรัพย์',
  ENF_FILE:        'ยื่นคำร้องบังคับคดี',
  ENF_SEIZE:       'ติดตามยึดทรัพย์',
  ENF_SUMMARY:     'สรุปผลดำเนินงาน',
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
  if (['COMPLETED'].includes(task.status)) return false
  return new Date(task.dueDate) < new Date()
}

const ACTIVE_STATUSES = ['PENDING', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_DOC', 'REVISION', 'WAITING_APPROVAL']

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

function fmtFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(fileType: string): React.ReactNode {
  if (fileType.startsWith('image/')) return <File className="w-4 h-4 text-purple-500" />
  if (fileType === 'application/pdf') return <FileText className="w-4 h-4 text-red-500" />
  if (fileType.includes('word'))      return <FileText className="w-4 h-4 text-blue-500" />
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return <FileText className="w-4 h-4 text-green-600" />
  return <File className="w-4 h-4 text-slate-400" />
}

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg',
  'application/zip', 'application/x-zip-compressed',
].join(',')

// ── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CLS[status] ?? STATUS_CLS.PENDING}`}>
      {STATUS_ICON[status] ?? STATUS_ICON.PENDING}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── DeptBadge ─────────────────────────────────────────────────────────────────

function DeptBadge({ dept }: { dept: string | null }) {
  if (!dept) return null
  const cls = DEPT_COLOR[dept] ?? 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-500/10 border-slate-200 dark:border-slate-500/20'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cls}`}>
      <Building2 className="w-2.5 h-2.5" />
      {DEPT_LABEL[dept] ?? dept}
    </span>
  )
}

// ── OverdueSeverityBadge ──────────────────────────────────────────────────────

function OverdueSeverityBadge({ task }: { task: Task }) {
  const info = getOverdueInfo(task.dueDate, task.status)
  if (!info.isOverdue) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${getSeverityBadgeClass(info.severity)}`}>
      <AlertCircle className="w-2.5 h-2.5" />{info.label}
    </span>
  )
}

// ── BlockedBadge — shown when task has unresolved dependencies ───────────────

function BlockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
      🔒 รอ
    </span>
  )
}

// ── WorkloadBadge — capacity indicator ────────────────────────────────────────

const WORKLOAD_CLS: Record<string, string> = {
  LOW:        'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20',
  NORMAL:     'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
  HIGH:       'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20',
  OVERLOADED: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
}

// ── AttachmentItem ────────────────────────────────────────────────────────────

function AttachmentItem({
  att, canDelete, onDelete, isDeleting,
}: {
  att: TaskAttachment
  canDelete: boolean
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] group">
      <div className="flex-shrink-0">{fileIcon(att.fileType)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{att.fileName}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          {fmtFileSize(att.fileSize)}{att.fileSize ? ' · ' : ''}{att.uploadedBy.name} · {fmtDate(att.createdAt)}
        </p>
      </div>
      <a href={att.fileUrl} target="_blank" rel="noopener noreferrer"
        className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors" title="เปิดไฟล์">
        <Download className="w-3.5 h-3.5" />
      </a>
      {canDelete && (
        <button type="button" disabled={isDeleting} onClick={onDelete}
          className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40" title="ลบไฟล์">
          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}

// ── FileUploadZone ────────────────────────────────────────────────────────────

function FileUploadZone({
  pendingFiles, onFilesAdded, onRemove, uploading,
}: {
  pendingFiles: File[]
  onFilesAdded: (files: File[]) => void
  onRemove: (idx: number) => void
  uploading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFilesAdded(files)
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10'
                   : 'border-slate-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40 bg-slate-50 dark:bg-white/[0.02]'}`}
      >
        <Upload className="w-5 h-5 mx-auto mb-1.5 text-slate-400 dark:text-slate-500" />
        <p className="text-[12px] font-medium text-slate-600 dark:text-slate-400">
          ลากไฟล์มาวาง หรือ <span className="text-blue-600 dark:text-blue-400">คลิกเลือกไฟล์</span>
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">PDF, Word, Excel, PNG, JPG, ZIP · สูงสุด 20 MB</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPTED_FILE_TYPES} className="hidden"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFilesAdded(f); e.target.value = '' }}
          disabled={uploading} />
      </div>
      {pendingFiles.length > 0 && (
        <div className="space-y-1.5">
          {pendingFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
              <div className="flex-shrink-0">{fileIcon(f.type)}</div>
              <span className="flex-1 text-[13px] text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
              <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtFileSize(f.size)}</span>
              <button type="button" disabled={uploading} onClick={() => onRemove(i)}
                className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-red-500 disabled:opacity-40">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
          {items.length > 0 && <span className="rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 text-[10px] font-bold">{done}/{items.length}</span>}
        </p>
      </div>
      {items.length > 0 && (
        <>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 mb-3 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="space-y-1.5 mb-3">
            {items.map((item) => (
              <div key={item.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 border transition-colors ${item.isCompleted ? 'bg-green-50 dark:bg-green-500/[0.06] border-green-100 dark:border-green-500/20' : 'bg-slate-50 dark:bg-white/[0.03] border-slate-100 dark:border-white/[0.05]'}`}>
                <button type="button" disabled={loading === item.id} onClick={() => toggleItem(item)}
                  className="flex-shrink-0 text-slate-400 hover:text-blue-500 transition-colors disabled:opacity-40">
                  {loading === item.id
                    ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    : item.isCompleted
                      ? <CheckSquare className="w-4 h-4 text-green-500" />
                      : <Square className="w-4 h-4" />
                  }
                </button>
                <span className={`flex-1 text-[13px] ${item.isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{item.title}</span>
                {item.completedBy && (
                  <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{item.completedBy.name}</span>
                )}
                <button type="button" onClick={() => deleteItem(item.id)} disabled={loading === item.id}
                  className="flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors disabled:opacity-40">
                  <X className="w-3 h-3" />
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
          className="flex-1 rounded-xl px-3 py-2 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400/60" />
        <button type="button" disabled={adding || !newTitle.trim()} onClick={addItem}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 transition-colors disabled:opacity-40">
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
        {comments.length > 0 && <span className="rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 text-[10px] font-bold">{comments.length}</span>}
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
                  <span className="text-[10px] text-slate-400">{fmtRelative(c.createdAt)}</span>
                  {c.user.id === currentUserId && (
                    <button type="button" disabled={deleting === c.id} onClick={() => deleteComment(c.id)}
                      className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-40">
                      {deleting === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{c.content}</p>
              <button type="button" onClick={() => setReplyTo(replyingTo === c.id ? null : c.id)}
                className="mt-1 text-[11px] text-blue-500 hover:text-blue-600 transition-colors">
                ตอบกลับ
              </button>
            </div>

            {/* Replies */}
            {c.replies && c.replies.length > 0 && (
              <div className="ml-5 mt-1.5 space-y-1.5">
                {c.replies.map((r) => (
                  <div key={r.id} className="rounded-xl bg-blue-50/50 dark:bg-blue-500/[0.04] border border-blue-100 dark:border-blue-500/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{r.user.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400">{fmtRelative(r.createdAt)}</span>
                        {r.user.id === currentUserId && (
                          <button type="button" disabled={deleting === r.id} onClick={() => deleteComment(r.id)}
                            className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-40">
                            {deleting === r.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Reply input */}
            {replyingTo === c.id && (
              <div className="ml-5 mt-1.5 flex gap-2">
                <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(replyText, c.id) } }}
                  placeholder={`ตอบกลับ ${c.user.name}...`}
                  className="flex-1 rounded-xl px-3 py-2 text-[12px] bg-white dark:bg-white/5 border border-blue-200 dark:border-blue-500/25 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none" />
                <button type="button" disabled={posting || !replyText.trim()} onClick={() => postComment(replyText, c.id)}
                  className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl text-blue-600 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 transition-colors disabled:opacity-40">
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New comment */}
      <div className="flex gap-2">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="เพิ่มความคิดเห็น..."
          className="flex-1 rounded-xl px-3 py-2 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:border-blue-400/60" />
        <button type="button" disabled={posting || !text.trim()} onClick={() => postComment(text)}
          className="flex-shrink-0 self-end flex h-9 w-9 items-center justify-center rounded-xl text-blue-600 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 transition-colors disabled:opacity-40">
          {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}

// ── Timeline Section ──────────────────────────────────────────────────────────

const TIMELINE_ACTION_ICON: Record<string, React.ReactNode> = {
  created:              <Plus className="w-3 h-3 text-blue-500" />,
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
        <History className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-[13px] text-slate-400 dark:text-slate-600">ยังไม่มีประวัติการดำเนินงาน</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <History className="w-3 h-3" />ประวัติการดำเนินงาน ({entries.length})
      </p>
      <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-1 before:bottom-1 before:w-px before:bg-slate-200 dark:before:bg-white/[0.06]">
        {entries.map((entry) => (
          <div key={entry.id} className="relative">
            <div className="absolute -left-[15px] top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08]">
              {TIMELINE_ACTION_ICON[entry.action] ?? <History className="w-3 h-3 text-slate-400" />}
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{entry.user.name}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
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

function TaskDetailModal({ task, role, userId, onClose, onUpdated }: DetailModalProps) {
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

  // Load checklist + comments on first open
  useEffect(() => {
    if (loadedDetail) return
    setLoadedDetail(true)
    fetch(`/api/tasks/${task.id}`).then(r => r.json()).then((d: { task?: Task }) => {
      if (d.task?.checklist) setChecklist(d.task.checklist)
      if (d.task?.comments) setComments(d.task.comments)
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
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal className="fixed z-50 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4">
        <div className="relative w-full md:max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[90vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}>

          {/* Handle */}
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Header */}
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
            <button type="button" onClick={onClose}
              className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Detail tabs */}
          <div className="flex-shrink-0 flex gap-1 px-5 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            {([
              { id: 'info' as const,      label: 'ข้อมูล' },
              { id: 'checklist' as const, label: `รายการ${checklist.length > 0 ? ` (${checklist.filter(i => i.isCompleted).length}/${checklist.length})` : ''}` },
              { id: 'comments' as const,  label: `ความคิดเห็น${comments.length > 0 ? ` (${comments.length})` : ''}` },
              { id: 'timeline' as const,  label: 'ประวัติ' },
            ]).map((t) => (
              <button key={t.id} type="button" onClick={() => setDetailTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${detailTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

            {detailTab === 'checklist' && (
              <ChecklistSection taskId={task.id} initial={checklist} currentUserId={userId} />
            )}

            {detailTab === 'comments' && (
              <CommentsSection taskId={task.id} initial={comments} currentUserId={userId} />
            )}

            {detailTab === 'timeline' && (
              <TimelineSection taskId={task.id} />
            )}

            {detailTab === 'info' && <>

            {/* Status + priority */}
            <div className="flex flex-wrap gap-2 items-center">
              <StatusBadge status={eff} />
              <span className={`text-[12px] font-medium ${PRIORITY_TEXT[task.priority] ?? 'text-slate-500'}`}>
                {PRIORITY_LABEL[task.priority] ?? task.priority}
              </span>
              <OverdueSeverityBadge task={task} />
              {task.isBlocked && <BlockedBadge />}
            </div>

            {/* Info grid */}
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

            {/* Appointment / Court dates */}
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

            {/* Links */}
            {links.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">ลิงก์ที่เกี่ยวข้อง</p>
                <div className="space-y-1.5">
                  {links.map((lk, i) => (
                    <a key={i} href={lk.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors group">
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-60 group-hover:opacity-100" />
                      <span className="flex-1 truncate">{lk.label || lk.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Paperclip className="w-3 h-3" />ไฟล์แนบ
                {attachments.length > 0 && (
                  <span className="rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 text-[10px] font-bold">{attachments.length}</span>
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
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50">
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
              <div className="rounded-xl bg-blue-50 dark:bg-blue-500/[0.07] border border-blue-100 dark:border-blue-500/15 px-4 py-3">
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">ผลงานที่ส่ง</p>
                <p className="text-[13px] text-blue-800 dark:text-blue-300">{task.resultNote}</p>
                {task.submittedAt && <p className="text-[10px] text-blue-500 dark:text-blue-400/60 mt-1">ส่งเมื่อ {fmtDate(task.submittedAt)}</p>}
              </div>
            )}

            {/* Timeline / progress notes */}
            {noteHist.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" />ประวัติการอัปเดต
                </p>
                <div className="relative pl-4 space-y-2 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-slate-200 dark:before:bg-white/[0.06]">
                  {noteHist.map((n, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-[11px] top-2 w-2 h-2 rounded-full bg-blue-400 dark:bg-blue-500 ring-2 ring-white dark:ring-slate-900" />
                      <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{n.userName}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">{fmtDateTime(n.timestamp)}</span>
                        </div>
                        <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{n.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add progress note */}
            {canAct && isWorkable && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">เพิ่มบันทึก</p>
                <div className="flex gap-2">
                  <textarea rows={2} value={progressInput} onChange={(e) => setProgress(e.target.value)}
                    placeholder="บันทึกความคืบหน้า..."
                    className="flex-1 rounded-xl px-3 py-2 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-400/60" />
                  <button type="button" disabled={isPending || !progressInput.trim()}
                    onClick={() => { if (!progressInput.trim()) return; patch({ progressNote: progressInput.trim() }); setProgress('') }}
                    className="flex-shrink-0 self-end flex items-center justify-center rounded-xl px-3 py-2 text-[12px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 transition-colors disabled:opacity-40">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'บันทึก'}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="rounded-xl text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2">{error}</p>}

            {/* ── Employee actions ── */}
            {isAssignee && isWorkable && (
              <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-1">อัปเดตงาน</p>

                {/* Start work */}
                {canStart && (
                  <button type="button" disabled={isPending} onClick={() => patch({ status: 'IN_PROGRESS' })}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 transition-colors disabled:opacity-50">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    รับงาน / เริ่มทำ
                  </button>
                )}

                {/* Working */}
                {canWork && (
                  <div className="space-y-2">
                    <textarea rows={3} value={resultNote} onChange={(e) => setResultNote(e.target.value)}
                      placeholder="รายละเอียดผลงาน / สิ่งที่ทำเสร็จแล้ว..."
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:border-blue-400/60" />
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
                          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/25 hover:bg-blue-100 transition-colors disabled:opacity-50">
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

            {/* ── Reviewer actions ── */}
            {isReviewer && (task.status === 'WAITING_REVIEW' || task.status === 'WAITING_APPROVAL') && (
              <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-1">ตรวจงาน</p>
                <textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="หมายเหตุ (ไม่บังคับ)..."
                  className="w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none focus:outline-none focus:border-blue-400/60" />
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

            {/* ── Cancel action (creator or admin) ── */}
            {(isAssigner || isFullAdmin) && isWorkable && (
              <div className="pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                <button type="button" disabled={isPending} onClick={() => { if (confirm('ยืนยันยกเลิกงานนี้?')) patch({ status: 'CANCELLED' }) }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors disabled:opacity-50">
                  <Ban className="w-3.5 h-3.5" />
                  ยกเลิกงาน
                </button>
              </div>
            )}

            </> /* end detailTab === 'info' */}
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

// ── Create Task Modal ─────────────────────────────────────────────────────────

type CreateModalProps = {
  employees: UserSnip[]
  assignerName: string
  onClose: () => void
  onCreated: (t: Task) => void
  templates?: TaskTemplate[]
  workloadMap?: Record<string, WorkloadInfo>
}

function CreateTaskModal({ employees, assignerName, onClose, onCreated, templates = [], workloadMap = {} }: CreateModalProps) {
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
  const [checklistItems,   setChecklistItems] = useState<string[]>([])
  const [dueTime,          setDueTime]        = useState('')

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-[13px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-400/60'

  const taskTypeOptions = DEPT_TASK_OPTIONS[taskDepartment] ?? DEPT_TASK_OPTIONS['']

  function applyTemplate(tpl: TaskTemplate) {
    if (tpl.description)    setDesc(tpl.description)
    if (tpl.taskType)       setType(tpl.taskType)
    if (tpl.priority)       setPriority(tpl.priority)
    if (tpl.department)     { setDept(tpl.department); setType(tpl.taskType ?? (DEPT_TASK_OPTIONS[tpl.department]?.[0]?.value ?? 'OFFICE')) }
    if (tpl.notes)          setNotes(tpl.notes)
    if (tpl.defaultSlaHours) { /* slaHours not in current state — skip */ }
    try {
      const items: { title: string }[] = JSON.parse(tpl.defaultChecklist)
      if (items.length > 0) setChecklistItems(items.map((i) => i.title))
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
          taskLinks:        cleanLinks.length > 0 ? cleanLinks : undefined,
          checklist:        checklistItems.filter(t => t.trim()).map(t => ({ title: t.trim() })),
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
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal className="fixed z-50 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4">
        <div className="relative w-full md:max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[92vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}>

          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">สร้างงาน / รับเรื่อง</h2>
            <button type="button" onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 py-4 space-y-4">

              {/* Template picker */}
              {templates.length > 0 && (
                <div className="rounded-xl border border-dashed border-blue-300 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/[0.04] px-3 py-2.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5" />
                      {selectedTemplateId ? `เทมเพลต: ${templates.find(t => t.id === selectedTemplateId)?.name ?? ''}` : 'สร้างจากเทมเพลต (ไม่บังคับ)'}
                    </p>
                    <button type="button" onClick={() => setShowTemplatePicker(v => !v)}
                      className="text-[11px] text-blue-600 dark:text-blue-400 font-medium hover:underline">
                      {showTemplatePicker ? 'ซ่อน' : selectedTemplateId ? 'เปลี่ยน' : 'เลือก'}
                    </button>
                  </div>
                  {showTemplatePicker && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {templates.map((tpl) => (
                        <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl)}
                          className="w-full text-left rounded-lg px-3 py-2 text-[12px] hover:bg-blue-100 dark:hover:bg-blue-500/15 transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-500/30">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{tpl.name}</p>
                          {tpl.description && <p className="text-slate-500 dark:text-slate-400 truncate text-[11px]">{tpl.description}</p>}
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            {tpl.department && <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 border ${DEPT_COLOR[tpl.department] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>{DEPT_LABEL[tpl.department] ?? tpl.department}</span>}
                            <span className="text-[10px] text-slate-400">{PRIORITY_LABEL[tpl.priority]}</span>
                            {tpl.defaultSlaHours && <span className="text-[10px] text-slate-400">SLA {tpl.defaultSlaHours}h</span>}
                            {tpl.defaultChecklist !== '[]' && (() => { try { return JSON.parse(tpl.defaultChecklist).length } catch { return 0 } })() > 0 && (
                              <span className="text-[10px] text-slate-400">✓ {(() => { try { return JSON.parse(tpl.defaultChecklist).length } catch { return 0 } })()} รายการ</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Case + client */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">เลขคดี / รหัสงาน</label>
                  <input type="text" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)}
                    placeholder="เช่น KM-2024-001" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ชื่อลูกค้า</label>
                  <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                    placeholder="ชื่อลูกค้า / เจ้าหนี้" className={inputCls} />
                </div>
              </div>

              {/* Department + task type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ฝ่าย <span className="text-red-500">*</span></label>
                  <select value={taskDepartment} onChange={(e) => handleDeptChange(e.target.value)} className={inputCls}>
                    {DEPT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ประเภทงาน <span className="text-red-500">*</span></label>
                  <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                    {taskTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">
                  ชื่องาน / รายละเอียดสั้น <span className="text-red-500">*</span>
                </label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="ระบุชื่องาน..." className={inputCls} />
              </div>

              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">รายละเอียดงาน</label>
                <textarea rows={3} value={description} onChange={(e) => setDesc(e.target.value)}
                  placeholder="อธิบายรายละเอียดงาน..." className={`${inputCls} resize-none`} />
              </div>

              {/* Assignee + priority */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ผู้รับผิดชอบ <span className="text-red-500">*</span></label>
                  <select value={assigneeId} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
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
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ความสำคัญ</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                    <option value="LOW">⚪ ต่ำ</option>
                    <option value="MEDIUM">🟡 ปานกลาง</option>
                    <option value="HIGH">🟠 สูง</option>
                    <option value="URGENT">🔴 เร่งด่วน</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">ผู้มอบหมาย</label>
                <div className={`${inputCls} text-slate-400 dark:text-slate-500 cursor-not-allowed`}>{assignerName}</div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">วันเริ่มงาน</label>
                  <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">กำหนดเสร็จ <span className="text-red-500">*</span></label>
                  <input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">เวลากำหนดส่ง</label>
                  <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Appointment + court dates */}
              <div className="rounded-xl bg-amber-50/60 dark:bg-amber-500/[0.05] border border-amber-100 dark:border-amber-500/15 px-4 py-3 space-y-3">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />วันนัดหมาย (ถ้ามี)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">วันนัดหมาย</label>
                    <input type="date" value={appointmentDate} onChange={(e) => setApptDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">วันนัดศาล</label>
                    <input type="date" value={courtDate} onChange={(e) => setCourtDate(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">สถานที่นัด</label>
                  <input type="text" value={appointmentPlace} onChange={(e) => setApptPlace(e.target.value)}
                    placeholder="สถานที่ / ศาล / สำนักงาน..." className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-1.5">หมายเหตุ</label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="หมายเหตุเพิ่มเติม..." className={`${inputCls} resize-none`} />
              </div>

              {/* Links */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] text-slate-500 dark:text-slate-400">แนบลิงก์งาน</label>
                  <button type="button" onClick={() => setLinks((p) => [...p, { label: '', url: '' }])}
                    className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
                    <Plus className="w-3.5 h-3.5" />เพิ่มลิงก์
                  </button>
                </div>
                {links.length > 0 && (
                  <div className="space-y-2">
                    {links.map((lk, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1.5">
                          <input type="text" value={lk.label}
                            onChange={(e) => setLinks((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                            placeholder="ชื่อลิงก์ (ไม่บังคับ)" className={inputCls} />
                          <input type="url" value={lk.url}
                            onChange={(e) => setLinks((p) => p.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x))}
                            placeholder="https://..." className={inputCls} />
                        </div>
                        <button type="button" onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))}
                          className="flex-shrink-0 mt-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5" />รายการตรวจสอบ (ไม่บังคับ)
                  </label>
                  <button type="button" onClick={() => setChecklistItems((p) => [...p, ''])}
                    className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">
                    <Plus className="w-3.5 h-3.5" />เพิ่ม
                  </button>
                </div>
                {checklistItems.length > 0 && (
                  <div className="space-y-1.5">
                    {checklistItems.map((item, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Square className="w-3.5 h-3.5 flex-shrink-0 text-slate-300 dark:text-slate-600" />
                        <input type="text" value={item}
                          onChange={(e) => setChecklistItems((p) => p.map((x, idx) => idx === i ? e.target.value : x))}
                          placeholder={`รายการที่ ${i + 1}...`} className={`flex-1 ${inputCls}`} />
                        <button type="button" onClick={() => setChecklistItems((p) => p.filter((_, idx) => idx !== i))}
                          className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-red-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Files */}
              <div>
                <label className="block text-[12px] text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />แนบไฟล์งาน
                </label>
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
                style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
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

// ── Kanban Board ──────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { id: 'queue',    label: 'รับเรื่อง',        statuses: ['PENDING', 'NEW', 'ASSIGNED'],         color: 'border-slate-300 dark:border-slate-600', dot: 'bg-slate-400' },
  { id: 'active',   label: 'กำลังดำเนินการ',   statuses: ['IN_PROGRESS', 'WAITING_DOC'],          color: 'border-blue-400 dark:border-blue-500',   dot: 'bg-blue-500' },
  { id: 'review',   label: 'รอตรวจ / อนุมัติ', statuses: ['WAITING_REVIEW', 'WAITING_APPROVAL'],  color: 'border-amber-400 dark:border-amber-500',  dot: 'bg-amber-500' },
  { id: 'done',     label: 'เสร็จสิ้น',         statuses: ['COMPLETED'],                          color: 'border-green-400 dark:border-green-500',  dot: 'bg-green-500' },
] as const

function KanbanBoard({ tasks, onSelect }: { tasks: Task[]; onSelect: (t: Task) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {KANBAN_COLS.map((col) => {
        const colTasks = tasks.filter((t) => col.statuses.includes(t.status as never) || (col.id === 'active' && isOverdue(t) && col.statuses.includes(t.status as never)))
        const overdueCount = colTasks.filter(isOverdue).length
        return (
          <div key={col.id} className={`rounded-2xl border-2 ${col.color} bg-white dark:bg-slate-900/60 overflow-hidden`}>
            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{col.label}</span>
              </div>
              <span className="text-[11px] text-slate-400">{colTasks.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[120px]">
              {colTasks.length === 0 && (
                <p className="text-center text-[11px] text-slate-400 dark:text-slate-600 py-4">ไม่มีงาน</p>
              )}
              {colTasks.map((task) => {
                const overdue = isOverdue(task)
                return (
                  <button key={task.id} type="button" onClick={() => onSelect(task)}
                    className={`w-full text-left rounded-xl border p-2.5 hover:shadow-md transition-all active:scale-[0.98] ${overdue ? 'border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/[0.05]' : 'border-slate-100 dark:border-white/[0.05] bg-white dark:bg-slate-800/60'}`}>
                    {task.caseNumber && (
                      <p className="text-[10px] font-mono font-bold text-slate-400 mb-0.5">{task.caseNumber}</p>
                    )}
                    <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {task.taskDepartment && <DeptBadge dept={task.taskDepartment} />}
                      <span className={`text-[10px] ${PRIORITY_TEXT[task.priority] ?? ''}`}>{PRIORITY_LABEL[task.priority]}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-slate-400 truncate">{task.assignee.name}</span>
                      {task.dueDate && (
                        <span className={`text-[10px] ${overdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                          {fmtDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                    {overdue && <span className="mt-1 inline-block text-[10px] font-bold text-red-600 dark:text-red-400">⚠️ เกินกำหนด</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
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
    { label: 'ทั้งหมด',       val: s.total,    icon: <ClipboardList className="w-4 h-4" />, color: 'text-slate-700 dark:text-slate-200',  bg: 'bg-white dark:bg-slate-900/60',     border: 'border-slate-200 dark:border-white/[0.07]' },
    { label: 'กำลังดำเนินการ', val: s.progress, icon: <Clock         className="w-4 h-4" />, color: 'text-blue-700  dark:text-blue-400',   bg: 'bg-blue-50   dark:bg-blue-500/10',  border: 'border-blue-200  dark:border-blue-500/20'  },
    { label: 'รอตรวจ',        val: s.review,   icon: <Eye           className="w-4 h-4" />, color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-50  dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
    { label: 'เสร็จสิ้น',     val: s.done,     icon: <CheckCircle   className="w-4 h-4" />, color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50  dark:bg-green-500/10', border: 'border-green-200 dark:border-green-500/20' },
    { label: 'เกินกำหนด',     val: s.overdue,  icon: <AlertCircle   className="w-4 h-4" />, color: 'text-red-700   dark:text-red-400',    bg: 'bg-red-50    dark:bg-red-500/10',   border: 'border-red-200   dark:border-red-500/20'   },
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
  task, showAssigner, onClick,
}: {
  task: Task
  showAssigner: boolean
  onClick: () => void
}) {
  const eff    = effectiveStatus(task)
  const overdue = isOverdue(task)

  return (
    <tr onClick={onClick}
      className={`border-b border-slate-100 dark:border-white/[0.04] hover:bg-blue-50/60 dark:hover:bg-white/[0.03] transition-colors cursor-pointer ${overdue ? 'bg-red-50/40 dark:bg-red-500/[0.03]' : ''}`}>

      {/* เลขคดี / ชื่องาน */}
      <td className="px-4 py-3 max-w-[160px]">
        {task.caseNumber && (
          <p className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 mb-0.5">{task.caseNumber}</p>
        )}
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug truncate">{task.title}</p>
        {task.clientName && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate flex items-center gap-0.5 mt-0.5">
            <User2 className="w-2.5 h-2.5 flex-shrink-0" />{task.clientName}
          </p>
        )}
        {task.attachments.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 mt-0.5">
            <Paperclip className="w-2.5 h-2.5" />{task.attachments.length}
          </span>
        )}
      </td>

      {/* ฝ่าย */}
      <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
        {task.taskDepartment
          ? <DeptBadge dept={task.taskDepartment} />
          : <span className="text-[12px] text-slate-400 dark:text-slate-600">—</span>
        }
      </td>

      {/* ประเภทงาน */}
      <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
        <span className="text-[12px] text-slate-500 dark:text-slate-400">{TYPE_LABEL[task.type] ?? task.type}</span>
      </td>

      {/* ผู้รับผิดชอบ / มอบหมายโดย */}
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-[13px] text-slate-700 dark:text-slate-300">
          {showAssigner ? task.assignedBy.name : task.assignee.name}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{task.assignee.department ?? ''}</p>
      </td>

      {/* สถานะ */}
      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={eff} /></td>

      {/* กำหนดส่ง */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`text-[12px] ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
          {fmtDate(task.dueDate)}
        </span>
        {overdue && <OverdueSeverityBadge task={task} />}
        {task.isBlocked && <BlockedBadge />}
        {(task.courtDate || task.appointmentDate) && (
          <p className="text-[10px] text-amber-500 dark:text-amber-400 flex items-center gap-0.5 mt-0.5">
            <Calendar className="w-2.5 h-2.5" />
            {fmtDate(task.courtDate ?? task.appointmentDate)}
          </p>
        )}
      </td>

      <td className="px-3 py-3 text-slate-300 dark:text-slate-600 text-[10px]">›</td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TasksClient({
  role, userId, userName,
  myTasks: initMy, assignedByMeTasks: initByMe, allTasks: initAll,
  employees, canAssign, canSeeAll,
}: Props) {
  const router = useRouter()
  type TabId = 'my' | 'by_me' | 'all'
  type ViewMode = 'list' | 'kanban'

  const [tab,          setTab]        = useState<TabId>('my')
  const [filter,       setFilter]     = useState('all')
  const [deptFilter,   setDeptFilter] = useState('all')
  const [viewMode,     setViewMode]   = useState<ViewMode>('list')
  const [showDeptFilter, setShowDeptFilter] = useState(false)
  const [search,       setSearch]     = useState('')
  const [smartFilter,  setSmartFilter] = useState('all') // all|overdue|high|today|week
  const [myTasks,    setMyTasks]  = useState<Task[]>(initMy)
  const [byMeTasks,  setByMe]     = useState<Task[]>(initByMe)
  const [allList,    setAll]      = useState<Task[]>(initAll)
  const [showCreate, setCreate]   = useState(false)
  const [selected,   setSelected] = useState<Task | null>(null)
  const [templates,  setTemplates] = useState<TaskTemplate[]>([])
  const [workloadMap, setWorkloadMap] = useState<Record<string, WorkloadInfo>>({})

  useEffect(() => {
    if (!canAssign) return
    fetch('/api/tasks/templates').then(r => r.json()).then((d: { templates?: TaskTemplate[] }) => {
      if (d.templates) setTemplates(d.templates)
    }).catch(() => {})
    fetch('/api/tasks/workload').then(r => r.json()).then((d: { workload?: WorkloadInfo[] }) => {
      if (d.workload) {
        const map: Record<string, WorkloadInfo> = {}
        d.workload.forEach((w) => { map[w.userId] = w })
        setWorkloadMap(map)
      }
    }).catch(() => {})
  }, [canAssign])

  const currentList = tab === 'my' ? myTasks : tab === 'by_me' ? byMeTasks : allList

  const filtered = useMemo(() => {
    let list = currentList
    if (deptFilter !== 'all') list = list.filter((t) => t.taskDepartment === deptFilter)
    if (filter === 'overdue')   list = list.filter(isOverdue)
    else if (filter === 'active')    list = list.filter((t) => ACTIVE_STATUSES.includes(t.status) && !isOverdue(t))
    else if (filter === 'review')    list = list.filter((t) => t.status === 'WAITING_REVIEW')
    else if (filter === 'completed') list = list.filter((t) => t.status === 'COMPLETED')

    // Smart filters
    const nowTs = Date.now()
    if (smartFilter === 'overdue') list = list.filter(isOverdue)
    else if (smartFilter === 'high') list = list.filter((t) => ['HIGH', 'URGENT'].includes(t.priority) && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(t.status))
    else if (smartFilter === 'today') {
      list = list.filter((t) => {
        if (!t.dueDate) return false
        const d = new Date(t.dueDate)
        const nd = new Date()
        return d.getFullYear() === nd.getFullYear() && d.getMonth() === nd.getMonth() && d.getDate() === nd.getDate()
      })
    } else if (smartFilter === 'week') {
      list = list.filter((t) => {
        if (!t.dueDate) return false
        const ms = new Date(t.dueDate).getTime() - nowTs
        return ms >= 0 && ms <= 7 * 24 * 60 * 60 * 1000
      })
    }

    // Full-text search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.caseNumber?.toLowerCase() ?? '').includes(q) ||
        (t.clientName?.toLowerCase() ?? '').includes(q) ||
        t.assignee.name.toLowerCase().includes(q)
      )
    }

    return list
  }, [currentList, filter, deptFilter, smartFilter, search])

  function applyUpdate(updated: Task) {
    const apply = (list: Task[]) => list.map((t) => (t.id === updated.id ? updated : t))
    setMyTasks(apply); setByMe(apply); setAll(apply)
    setSelected(updated)
    router.refresh()
  }

  function handleCreated(task: Task) {
    setByMe((p) => [task, ...p]); setAll((p) => [task, ...p])
    if (task.assigneeId === userId) setMyTasks((p) => [task, ...p])
    setCreate(false); router.refresh()
  }

  const tabs = [
    { id: 'my'    as TabId, label: 'งานของฉัน',     count: myTasks.length,   show: true },
    { id: 'by_me' as TabId, label: 'มอบหมายโดยฉัน', count: byMeTasks.length, show: canAssign },
    { id: 'all'   as TabId, label: 'ทุกงาน',        count: allList.length,   show: canSeeAll },
  ].filter((t) => t.show)

  const STATUS_TABS = [
    { id: 'all',       label: 'ทั้งหมด' },
    { id: 'active',    label: 'กำลังดำเนิน' },
    { id: 'review',    label: 'รอตรวจ' },
    { id: 'overdue',   label: 'เกินกำหนด' },
    { id: 'completed', label: 'เสร็จสิ้น' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 dark:text-white">มอบหมายงาน</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">จัดการ ติดตาม และมอบหมายงานแต่ละฝ่าย</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode switcher */}
          <div className="flex rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-slate-900">
            <button type="button" onClick={() => setViewMode('list')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`} title="มุมมองรายการ">
              <List className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setViewMode('kanban')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.05]'}`} title="มุมมองกระดาน">
              <LayoutGrid className="w-4 h-4" />
            </button>
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
      </div>

      <StatStrip tasks={currentList} />

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/[0.05]">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => { setTab(t.id); setFilter('all'); setDeptFilter('all') }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${
                tab === t.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.id ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Department filter — collapsible */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <button type="button" onClick={() => setShowDeptFilter(v => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-[12px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={14} />
            ตัวกรองฝ่าย
            {deptFilter !== 'all' && (
              <span className="rounded-full bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5">{DEPT_LABEL[deptFilter] ?? deptFilter}</span>
            )}
          </span>
          <ChevronDown size={14} className={`transition-transform ${showDeptFilter ? 'rotate-180' : ''}`} />
        </button>
        {showDeptFilter && (
          <div className="flex flex-wrap gap-2 px-4 pb-3 border-t border-slate-100 dark:border-white/[0.05] pt-2.5">
            {[{ value: 'all', label: 'ทุกฝ่าย' }, ...DEPT_OPTIONS.filter((d) => d.value)].map(({ value, label }) => (
              <button key={value} type="button" onClick={() => setDeptFilter(value)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors border ${
                  deptFilter === value
                    ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-transparent'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}>
                {value !== 'all' && <Building2 className="w-2.5 h-2.5 inline mr-1 -mt-0.5" />}
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหางาน, เลขคดี, ลูกค้า, พนักงาน..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400/60"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Smart filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { id: 'all',    label: 'ทั้งหมด' },
          { id: 'overdue', label: '🔴 เกินกำหนด' },
          { id: 'high',   label: '🟠 เร่งด่วน/สูง' },
          { id: 'today',  label: '📅 ครบวันนี้' },
          { id: 'week',   label: '📆 ครบสัปดาห์นี้' },
        ] as const).map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setSmartFilter(id)}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors border ${
              smartFilter === id
                ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04]'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/[0.05]">
        {STATUS_TABS.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            className={`flex-1 px-2 py-2 rounded-lg text-[12px] font-medium transition-all truncate ${
              filter === id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }${id === 'overdue' ? ' text-red-600 dark:text-red-400' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Kanban view */}
      {viewMode === 'kanban' && (
        <KanbanBoard tasks={filtered} onSelect={setSelected} />
      )}

      {/* Task list — mobile cards (xs) / desktop table (sm+) */}
      {viewMode === 'list' && <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm overflow-hidden">
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
          <>
            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-slate-100 dark:divide-white/[0.04]">
              {filtered.map((task) => {
                const eff = effectiveStatus(task)
                const overdue = eff === 'OVERDUE'
                const person = tab === 'my' ? task.assignedBy : task.assignee
                return (
                  <button key={task.id} type="button" onClick={() => setSelected(task)}
                    className="w-full text-left px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 flex-1">
                        {task.caseNumber ? <span className="text-blue-600 dark:text-blue-400 mr-1">{task.caseNumber}</span> : null}
                        {task.title}
                      </p>
                      <StatusBadge status={eff} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {task.taskDepartment && <DeptBadge dept={task.taskDepartment} />}
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{person.name}</span>
                      {task.dueDate && (
                        <span className={`text-[11px] ${overdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                          ครบ {fmtDate(task.dueDate)}
                        </span>
                      )}
                      {overdue && <OverdueSeverityBadge task={task} />}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/[0.05]">
                    {[
                      { label: 'เลขคดี / ชื่องาน', cls: '' },
                      { label: 'ฝ่าย',              cls: 'hidden sm:table-cell' },
                      { label: 'ประเภทงาน',         cls: 'hidden md:table-cell' },
                      { label: tab === 'my' ? 'มอบหมายโดย' : 'ผู้รับผิดชอบ', cls: '' },
                      { label: 'สถานะ',             cls: '' },
                      { label: 'กำหนดเสร็จ',        cls: '' },
                      { label: '',                   cls: '' },
                    ].map(({ label, cls }) => (
                      <th key={label} className={`text-left px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${cls}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((task) => (
                    <TaskRow key={task.id} task={task} showAssigner={tab === 'my'} onClick={() => setSelected(task)} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      }

      {selected && (
        <TaskDetailModal task={selected} role={role} userId={userId}
          onClose={() => setSelected(null)} onUpdated={applyUpdate} />
      )}
      {showCreate && (
        <CreateTaskModal employees={employees} assignerName={userName}
          onClose={() => setCreate(false)} onCreated={handleCreated}
          templates={templates} workloadMap={workloadMap} />
      )}

      {/* Mobile FAB */}
      {canAssign && (
        <button type="button" onClick={() => setCreate(true)}
          className="md:hidden fixed z-30 right-4 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 text-[14px] font-bold text-white shadow-lg shadow-blue-600/30 active:scale-95 transition-transform"
          style={{ bottom: 'calc(58px + env(safe-area-inset-bottom) + 16px)' }}>
          <Plus className="w-4 h-4" />
          สร้างงาน
        </button>
      )}
    </div>
  )
}
