'use client'

import { useState, useRef } from 'react'
import {
  Clock, CheckCircle, AlertCircle,
  RotateCcw, Eye, Loader2,
  FileText, Download, Trash2, File, Building2,
  User2,
  Ban, XCircle,
  Upload, Plus, X,
} from 'lucide-react'
import { getOverdueInfo, getSeverityBadgeClass } from '@/lib/task-sla'

// ── Types ────────────────────────────────────────────────────────────────────

export type UserSnip = {
  id: string
  name: string
  department: string | null
  employeeId: string | null
  role: string
}

export type TaskAttachment = {
  id: string
  fileName: string
  fileUrl: string
  publicId: string
  fileType: string
  fileSize: number | null
  createdAt: string
  uploadedBy: { id: string; name: string }
}

export type Task = {
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
  attachments?: TaskAttachment[]
  _count?: { attachments: number }
  assignee: UserSnip
  assignedBy: UserSnip
  caseNumber: string | null
  clientName: string | null
  taskDepartment: string | null
  appointmentDate: string | null
  courtDate: string | null
  appointmentPlace: string | null
  comments?: TaskCommentItem[]
  checklist?: ChecklistItem[]
  timeline?: TaskTimelineEntry[]
  dueTime: string | null
  slaHours: number | null
  slaDeadline: string | null
  templateId: string | null
  debtorId: string | null
  rejectedCount: number
  isBlocked?: boolean
}

export type TaskLink     = { label: string; url: string; _key?: string }
export type ProgressNote = { note: string; timestamp: string; userId: string; userName: string }

export type CommentUser  = { id: string; name: string; role: string }
export type CommentReply = { id: string; content: string; parentId: string; createdAt: string; updatedAt: string; user: CommentUser }
export type TaskCommentItem = { id: string; content: string; parentId: string | null; createdAt: string; updatedAt: string; user: CommentUser; replies: CommentReply[] }

export type ChecklistItem = {
  id: string
  title: string
  isCompleted: boolean
  order: number
  completedAt: string | null
  completedBy: { id: string; name: string } | null
}

export type TaskTimelineEntry = {
  id: string
  action: string
  description: string
  meta: string | null
  createdAt: string
  user: { id: string; name: string; role: string }
}

export type TaskTemplate = {
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

export type WorkloadInfo = {
  userId: string
  activeCount: number
  overdueCount: number
  score: number
  status: 'LOW' | 'NORMAL' | 'HIGH' | 'OVERLOADED'
  statusLabel: string
}

export type TabId = 'my' | 'by_me' | 'all'
export type ViewMode = 'list' | 'kanban'

// ── Department constants ──────────────────────────────────────────────────────

export const DEPT_OPTIONS = [
  { value: '',         label: 'ทั่วไป (ไม่ระบุฝ่าย)' },
  { value: 'DEBT',     label: 'ฝ่ายเร่งรัดหนี้' },
  { value: 'LAW',      label: 'ฝ่ายกฎหมาย' },
  { value: 'ASSET',    label: 'ฝ่ายสืบทรัพย์' },
  { value: 'ENFORCE',  label: 'ฝ่ายบังคับคดี' },
] as const

export const DEPT_LABEL: Record<string, string> = {
  DEBT:    'ฝ่ายเร่งรัดหนี้',
  LAW:     'ฝ่ายกฎหมาย',
  ASSET:   'ฝ่ายสืบทรัพย์',
  ENFORCE: 'ฝ่ายบังคับคดี',
}

export const DEPT_COLOR: Record<string, string> = {
  DEBT:    'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20',
  LAW:     'text-green-700   dark:text-green-400   bg-green-50   dark:bg-green-500/10   border-green-200   dark:border-green-500/20',
  ASSET:   'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20',
  ENFORCE: 'text-red-700    dark:text-red-400    bg-red-50    dark:bg-red-500/10    border-red-200    dark:border-red-500/20',
}

export const DEPT_TASK_OPTIONS: Record<string, { value: string; label: string }[]> = {
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

export const STATUS_LABEL: Record<string, string> = {
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

export const STATUS_CLS: Record<string, string> = {
  PENDING:          'text-slate-600  dark:text-slate-400  bg-slate-100  dark:bg-slate-500/10',
  NEW:              'text-slate-600  dark:text-slate-400  bg-slate-100  dark:bg-slate-500/10',
  ASSIGNED:         'text-teal-700   dark:text-teal-400   bg-teal-100   dark:bg-teal-500/10',
  IN_PROGRESS:      'text-green-700   dark:text-green-400   bg-green-100   dark:bg-green-500/10',
  WAITING_DOC:      'text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-500/10',
  WAITING_REVIEW:   'text-amber-700  dark:text-amber-400  bg-amber-100  dark:bg-amber-500/10',
  WAITING_APPROVAL: 'text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10',
  REVISION:         'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10',
  REJECTED:         'text-red-700    dark:text-red-400    bg-red-100    dark:bg-red-500/10',
  CANCELLED:        'text-slate-500  dark:text-slate-500  bg-slate-100  dark:bg-slate-500/10',
  COMPLETED:        'text-green-700  dark:text-green-400  bg-green-100  dark:bg-green-500/10',
  OVERDUE:          'text-red-700    dark:text-red-400    bg-red-100    dark:bg-red-500/10',
}

export const STATUS_ICON: Record<string, React.ReactNode> = {
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

export const TYPE_LABEL: Record<string, string> = {
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

export const PRIORITY_LABEL: Record<string, string> = {
  LOW:    '⚪ ต่ำ',
  MEDIUM: '🟡 ปานกลาง',
  HIGH:   '🟠 สูง',
  URGENT: '🔴 เร่งด่วน',
}

export const PRIORITY_TEXT: Record<string, string> = {
  LOW:    'text-slate-500 dark:text-slate-400',
  MEDIUM: 'text-green-600  dark:text-green-400',
  HIGH:   'text-amber-700 dark:text-amber-400',
  URGENT: 'text-red-700   dark:text-red-400 font-bold',
}

export const ACTIVE_STATUSES = ['PENDING', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_DOC', 'REVISION', 'WAITING_APPROVAL']

export const WORKLOAD_CLS: Record<string, string> = {
  LOW:        'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20',
  NORMAL:     'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20',
  HIGH:       'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20',
  OVERLOADED: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
}

export const STATUS_TABS = [
  { id: 'all',       label: 'ทั้งหมด' },
  { id: 'active',    label: 'กำลังดำเนิน' },
  { id: 'review',    label: 'รอตรวจ' },
  { id: 'overdue',   label: 'เกินกำหนด' },
  { id: 'completed', label: 'เสร็จสิ้น' },
]

export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg',
  'application/zip', 'application/x-zip-compressed',
].join(',')

// ── Helpers ──────────────────────────────────────────────────────────────────

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  })
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  })
}

