'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileText, Image as ImageIcon, File, Archive, Search, Upload, X,
  Download, Eye, Tag, Calendar, User, RefreshCw, ChevronLeft, ChevronRight,
  Plus, Loader2, FolderOpen, AlertCircle, CheckCircle, Clock, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────────

type DocFile = {
  id: string
  fileName: string
  fileUrl: string
  secureUrl: string | null
  publicId: string
  fileType: string
  mimeType: string | null
  resourceType: string | null
  format: string | null
  fileSize: number | null
  version: number
  createdAt: string
  uploadedById: string
}

type Doc = {
  id: string
  title: string
  description: string | null
  docType: string
  category: string
  caseNumber: string | null
  clientName: string | null
  department: string | null
  taskId: string | null
  caseId: string | null
  debtorId: string | null
  tags: string | null
  status: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
  uploadedBy: { id: string; name: string; role: string }
  assignedTo: { id: string; name: string; role: string } | null
  files: DocFile[]
  signatures: { id: string; signerName: string; signedAt: string }[]
  _count: { files: number; versions: number }
}

type Props = {
  userId: string
  userName: string
  role: string
  department: string | null
  cloudName: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',      label: 'ทั้งหมด',       icon: FolderOpen },
  { id: 'mine',     label: 'ของฉัน',         icon: User },
  { id: 'court',    label: 'ศาล',            icon: FileText },
  { id: 'evidence', label: 'หลักฐาน',        icon: Archive },
  { id: 'recent',   label: 'ล่าสุด',          icon: Clock },
  { id: 'archived', label: 'เก็บถาวร',        icon: Archive },
] as const
type Tab = typeof TABS[number]['id']

const CATEGORIES: Record<string, string> = {
  CONTRACT:         'สัญญา',
  AGREEMENT:        'ข้อตกลง',
  EVIDENCE:         'หลักฐาน',
  COURT_DOCUMENT:   'เอกสารศาล',
  DEBTOR_DOCUMENT:  'เอกสารลูกหนี้',
  CLIENT_DOCUMENT:  'เอกสารลูกค้า',
  PAYMENT_DOCUMENT: 'เอกสารชำระเงิน',
  LEGAL_DOCUMENT:   'เอกสารกฎหมาย',
  INTERNAL_DOCUMENT:'เอกสารภายใน',
  OTHER:            'อื่นๆ',
}

const CATEGORY_COLORS: Record<string, string> = {
  CONTRACT:         'bg-green-500/15 text-green-400 border-green-500/20',
  AGREEMENT:        'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  EVIDENCE:         'bg-orange-500/15 text-orange-400 border-orange-500/20',
  COURT_DOCUMENT:   'bg-red-500/15 text-red-400 border-red-500/20',
  DEBTOR_DOCUMENT:  'bg-amber-500/15 text-amber-400 border-amber-500/20',
  CLIENT_DOCUMENT:  'bg-green-500/15 text-green-400 border-green-500/20',
  PAYMENT_DOCUMENT: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  LEGAL_DOCUMENT:   'bg-purple-500/15 text-purple-400 border-purple-500/20',
  INTERNAL_DOCUMENT:'bg-slate-500/15 text-slate-400 border-slate-500/20',
  OTHER:            'bg-white/5 text-white/40 border-white/10',
}

/** Native select — uses global .dashboard-select styles */
const SELECT_TRIGGER = 'dashboard-select'

