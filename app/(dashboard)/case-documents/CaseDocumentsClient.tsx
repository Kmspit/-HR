'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface DocFile {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number | null
  version: number
  createdAt: string
}

interface DocSignature {
  id: string
  signedById: string
  signerName: string
  signerRole: string
  signerPosition: string | null
  signatureType: string
  signatureUrl: string | null
  typedName: string | null
  signedAt: string
}

interface DocVersion {
  id: string
  versionNumber: number
  changeNote: string | null
  changedByName: string
  createdAt: string
}

interface CaseDoc {
  id: string
  title: string
  description: string | null
  docType: string
  caseNumber: string | null
  clientName: string | null
  department: string | null
  tags: string | null
  status: string
  createdAt: string
  updatedAt: string
  uploadedBy: { id: string; name: string; role: string }
  assignedTo: { id: string; name: string; role: string } | null
  files: DocFile[]
  signatures: DocSignature[]
  versions?: DocVersion[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'OTHER',      label: 'เอกสารทั่วไป' },
  { value: 'COMPLAINT',  label: 'คำฟ้อง' },
  { value: 'PETITION',   label: 'คำร้อง' },
  { value: 'COURT',      label: 'เอกสารศาล' },
  { value: 'POA',        label: 'หนังสือมอบอำนาจ' },
  { value: 'EVIDENCE',   label: 'หลักฐานคดี' },
  { value: 'REPORT',     label: 'รายงานติดตาม' },
  { value: 'DEBTOR',     label: 'เอกสารลูกหนี้' },
  { value: 'INTERNAL',   label: 'เอกสารภายใน' },
]

const DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d.label]))

const DEPARTMENTS = [
  { value: 'DEBT',    label: 'ฝ่ายเร่งรัดหนี้' },
  { value: 'LAW',     label: 'ฝ่ายกฎหมาย' },
  { value: 'ASSET',   label: 'ฝ่ายสืบทรัพย์' },
  { value: 'ENFORCE', label: 'ฝ่ายบังคับคดี' },
]

const DEPT_LABELS: Record<string, string> = Object.fromEntries(DEPARTMENTS.map((d) => [d.value, d.label]))

const CAN_SIGN_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER']

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   'bg-green-100 text-green-800',
  ARCHIVED: 'bg-gray-100 text-gray-600',
  REJECTED: 'bg-red-100 text-red-700',
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Upload helper (Cloudinary direct) ───────────────────────────────────────

async function uploadToCloudinary(file: File, folder: string): Promise<{ url: string; publicId: string }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? 'hr_unsigned')
  formData.append('folder', folder)

  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
  const data = await res.json()
  return { url: data.secure_url, publicId: data.public_id }
}

// ── SignatureCanvas component ────────────────────────────────────────────────