export function isOverdue(task: Task): boolean {
  if (!task.dueDate) return false
  if (['COMPLETED'].includes(task.status)) return false
  return new Date(task.dueDate) < new Date()
}

export function effectiveStatus(task: Task): string {
  return isOverdue(task) ? 'OVERDUE' : task.status
}

export function parseLinks(raw: string | null): TaskLink[] {
  if (!raw) return []
  try { return (JSON.parse(raw) as TaskLink[]).map((l, i) => ({ ...l, _key: l._key ?? String(i) + l.url })) } catch { return [] }
}

export function parseNotes(raw: string | null): ProgressNote[] {
  if (!raw) return []
  try { return JSON.parse(raw) as ProgressNote[] } catch { return [] }
}

export function isValidUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

export function fmtFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileIcon(fileType: string): React.ReactNode {
  if (fileType.startsWith('image/')) return <File className="w-4 h-4 text-purple-500" />
  if (fileType === 'application/pdf') return <FileText className="w-4 h-4 text-red-500" />
  if (fileType.includes('word'))      return <FileText className="w-4 h-4 text-green-500" />
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return <FileText className="w-4 h-4 text-green-600" />
  return <File className="w-4 h-4 text-slate-400" />
}

// ── StatusBadge ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CLS[status] ?? STATUS_CLS.PENDING}`}>
      {STATUS_ICON[status] ?? STATUS_ICON.PENDING}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── DeptBadge ─────────────────────────────────────────────────────────────────

export function DeptBadge({ dept }: { dept: string | null }) {
  if (!dept) return null
  const cls = DEPT_COLOR[dept] ?? 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-500/10 border-slate-200 dark:border-slate-500/20'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold border ${cls}`}>
      <Building2 className="w-2.5 h-2.5" />
      {DEPT_LABEL[dept] ?? dept}
    </span>
  )
}

// ── OverdueSeverityBadge ──────────────────────────────────────────────────────

export function OverdueSeverityBadge({ task }: { task: Task }) {
  const info = getOverdueInfo(task.dueDate, task.status)
  if (!info.isOverdue) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${getSeverityBadgeClass(info.severity)}`}>
      <AlertCircle className="w-2.5 h-2.5" />{info.label}
    </span>
  )
}

// ── BlockedBadge ─────────────────────────────────────────────────────────────

export function BlockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
      🔒 รอ
    </span>
  )
}

// ── AttachmentItem ────────────────────────────────────────────────────────────

export function AttachmentItem({
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
        <p className="text-[12px] text-slate-400 dark:text-slate-500">
          {fmtFileSize(att.fileSize)}{att.fileSize ? ' · ' : ''}{att.uploadedBy.name} · {fmtDate(att.createdAt)}
        </p>
      </div>
      <a href={att.fileUrl} target="_blank" rel="noopener noreferrer"
        className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors" title="เปิดไฟล์">
        <Download className="w-3.5 h-3.5" />
      </a>
      {canDelete && (
        <button type="button" disabled={isDeleting} onClick={onDelete}
          className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40" title="ลบไฟล์">
          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}

// ── FileUploadZone ────────────────────────────────────────────────────────────

export function FileUploadZone({
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
          dragOver ? 'border-green-400 bg-green-50 dark:bg-green-500/10'
                   : 'border-slate-200 dark:border-white/10 hover:border-green-300 dark:hover:border-green-500/40 bg-slate-50 dark:bg-white/[0.02]'}`}
      >
        <Upload className="w-5 h-5 mx-auto mb-1.5 text-slate-400 dark:text-slate-500" />
        <p className="text-[12px] font-medium text-slate-600 dark:text-slate-400">
          ลากไฟล์มาวาง หรือ <span className="text-green-600 dark:text-green-400">คลิกเลือกไฟล์</span>
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">PDF, Word, Excel, PNG, JPG, ZIP · สูงสุด 20 MB</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPTED_FILE_TYPES} className="hidden"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFilesAdded(f); e.target.value = '' }}
          disabled={uploading} />
      </div>
      {pendingFiles.length > 0 && (
        <div className="space-y-1.5">
          {pendingFiles.map((f, i) => (
            <div key={f.name + '-' + f.size} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20">
              <div className="flex-shrink-0">{fileIcon(f.type)}</div>
              <span className="flex-1 text-[13px] text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
              <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtFileSize(f.size)}</span>
              <button type="button" disabled={uploading} onClick={() => onRemove(i)} aria-label={`ลบไฟล์: ${f.name}`}
                className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-red-500 disabled:opacity-40">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