function FileIcon({ mimeType, format, resourceType, className = 'w-5 h-5' }: {
  mimeType?: string | null
  format?: string | null
  resourceType?: string | null
  className?: string
}) {
  const type = mimeType ?? ''
  const fmt  = (format ?? '').toLowerCase()
  if (resourceType === 'image' && !fmt.includes('pdf')) {
    return <ImageIcon className={`${className} text-green-400`} />
  }
  if (type.includes('pdf') || fmt === 'pdf') {
    return <FileText className={`${className} text-red-400`} />
  }
  if (type.includes('word') || ['doc', 'docx'].includes(fmt)) {
    return <FileText className={`${className} text-green-400`} />
  }
  if (type.includes('sheet') || type.includes('excel') || ['xls', 'xlsx'].includes(fmt)) {
    return <FileText className={`${className} text-green-400`} />
  }
  if (type.includes('zip') || fmt === 'zip') {
    return <Archive className={`${className} text-yellow-400`} />
  }
  return <File className={`${className} text-slate-400`} />
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Preview Modal ──────────────────────────────────────────────────────────────

function PreviewModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const latestFile = doc.files[0]
  const [signedUrl, setSignedUrl]   = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(!!latestFile)

  useEffect(() => {
    if (!latestFile) return
    setLoadingUrl(true)
    fetch(`/api/case-documents/${doc.id}/preview-url?fileId=${latestFile.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setSignedUrl(d.url) })
      .catch(() => {})
      .finally(() => setLoadingUrl(false))
  }, [doc.id, latestFile?.id])

  function getPreviewUrl(file: DocFile) {
    return signedUrl ?? file.secureUrl ?? file.fileUrl
  }

  function renderPreview(file: DocFile) {
    const url  = getPreviewUrl(file)
    const mime = file.mimeType ?? ''
    const fmt  = (file.format ?? '').toLowerCase()

    const isPdf    = mime.includes('pdf') || fmt === 'pdf'
    const isImg    = !isPdf && (file.resourceType === 'image' || mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg'].includes(fmt))
    const isVideo  = file.resourceType === 'video' || mime.startsWith('video/') || ['mp4','mov','webm','avi','mkv'].includes(fmt)
    const isOffice = ['doc','docx','xls','xlsx','ppt','pptx'].includes(fmt) ||
      mime.includes('word') || mime.includes('sheet') || mime.includes('excel') ||
      mime.includes('powerpoint') || mime.includes('presentation')

    if (isImg) {
      return (
        <div className="flex items-center justify-center flex-1 p-4 bg-black/40 rounded-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={file.fileName} className="max-h-[60vh] max-w-full object-contain rounded-lg" />
        </div>
      )
    }
    if (isPdf) {
      return (
        <div className="flex-1 rounded-xl overflow-hidden bg-black/20">
          <iframe src={url} className="w-full h-[60vh]" title={file.fileName} />
        </div>
      )
    }
    if (isVideo) {
      return (
        <div className="flex-1 rounded-xl overflow-hidden bg-black/40 flex items-center justify-center p-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={url} controls className="max-h-[60vh] max-w-full rounded-lg" />
        </div>
      )
    }
    if (isOffice) {
      return (
        <div className="flex-1 rounded-xl overflow-hidden bg-black/20">
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
            className="w-full h-[60vh]"
            title={file.fileName}
          />
        </div>
      )
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/50">
        <FileIcon mimeType={file.mimeType} format={file.format} resourceType={file.resourceType} className="w-16 h-16" />
        <p className="text-sm">ไม่สามารถ preview ได้ กรุณากด Download</p>
        <a
          href={url}
          download={file.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition"
        >
          <Download className="w-4 h-4" /> ดาวน์โหลด
        </a>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07]">
          {latestFile && (
            <FileIcon mimeType={latestFile.mimeType} format={latestFile.format} resourceType={latestFile.resourceType} className="w-5 h-5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{doc.title}</p>
            <p className="text-white/40 text-xs mt-0.5">
              {latestFile ? latestFile.fileName : '—'} · {latestFile ? formatBytes(latestFile.fileSize) : ''}
              {doc.caseNumber ? ` · คดี ${doc.caseNumber}` : ''}
            </p>
          </div>
          <span className={`px-2 py-1 rounded-lg text-xs font-medium border shrink-0 ${CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.OTHER}`}>
            {CATEGORIES[doc.category] ?? doc.category}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {latestFile && (
              <a
                href={getPreviewUrl(latestFile)}
                download={latestFile.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition"
                title="ดาวน์โหลด"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col gap-4 min-h-0">
          {loadingUrl ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-white/30" />
            </div>
          ) : latestFile ? renderPreview(latestFile) : (
            <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-3">
              <FileText className="w-12 h-12 opacity-30" />
              <p className="text-sm">ยังไม่มีไฟล์แนบ</p>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-white/5 rounded-xl px-3 py-2">
              <p className="text-white/40 mb-1">อัปโหลดโดย</p>
              <p className="text-white font-medium">{doc.uploadedBy.name}</p>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-2">
              <p className="text-white/40 mb-1">วันที่</p>
              <p className="text-white font-medium">{formatDate(doc.createdAt)}</p>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-2">
              <p className="text-white/40 mb-1">เวอร์ชัน</p>
              <p className="text-white font-medium">v{latestFile?.version ?? 1} ({doc._count.files} ไฟล์)</p>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-2">
              <p className="text-white/40 mb-1">ขนาด</p>
              <p className="text-white font-medium">{formatBytes(latestFile?.fileSize ?? null)}</p>
            </div>
          </div>

          {doc.description && (
            <p className="text-white/50 text-xs bg-white/5 rounded-xl px-3 py-2">{doc.description}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Upload Modal ───────────────────────────────────────────────────────────────

function UploadModal({
  cloudName,
  userId,
  onClose,
  onSuccess,
  defaultCaseId,
  defaultCaseNumber,
}: {
  cloudName: string
  userId: string
  onClose: () => void
  onSuccess: () => void
  defaultCaseId?: string | null
  defaultCaseNumber?: string | null
}) {
  const [title, setTitle]         = useState('')
  const [category, setCategory]   = useState('OTHER')
  const [description, setDesc]    = useState('')
  const [tags, setTags]           = useState('')
  const [caseNumber, setCaseNum]  = useState(defaultCaseNumber ?? '')
  const [caseId, setCaseId]       = useState(defaultCaseId ?? '')
  const [file, setFile]           = useState<File | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function handleFile(f: File) {
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  async function submit() {
    if (!file) { toast.error('กรุณาเลือกไฟล์'); return }
    if (!title.trim()) { toast.error('กรุณากรอกชื่อเอกสาร'); return }

    setUploading(true)
    setProgress(10)

    try {
      // 1. Get Cloudinary signature
      const sigRes = await fetch('/api/upload/sign?context=documents')
      if (!sigRes.ok) throw new Error('Cannot get upload signature')
      const sig = await sigRes.json()
      setProgress(20)

      // 2. Upload to Cloudinary
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', sig.apiKey)
      formData.append('timestamp', String(sig.timestamp))
      formData.append('signature', sig.signature)
      formData.append('folder', sig.folder)
      formData.append('type', sig.type ?? 'authenticated')

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
        { method: 'POST', body: formData },
      )
      if (!uploadRes.ok) {
        const err = await uploadRes.json()
        throw new Error(err.error?.message ?? 'Upload failed')
      }
      const cloud = await uploadRes.json()
      setProgress(80)

      // 3. Create document + file record
      const docRes = await fetch('/api/case-documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        title.trim(),
          description:  description.trim() || null,
          category,
          caseId:       caseId || null,
          caseNumber:   caseNumber.trim() || null,
          tags:         tags.trim() || null,
          publicId:     cloud.public_id,
          fileUrl:      cloud.url,
          secureUrl:    cloud.secure_url,
          fileName:     file.name,
          fileType:     file.type,
          mimeType:     file.type,
          resourceType: cloud.resource_type,
          format:       cloud.format,
          fileSize:     cloud.bytes,
        }),
      })
      if (!docRes.ok) throw new Error('Cannot save document')
      setProgress(100)

      toast.success('อัปโหลดเอกสารสำเร็จ')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  return (
    <div className="fixed inset-0 z-60 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-white/10 rounded-t-3xl md:rounded-2xl w-full md:max-w-lg shadow-2xl overflow-y-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <h3 className="text-white font-semibold">อัปโหลดเอกสาร</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
              dragging
                ? 'border-green-500 bg-green-500/10'
                : file
                ? 'border-green-500/40 bg-green-500/5'
                : 'border-white/20 hover:border-white/30 hover:bg-white/5'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {file ? (
              <div className="flex items-center gap-3 justify-center">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <div className="text-left">
                  <p className="text-white text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                  <p className="text-white/40 text-xs">{formatBytes(file.size)}</p>
                </div>
                <button
                  className="ml-auto p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white"
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-2 text-white/30" />
                <p className="text-white/60 text-sm font-medium">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก</p>
                <p className="text-white/30 text-xs mt-1">PDF, รูปภาพ, Word, Excel, ZIP · สูงสุด 20 MB</p>
              </>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-2xl bg-slate-900/80 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-green-400" />
                <div className="w-32 bg-white/10 rounded-full h-1.5">
                  <div className="bg-green-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-white/50 text-xs">กำลังอัปโหลด {progress}%</p>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">ชื่อเอกสาร *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น คำฟ้อง-ชื่อลูกหนี้"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">ประเภทเอกสาร</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`w-full ${SELECT_TRIGGER}`}
            >
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Case number */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">หมายเลขคดี (ไม่บังคับ)</label>
            <input
              value={caseNumber}
              onChange={(e) => setCaseNum(e.target.value)}
              placeholder="เช่น CS-2024-001"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">คำอธิบาย (ไม่บังคับ)</label>
            <textarea
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 resize-none focus:outline-none focus:border-green-500/50"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">แท็ก (คั่นด้วยจุลภาค)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="เช่น court, urgent, evidence"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              disabled={uploading || !file}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-40 transition"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
            </button>
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 text-sm transition disabled:opacity-40"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Document Card ──────────────────────────────────────────────────────────────

function DocCard({ doc, onPreview, onArchive, userId, role }: {
  doc: Doc
  onPreview: () => void
  onArchive: () => void
  userId: string
  role: string
}) {
  const latestFile = doc.files[0]
  const canManage = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN'].includes(role) || doc.uploadedBy.id === userId

  return (
    <div className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.12] rounded-2xl p-4 transition-all duration-200">
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
          {latestFile ? (
            <FileIcon
              mimeType={latestFile.mimeType}
              format={latestFile.format}
              resourceType={latestFile.resourceType}
              className="w-5 h-5"
            />
          ) : (
            <FileText className="w-5 h-5 text-slate-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="text-white font-medium text-sm leading-tight truncate max-w-[200px] md:max-w-none">{doc.title}</p>
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border shrink-0 ${CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.OTHER}`}>
              {CATEGORIES[doc.category] ?? doc.category}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-white/40">
            {doc.caseNumber && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {doc.caseNumber}
              </span>
            )}
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {doc.uploadedBy.name}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(doc.updatedAt)}
            </span>
            {doc._count.files > 1 && (
              <span className="text-green-400">v{latestFile?.version ?? 1} ({doc._count.files} ไฟล์)</span>
            )}
            {latestFile?.fileSize && (
              <span>{formatBytes(latestFile.fileSize)}</span>
            )}
          </div>

          {doc.tags && (
            <div className="flex flex-wrap gap-1 mt-2">
              {doc.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                <span key={tag} className="flex items-center gap-1 text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-lg">
                  <Tag className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onPreview}
            className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition"
            title="ดูตัวอย่าง"
          >
            <Eye className="w-4 h-4" />
          </button>
          {latestFile && (
            <a
              href={latestFile.secureUrl ?? latestFile.fileUrl}
              download={latestFile.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition"
              title="ดาวน์โหลด"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
          {canManage && (
            <button
              onClick={onArchive}
              className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-amber-400 transition"
              title={doc.isArchived ? 'ยกเลิกเก็บถาวร' : 'เก็บถาวร'}
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tap to preview on mobile */}
      <button
        onClick={onPreview}
        className="md:hidden mt-3 w-full py-2 rounded-xl bg-white/5 text-white/50 text-xs hover:bg-white/10 hover:text-white transition"
      >
        ดูตัวอย่าง
      </button>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CaseDocumentsClient({ userId, userName, role, department, cloudName }: Props) {
  const [activeTab, setActiveTab]     = useState<Tab>('all')
  const [docs, setDocs]               = useState<Doc[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [pages, setPages]             = useState(1)
  const [loading, setLoading]         = useState(true)
  const [searchQ, setSearchQ]         = useState('')
  const [catFilter, setCatFilter]     = useState('')
  const [previewDoc, setPreviewDoc]   = useState<Doc | null>(null)
  const [showUpload, setShowUpload]   = useState(false)
  const searchTimeout                 = useRef<ReturnType<typeof setTimeout>>(null)
  const [debouncedQ, setDebouncedQ]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      p.set('tab', activeTab)
      p.set('page', String(page))
      if (debouncedQ) p.set('q', debouncedQ)
      if (catFilter)  p.set('category', catFilter)

      const res = await fetch(`/api/case-documents?${p}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDocs(data.docs ?? [])
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
    } catch (err) {
      console.error('[case-docs load]', err)
      toast.error('โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [activeTab, page, debouncedQ, catFilter])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedQ(searchQ)
      setPage(1)
    }, 400)
  }, [searchQ])

  function changeTab(t: Tab) {
    setActiveTab(t)
    setPage(1)
  }

  async function toggleArchive(doc: Doc) {
    try {
      await fetch(`/api/case-documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: !doc.isArchived }),
      })
      toast.success(doc.isArchived ? 'ยกเลิกเก็บถาวรแล้ว' : 'เก็บถาวรแล้ว')
      void load()
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    }
  }

  return (
    <div className="flex flex-col min-h-0 p-4 md:p-6 gap-4">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => changeTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-green-600 text-white'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="ค้นหาชื่อเอกสาร, หมายเลขคดี, ลูกค้า, แท็ก..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50"
          />
        </div>

        <select
          value={catFilter}
          onChange={(e) => { setCatFilter(e.target.value); setPage(1) }}
          className={SELECT_TRIGGER}
        >
          <option value="">ทุกประเภท</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <button
          onClick={() => void load()}
          className="p-2.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition"
        >
          <Plus className="w-4 h-4" /> อัปโหลดเอกสาร
        </button>
      </div>

      {/* Stats bar */}
      {!loading && (
        <p className="text-white/30 text-xs">
          {total} เอกสาร{total > 0 && page < pages ? ` · หน้า ${page}/${pages}` : ''}
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-3">
          <FolderOpen className="w-12 h-12 opacity-30" />
          <p className="text-sm">ไม่มีเอกสาร</p>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 text-green-400 text-sm hover:text-green-300 transition"
          >
            <Plus className="w-4 h-4" /> อัปโหลดเอกสารแรก
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <DocCard
              key={doc.id}
              doc={doc}
              userId={userId}
              role={role}
              onPreview={() => setPreviewDoc(doc)}
              onArchive={() => void toggleArchive(doc)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-white/50 text-sm">{page} / {pages}</span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload FAB (mobile) */}
      <button
        onClick={() => setShowUpload(true)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-green-600 hover:bg-green-500 shadow-lg flex items-center justify-center z-40 transition"
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      {/* Modals */}
      {previewDoc && (
        <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}

      {showUpload && (
        <UploadModal
          cloudName={cloudName}
          userId={userId}
          onClose={() => setShowUpload(false)}
          onSuccess={() => void load()}
        />
      )}
    </div>
  )
}
