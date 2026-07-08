'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileText, Image as ImageIcon, File, Archive, Upload, X, Download, Eye,
  Tag, Plus, Loader2, CheckCircle, FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'

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
}

type Doc = {
  id: string
  title: string
  category: string
  caseNumber: string | null
  tags: string | null
  isArchived: boolean
  createdAt: string
  uploadedBy: { id: string; name: string }
  files: DocFile[]
  _count: { files: number; versions: number }
}

const CATEGORIES: Record<string, string> = {
  CONTRACT: 'สัญญา', AGREEMENT: 'ข้อตกลง', EVIDENCE: 'หลักฐาน',
  COURT_DOCUMENT: 'เอกสารศาล', DEBTOR_DOCUMENT: 'เอกสารลูกหนี้',
  CLIENT_DOCUMENT: 'เอกสารลูกค้า', PAYMENT_DOCUMENT: 'เอกสารชำระเงิน',
  LEGAL_DOCUMENT: 'เอกสารกฎหมาย', INTERNAL_DOCUMENT: 'เอกสารภายใน',
  OTHER: 'อื่นๆ',
}

const CATEGORY_COLORS: Record<string, string> = {
  CONTRACT: 'bg-green-500/15 text-green-400',
  AGREEMENT: 'bg-indigo-500/15 text-indigo-400',
  EVIDENCE: 'bg-orange-500/15 text-orange-400',
  COURT_DOCUMENT: 'bg-red-500/15 text-red-400',
  DEBTOR_DOCUMENT: 'bg-amber-500/15 text-amber-400',
  CLIENT_DOCUMENT: 'bg-green-500/15 text-green-400',
  PAYMENT_DOCUMENT: 'bg-emerald-500/15 text-emerald-400',
  LEGAL_DOCUMENT: 'bg-purple-500/15 text-purple-400',
  INTERNAL_DOCUMENT: 'bg-slate-500/15 text-slate-400',
  OTHER: 'bg-white/5 text-white/40',
}