function SignatureCanvas({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current; if (!canvas) return
    drawing.current = true
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    const { x, y } = getPos(e, canvas)
    ctx.moveTo(x, y)
    e.preventDefault()
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.lineWidth = 2
    ctx.lineCap   = 'round'
    ctx.strokeStyle = '#1e3a5f'
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
    e.preventDefault()
  }

  function stop() { drawing.current = false }

  function clear() {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function save() {
    const canvas = canvasRef.current; if (!canvas) return
    onSave(canvas.toDataURL('image/png'))
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={400} height={150}
        className="border-2 border-dashed border-gray-300 rounded bg-white cursor-crosshair touch-none w-full"
        onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
      />
      <div className="flex gap-2">
        <button onClick={clear} className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
          ล้าง
        </button>
        <button onClick={save} className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">
          บันทึกลายมือชื่อ
        </button>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  userId:   string
  userName: string
  userRole: string
}

export default function CaseDocumentsClient({ userId, userName, userRole }: Props) {
  // List state
  const [docs,      setDocs]      = useState<CaseDoc[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [pages,     setPages]     = useState(1)
  const [loading,   setLoading]   = useState(true)

  // Filters
  const [q,          setQ]         = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // Selected doc detail
  const [selected,  setSelected]  = useState<CaseDoc | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Modals
  const [showCreate,  setShowCreate]  = useState(false)
  const [showSign,    setShowSign]    = useState(false)
  const [showUpload,  setShowUpload]  = useState(false)

  // Create form
  const [form, setForm] = useState({
    title: '', description: '', docType: 'OTHER', caseNumber: '',
    clientName: '', department: '', tags: '',
  })
  const [creating, setCreating] = useState(false)

  // Signature
  const [signType,      setSignType]      = useState<'TYPED' | 'DRAWN' | 'UPLOADED'>('TYPED')
  const [typedName,     setTypedName]     = useState(userName)
  const [drawnDataUrl,  setDrawnDataUrl]  = useState<string | null>(null)
  const [uploadedSigUrl,setUploadedSigUrl]= useState<string | null>(null)
  const [signing,       setSigning]       = useState(false)

  // File upload
  const [uploadFile,   setUploadFile]   = useState<File | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const sigFileRef     = useRef<HTMLInputElement>(null)

  const canSign = CAN_SIGN_ROLES.includes(userRole)

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async (pg = 1) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg) })
    if (q)          params.set('q', q)
    if (deptFilter) params.set('department', deptFilter)
    if (typeFilter) params.set('docType', typeFilter)

    const res = await fetch(`/api/case-documents?${params}`)
    if (res.ok) {
      const data = await res.json()
      setDocs(data.docs)
      setTotal(data.total)
      setPage(data.page)
      setPages(data.pages)
    }
    setLoading(false)
  }, [q, deptFilter, typeFilter])

  useEffect(() => { fetchDocs(1) }, [fetchDocs])

  // ── Fetch detail ────────────────────────────────────────────────────────────
  async function openDetail(doc: CaseDoc) {
    setDetailLoading(true)
    setSelected(doc)
    const res = await fetch(`/api/case-documents/${doc.id}`)
    if (res.ok) setSelected(await res.json())
    setDetailLoading(false)
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setCreating(true)
    const res = await fetch('/api/case-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setShowCreate(false)
      setForm({ title: '', description: '', docType: 'OTHER', caseNumber: '', clientName: '', department: '', tags: '' })
      fetchDocs(1)
    } else {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    setCreating(false)
  }

  // ── Upload file ──────────────────────────────────────────────────────────────
  async function handleFileUpload() {
    if (!uploadFile || !selected) return
    setUploading(true)
    try {
      const { url, publicId } = await uploadToCloudinary(uploadFile, `hr-system/tasks/${selected.id}`)
      const res = await fetch(`/api/case-documents/${selected.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl:  url,
          publicId,
          fileName: uploadFile.name,
          fileType: uploadFile.type,
          fileSize: uploadFile.size,
        }),
      })
      if (res.ok) {
        setShowUpload(false)
        setUploadFile(null)
        openDetail(selected)
      } else {
        alert('อัพโหลดไม่สำเร็จ')
      }
    } catch {
      alert('อัพโหลดไม่สำเร็จ')
    }
    setUploading(false)
  }

  // ── Sign ─────────────────────────────────────────────────────────────────────
  async function handleSign() {
    if (!selected) return
    setSigning(true)

    let signatureData: string | null = null
    if (signType === 'DRAWN') {
      if (!drawnDataUrl) { alert('กรุณาวาดลายมือชื่อ'); setSigning(false); return }
      signatureData = drawnDataUrl
    } else if (signType === 'UPLOADED') {
      if (!uploadedSigUrl) { alert('กรุณาอัพโหลดลายมือชื่อ'); setSigning(false); return }
      signatureData = uploadedSigUrl
    }

    const res = await fetch(`/api/case-documents/${selected.id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureType: signType, typedName, signatureData }),
    })
    if (res.ok) {
      setShowSign(false)
      setDrawnDataUrl(null)
      openDetail(selected)
    } else {
      const err = await res.json()
      alert(err.error ?? 'เกิดข้อผิดพลาด')
    }
    setSigning(false)
  }

  async function handleUploadedSig(file: File) {
    try {
      const { url } = await uploadToCloudinary(file, 'hr-system/signatures')
      setUploadedSigUrl(url)
    } catch { alert('อัพโหลดลายมือชื่อไม่สำเร็จ') }
  }

  // ── Delete doc ───────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบเอกสารนี้?')) return
    const res = await fetch(`/api/case-documents/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setSelected(null)
      fetchDocs(page)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 flex flex-col gap-4">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchDocs(1)}
          placeholder="ค้นหาชื่อ / เลขคดี / ลูกค้า"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 min-w-48"
        />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm">
          <option value="">ทุกฝ่าย</option>
          {DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm">
          <option value="">ทุกประเภท</option>
          {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={() => fetchDocs(1)}
          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200">
          ค้นหา
        </button>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 ml-auto">
          + เพิ่มเอกสาร
        </button>
      </div>

      <div className="flex gap-4 items-start">

        {/* ── Doc list ── */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 mb-2">ทั้งหมด {total} รายการ</div>
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">กำลังโหลด...</div>
          ) : docs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">ยังไม่มีเอกสาร</div>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map((doc) => (
                <div key={doc.id}
                  onClick={() => openDetail(doc)}
                  className={`border rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors ${selected?.id === doc.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate">{doc.title}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                        {doc.caseNumber && <span>เลขคดี: {doc.caseNumber}</span>}
                        {doc.clientName && <span>ลูกค้า: {doc.clientName}</span>}
                        {doc.department && <span>{DEPT_LABELS[doc.department] ?? doc.department}</span>}
                        <span>{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[doc.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {doc.status === 'ACTIVE' ? 'ใช้งาน' : doc.status === 'ARCHIVED' ? 'เก็บถาวร' : doc.status}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(doc.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                    <span>ไฟล์ {doc.files.length} ไฟล์</span>
                    <span>ลายมือชื่อ {doc.signatures.length}</span>
                    <span>โดย {doc.uploadedBy.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex gap-1 mt-4 justify-center">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => fetchDocs(p)}
                  className={`w-8 h-8 rounded text-sm ${p === page ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selected && (
          <div className="w-96 shrink-0 bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4 sticky top-4">
            {detailLoading && <div className="text-center text-sm text-gray-400 py-6">กำลังโหลด...</div>}

            {!detailLoading && (
              <>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 leading-tight">{selected.title}</h3>
                    <div className="text-xs text-gray-500 mt-0.5">{DOC_TYPE_LABELS[selected.docType] ?? selected.docType}</div>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                  {selected.caseNumber && <><span className="text-gray-400">เลขคดี</span><span>{selected.caseNumber}</span></>}
                  {selected.clientName && <><span className="text-gray-400">ลูกค้า</span><span>{selected.clientName}</span></>}
                  {selected.department && <><span className="text-gray-400">ฝ่าย</span><span>{DEPT_LABELS[selected.department] ?? selected.department}</span></>}
                  <span className="text-gray-400">สถานะ</span>
                  <span className={`px-1.5 py-0.5 rounded-full font-medium w-fit ${STATUS_COLORS[selected.status] ?? ''}`}>
                    {selected.status === 'ACTIVE' ? 'ใช้งาน' : selected.status}
                  </span>
                  <span className="text-gray-400">อัพเดท</span><span>{fmtDate(selected.updatedAt)}</span>
                  <span className="text-gray-400">โดย</span><span>{selected.uploadedBy.name}</span>
                </div>

                {selected.description && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded p-2">{selected.description}</p>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setShowUpload(true)}
                    className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700">
                    อัพโหลดไฟล์
                  </button>
                  {canSign && (
                    <button onClick={() => setShowSign(true)}
                      className="text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700">
                      ลงลายมือชื่อ
                    </button>
                  )}
                  {(selected.uploadedBy.id === userId || ['SUPER_ADMIN','CEO','MANAGER_HR','HR'].includes(userRole)) && (
                    <button onClick={() => handleDelete(selected.id)}
                      className="text-xs px-3 py-1.5 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100">
                      ลบ
                    </button>
                  )}
                </div>

                {/* Files */}
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-1.5">ไฟล์แนบ ({selected.files.length})</div>
                  {selected.files.length === 0 ? (
                    <div className="text-xs text-gray-400">ยังไม่มีไฟล์</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {selected.files.map((f) => (
                        <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 text-xs text-blue-600 hover:underline bg-gray-50 rounded px-2 py-1.5">
                          <span className="text-gray-400">📄</span>
                          <span className="flex-1 truncate">{f.fileName}</span>
                          <span className="text-gray-400 shrink-0">v{f.version} {fmtSize(f.fileSize)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Signatures */}
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-1.5">ลายมือชื่อ ({selected.signatures.length})</div>
                  {selected.signatures.length === 0 ? (
                    <div className="text-xs text-gray-400">ยังไม่มีลายมือชื่อ</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selected.signatures.map((s) => (
                        <div key={s.id} className="border border-gray-100 rounded p-2 bg-gray-50">
                          <div className="text-xs font-medium text-gray-800">{s.signerName}</div>
                          <div className="text-xs text-gray-500">{s.signerPosition ?? s.signerRole}</div>
                          <div className="text-xs text-gray-400 mt-1">{fmtDate(s.signedAt)} · {s.signatureType === 'TYPED' ? 'พิมพ์ชื่อ' : s.signatureType === 'DRAWN' ? 'วาด' : 'อัพโหลด'}</div>
                          {s.signatureType === 'TYPED' && s.typedName && (
                            <div className="mt-1 font-serif italic text-blue-800 text-sm border-b border-blue-300 w-fit px-1">{s.typedName}</div>
                          )}
                          {(s.signatureType === 'DRAWN' || s.signatureType === 'UPLOADED') && s.signatureUrl && (
                            <img src={s.signatureUrl} alt="signature" className="mt-1 h-12 object-contain" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Version history */}
                {selected.versions && selected.versions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1.5">ประวัติการแก้ไข</div>
                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                      {selected.versions.map((v) => (
                        <div key={v.id} className="flex gap-2 text-xs text-gray-500">
                          <span className="text-gray-300">v{v.versionNumber}</span>
                          <span className="flex-1">{v.changeNote}</span>
                          <span className="shrink-0">{fmtDate(v.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ══ Create Modal ══════════════════════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold text-gray-800 text-lg">เพิ่มเอกสารใหม่</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">ชื่อเอกสาร *</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="ชื่อเอกสาร" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">ประเภทเอกสาร</label>
                  <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-2 text-sm">
                    {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">ฝ่าย</label>
                  <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-2 text-sm">
                    <option value="">-- ไม่ระบุ --</option>
                    {DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">เลขคดี</label>
                  <input value={form.caseNumber} onChange={(e) => setForm({ ...form, caseNumber: e.target.value })}
                    className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="เลขคดี" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">ชื่อลูกค้า</label>
                  <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="ชื่อลูกค้า" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">หมายเหตุ</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2} className="border border-gray-300 rounded px-3 py-2 text-sm resize-none" placeholder="หมายเหตุ..." />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">แท็ก (คั่นด้วย ,)</label>
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="แท็ก, คีย์เวิร์ด" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                  ยกเลิก
                </button>
                <button type="submit" disabled={creating}
                  className="px-5 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
                  {creating ? 'กำลังสร้าง...' : 'สร้างเอกสาร'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Upload File Modal ═════════════════════════════════════════════════ */}
      {showUpload && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <h2 className="font-semibold text-gray-800">อัพโหลดไฟล์ — {selected.title}</h2>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
              {uploadFile ? (
                <div>
                  <div className="text-sm font-medium text-gray-800">{uploadFile.name}</div>
                  <div className="text-xs text-gray-500">{fmtSize(uploadFile.size)}</div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">คลิกเพื่อเลือกไฟล์</div>
              )}
            </div>
            <input ref={fileInputRef} type="file" className="hidden"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowUpload(false); setUploadFile(null) }}
                className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                ยกเลิก
              </button>
              <button onClick={handleFileUpload} disabled={!uploadFile || uploading}
                className="px-5 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50">
                {uploading ? 'กำลังอัพโหลด...' : 'อัพโหลด'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Sign Modal ════════════════════════════════════════════════════════ */}
      {showSign && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold text-gray-800">ลงลายมือชื่อ — {selected.title}</h2>

            {/* Sign type selector */}
            <div className="flex gap-2">
              {(['TYPED', 'DRAWN', 'UPLOADED'] as const).map((t) => (
                <button key={t} onClick={() => setSignType(t)}
                  className={`flex-1 py-2 rounded text-xs font-medium border transition-colors ${signType === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {t === 'TYPED' ? 'พิมพ์ชื่อ' : t === 'DRAWN' ? 'วาดลายมือ' : 'อัพโหลดรูป'}
                </button>
              ))}
            </div>

            {signType === 'TYPED' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">ชื่อที่จะแสดง</label>
                <input value={typedName} onChange={(e) => setTypedName(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm" />
                {typedName && (
                  <div className="mt-2 p-3 bg-blue-50 rounded border border-blue-100 text-center font-serif italic text-blue-900 text-xl">
                    {typedName}
                  </div>
                )}
              </div>
            )}

            {signType === 'DRAWN' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-700">วาดลายมือชื่อ</label>
                <SignatureCanvas onSave={setDrawnDataUrl} />
                {drawnDataUrl && (
                  <img src={drawnDataUrl} alt="preview" className="h-16 object-contain border rounded" />
                )}
              </div>
            )}

            {signType === 'UPLOADED' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-700">อัพโหลดรูปลายมือชื่อ</label>
                <button onClick={() => sigFileRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded p-4 text-sm text-gray-500 hover:border-blue-400 hover:bg-blue-50 text-center cursor-pointer">
                  คลิกเพื่อเลือกรูปภาพ
                </button>
                <input ref={sigFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadedSig(f) }} />
                {uploadedSigUrl && <img src={uploadedSigUrl} alt="sig" className="h-16 object-contain border rounded" />}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => { setShowSign(false); setDrawnDataUrl(null); setUploadedSigUrl(null) }}
                className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                ยกเลิก
              </button>
              <button onClick={handleSign} disabled={signing}
                className="px-5 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50">
                {signing ? 'กำลังบันทึก...' : 'ยืนยันลายมือชื่อ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