function FileTypeIcon({ mimeType, format, resourceType }: { mimeType?: string | null; format?: string | null; resourceType?: string | null }) {
  const fmt = (format ?? '').toLowerCase()
  const mime = mimeType ?? ''
  if (resourceType === 'image' && !fmt.includes('pdf') && !mime.includes('pdf')) return <ImageIcon className="w-4 h-4 text-green-400" />
  if (mime.includes('pdf') || fmt === 'pdf') return <FileText className="w-4 h-4 text-red-400" />
  if (['doc', 'docx'].includes(fmt) || mime.includes('word')) return <FileText className="w-4 h-4 text-green-400" />
  if (['xls', 'xlsx'].includes(fmt) || mime.includes('sheet')) return <FileText className="w-4 h-4 text-green-400" />
  if (fmt === 'zip' || mime.includes('zip')) return <Archive className="w-4 h-4 text-yellow-400" />
  return <File className="w-4 h-4 text-slate-400" />
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Preview modal ────────────────────────────────────────────────────────────

function PreviewModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const f = doc.files[0]
  const [signedUrl, setSignedUrl]   = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(!!f)

  useEffect(() => {
    if (!f) return
    setLoadingUrl(true)
    fetch(`/api/case-documents/${doc.id}/preview-url?fileId=${f.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setSignedUrl(d.url) })
      .catch(() => {})
      .finally(() => setLoadingUrl(false))
  }, [doc.id, f?.id])

  if (!f) return null

  const url  = signedUrl ?? f.secureUrl ?? f.fileUrl
  const mime = f.mimeType ?? ''
  const fmt  = (f.format ?? '').toLowerCase()

  const isPdf    = mime.includes('pdf') || fmt === 'pdf'
  const isImg    = !isPdf && (f.resourceType === 'image' || mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg'].includes(fmt))
  const isVideo  = f.resourceType === 'video' || mime.startsWith('video/') || ['mp4','mov','webm','avi','mkv'].includes(fmt)
  const isOffice = ['doc','docx','xls','xlsx','ppt','pptx'].includes(fmt) ||
    mime.includes('word') || mime.includes('sheet') || mime.includes('excel') ||
    mime.includes('powerpoint') || mime.includes('presentation')

  return (
    <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.07]">
          <FileTypeIcon mimeType={f.mimeType} format={f.format} resourceType={f.resourceType} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{doc.title}</p>
            <p className="text-white/40 text-xs">{f.fileName} · {formatBytes(f.fileSize)}</p>
          </div>
          <a href={url} download={f.fileName} target="_blank" rel="noopener noreferrer"
            className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition">
            <Download className="w-4 h-4" />
          </a>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-4 min-h-0">
          {loadingUrl ? (
            <div className="flex items-center justify-center h-[55vh]">
              <Loader2 className="w-7 h-7 animate-spin text-white/30" />
            </div>
          ) : isImg ? (
            <div className="flex items-center justify-center h-full bg-black/30 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={doc.title} className="max-h-[55vh] max-w-full object-contain" />
            </div>
          ) : isPdf ? (
            <iframe src={url} className="w-full h-[55vh] rounded-xl" title={doc.title} />
          ) : isVideo ? (
            <div className="flex items-center justify-center h-[55vh] bg-black/40 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={url} controls className="max-h-[55vh] max-w-full rounded-lg" />
            </div>
          ) : isOffice ? (
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
              className="w-full h-[55vh] rounded-xl"
              title={doc.title}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-[55vh] text-white/40 gap-4">
              <File className="w-12 h-12 opacity-30" />
              <p className="text-sm">ไม่สามารถ preview ได้ กรุณากด Download</p>
              <a
                href={url}
                download={f.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition"
              >
                <Download className="w-4 h-4" /> ดาวน์โหลด
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Upload mini-modal ────────────────────────────────────────────────────────

function UploadMini({ caseId, caseNumber, cloudName, onClose, onSuccess }: {
  caseId: string
  caseNumber: string
  cloudName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [title, setTitle]         = useState('')
  const [category, setCategory]   = useState('OTHER')
  const [file, setFile]           = useState<File | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

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
      const sigRes = await fetch('/api/upload/sign?context=documents')
      if (!sigRes.ok) throw new Error('Cannot get upload signature')
      const sig = await sigRes.json()
      setProgress(25)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', sig.apiKey)
      formData.append('timestamp', String(sig.timestamp))
      formData.append('signature', sig.signature)
      formData.append('folder', sig.folder)
      formData.append('type', sig.type ?? 'authenticated')
      formData.append('allowed_formats', sig.allowedFormats)
      formData.append('max_file_size', String(sig.maxFileSize))

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: 'POST', body: formData,
      })
      if (!uploadRes.ok) {
        const err = await uploadRes.json()
        throw new Error(err.error?.message ?? 'Upload failed')
      }
      const cloud = await uploadRes.json()
      setProgress(80)

      const docRes = await fetch('/api/case-documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), category,
          caseId, caseNumber,
          publicId: cloud.public_id, fileUrl: cloud.url,
          secureUrl: cloud.secure_url, fileName: file.name,
          fileType: file.type, mimeType: file.type,
          resourceType: cloud.resource_type, format: cloud.format,
          fileSize: cloud.bytes,
        }),
      })
      if (!docRes.ok) throw new Error('Cannot save document')
      setProgress(100)
      toast.success('อัปโหลดสำเร็จ')
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
      <div className="bg-slate-900 border border-white/10 rounded-t-3xl md:rounded-2xl w-full md:max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">อัปโหลดเอกสาร</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => inputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
              dragging ? 'border-green-500 bg-green-500/10' : file ? 'border-green-500/40 bg-green-500/5' : 'border-white/20 hover:border-white/30'
            }`}
          >
            <input ref={inputRef} type="file" className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            {file ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-white text-sm truncate">{file.name}</span>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 mx-auto mb-1.5 text-white/30" />
                <p className="text-white/50 text-xs">ลากไฟล์มาวาง หรือคลิกเลือก</p>
              </>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-xl bg-slate-900/80 flex flex-col items-center justify-center gap-1.5">
                <Loader2 className="w-5 h-5 animate-spin text-green-400" />
                <div className="w-24 bg-white/10 rounded-full h-1">
                  <div className="bg-green-500 h-1 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>

          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="ชื่อเอกสาร *"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-green-500/50" />

          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500/50">
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <div className="flex gap-2">
            <button onClick={submit} disabled={uploading || !file}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-40 transition">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              อัปโหลด
            </button>
            <button onClick={onClose} disabled={uploading}
              className="px-3 py-2.5 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 text-sm transition disabled:opacity-40">
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function CaseDocumentsTab({
  caseId,
  caseNumber,
  cloudName,
  canEdit,
}: {
  caseId: string
  caseNumber: string
  cloudName: string
  canEdit: boolean
}) {
  const [docs, setDocs]             = useState<Doc[]>([])
  const [loading, setLoading]       = useState(true)
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [catFilter, setCatFilter]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ caseId, tab: 'all' })
      if (catFilter) p.set('category', catFilter)
      const res = await fetch(`/api/case-documents?${p}`)
      const data = await res.json()
      setDocs(data.docs ?? [])
    } catch {
      toast.error('โหลดเอกสารไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [caseId, catFilter])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500/50"
        >
          <option value="">ทุกประเภท</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {canEdit && (
          <button
            onClick={() => setShowUpload(true)}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" /> อัปโหลดเอกสาร
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-3 rounded-2xl border border-dashed border-white/10">
          <FolderOpen className="w-10 h-10 opacity-30" />
          <p className="text-sm">ไม่มีเอกสารในคดีนี้</p>
          {canEdit && (
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 text-green-400 text-sm hover:text-green-300 transition">
              <Plus className="w-4 h-4" /> อัปโหลดเอกสารแรก
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const f = doc.files[0]
            return (
              <div key={doc.id} className="group flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] rounded-2xl px-4 py-3 transition-all">
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                  {f ? <FileTypeIcon mimeType={f.mimeType} format={f.format} resourceType={f.resourceType} /> : <FileText className="w-4 h-4 text-slate-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-medium truncate">{doc.title}</p>
                    <span className={`px-2 py-0.5 rounded-lg text-[12px] font-medium shrink-0 ${CATEGORY_COLORS[doc.category] ?? CATEGORY_COLORS.OTHER}`}>
                      {CATEGORIES[doc.category] ?? doc.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-white/40">
                    <span>{doc.uploadedBy.name}</span>
                    <span>{formatDate(doc.createdAt)}</span>
                    {f?.fileSize && <span>{formatBytes(f.fileSize)}</span>}
                    {doc._count.files > 1 && <span className="text-green-400">v{f?.version ?? 1}</span>}
                  </div>
                  {doc.tags && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {doc.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="text-[12px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-lg">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setPreviewDoc(doc)} className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition" title="ดูตัวอย่าง">
                    <Eye className="w-4 h-4" />
                  </button>
                  {f && (
                    <a href={f.secureUrl ?? f.fileUrl} download={f.fileName} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition" title="ดาวน์โหลด">
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {previewDoc && <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      {showUpload && (
        <UploadMini
          caseId={caseId}
          caseNumber={caseNumber}
          cloudName={cloudName}
          onClose={() => setShowUpload(false)}
          onSuccess={() => void load()}
        />
      )}
    </div>
  )
}
