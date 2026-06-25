'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { EXPENSE_CLAIM_STATUS_LABEL as STATUS_LABEL } from '@/lib/status-labels'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClaimFile { id: string; url: string; filename: string; fileType: string; size: number }
interface ExpenseClaim {
  id: string; title: string; caseNumber?: string; expenseType: string
  amount: number; date: string; note?: string; status: string
  submittedBy: { id: string; name: string; role: string }
  files: ClaimFile[]
  supervisorNote?: string; ceoNote?: string; rejectedNote?: string; paidAt?: string
}
interface Props { userId: string; userRole: string; userName: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPENSE_TYPES = ['ค่าเดินทาง','ค่าน้ำมัน','ค่าศาล','ค่าถ่ายเอกสาร','ค่าไปรษณีย์','ค่าโรงแรม','ค่าใช้จ่ายอื่น']
const CAN_APPROVE_SUP = ['SUPER_ADMIN','CEO','MANAGER_HR','HR','MANAGER','TEAM_LEADER']
const CAN_APPROVE_CEO = ['SUPER_ADMIN','CEO','MANAGER_HR']
const CAN_PAY         = ['SUPER_ADMIN','CEO','MANAGER_HR','HR']

const STATUS_COLOR: Record<string, string> = {
  PENDING:             'bg-yellow-100 text-yellow-700',
  SUPERVISOR_APPROVED: 'bg-blue-100 text-blue-700',
  CEO_APPROVED:        'bg-green-100 text-green-700',
  PAID:                'bg-emerald-100 text-emerald-700',
  REJECTED:            'bg-red-100 text-red-700',
}

function fmt(n: number) { return n.toLocaleString('th-TH', { minimumFractionDigits: 2 }) }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'numeric'}) }
function fmtSize(b: number) { return b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/(1024*1024)).toFixed(1)} MB` }

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExpenseClaimClient({ userId, userRole }: Props) {
  const [tab,         setTab]         = useState<'list'|'submit'>('list')
  const [claims,      setClaims]      = useState<ExpenseClaim[]>([])
  const [selected,    setSelected]    = useState<ExpenseClaim | null>(null)
  const [statusFilter,setStatusFilter] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [approving,   setApproving]   = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [actionNote,  setActionNote]  = useState('')
  const [showNote,    setShowNote]    = useState<string|null>(null) // action type
  const fileInputRef = useRef<HTMLInputElement>(null)

  const empty = { title:'', caseNumber:'', expenseType:EXPENSE_TYPES[0], amount:'', date:new Date().toISOString().slice(0,10), note:'' }
  const [form, setForm] = useState(empty)
  const [files, setFiles] = useState<File[]>([])

  const isEmployee  = !CAN_APPROVE_SUP.includes(userRole) || userRole === 'EMPLOYEE' || userRole === 'LAWYER' || userRole === 'ENFORCEMENT'
  const canApproveSup = CAN_APPROVE_SUP.includes(userRole)
  const canApproveCeo = CAN_APPROVE_CEO.includes(userRole)
  const canPay        = CAN_PAY.includes(userRole)

  const loadClaims = useCallback(async () => {
    setLoading(true)
    try {
      const p = statusFilter ? `status=${statusFilter}` : ''
      const r = await fetch(`/api/expense-claims?${p}`)
      if (r.ok) { const d = await r.json(); setClaims(d.items) }
    } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { loadClaims() }, [loadClaims])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSubmitting(true)
    try {
      const r = await fetch('/api/expense-claims', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      if (!r.ok) { alert('เกิดข้อผิดพลาด'); return }
      const claim = await r.json()
      // upload attached files
      for (const f of files) {
        const fd = new FormData(); fd.append('file', f)
        await fetch(`/api/expense-claims/${claim.id}/files`, { method: 'POST', body: fd })
      }
      setForm(empty); setFiles([])
      setTab('list'); loadClaims()
    } finally { setSubmitting(false) }
  }

  async function doAction(claimId: string, action: string, note?: string) {
    setApproving(true)
    try {
      const r = await fetch(`/api/expense-claims/${claimId}/approve`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ action, note: note || undefined }),
      })
      if (r.ok) {
        const updated = await r.json()
        setClaims(prev => prev.map(c => c.id === claimId ? updated : c))
        if (selected?.id === claimId) setSelected(updated)
        setShowNote(null); setActionNote('')
      }
    } finally { setApproving(false) }
  }

  async function deleteClaim(id: string) {
    if (!confirm('ลบใบเบิกนี้?')) return
    await fetch(`/api/expense-claims/${id}`, { method: 'DELETE' })
    if (selected?.id === id) setSelected(null)
    loadClaims()
  }

  async function uploadFile(claimId: string, file: File) {
    setUploadingFile(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch(`/api/expense-claims/${claimId}/files`, { method: 'POST', body: fd })
      if (r.ok) {
        const newFile = await r.json()
        setClaims(prev => prev.map(c => c.id === claimId ? { ...c, files: [...c.files, newFile] } : c))
        if (selected?.id === claimId) setSelected(prev => prev ? { ...prev, files: [...prev.files, newFile] } : prev)
      }
    } finally { setUploadingFile(false) }
  }

  const pending   = claims.filter(c => c.status === 'PENDING').length
  const approved  = claims.filter(c => ['SUPERVISOR_APPROVED','CEO_APPROVED'].includes(c.status)).length
  const paid      = claims.filter(c => c.status === 'PAID').length

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">เบิกค่าใช้จ่าย</h1>
          <p className="text-sm text-gray-500">ยื่นและติดตามสถานะการเบิกค่าใช้จ่าย</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'รอการอนุมัติ', value: pending,  color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
          { label: 'อนุมัติแล้ว',  value: approved, color: 'bg-blue-50 border-blue-200 text-blue-700' },
          { label: 'จ่ายเงินแล้ว', value: paid,     color: 'bg-green-50 border-green-200 text-green-700' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
            <p className="text-xs opacity-70 mb-1">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['list','submit'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'list' ? '📋 รายการเบิก' : '➕ ยื่นเบิกใหม่'}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ─────────────────────────────────────────────────────── */}
      {tab === 'list' && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: list */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
                <option value="">ทุกสถานะ</option>
                {Object.entries(STATUS_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {loading && <div className="text-center text-gray-400 py-8">กำลังโหลด...</div>}
            {!loading && claims.length === 0 && <div className="text-center text-gray-400 py-8">ไม่มีรายการเบิก</div>}
            <div className="space-y-2">
              {claims.map(c => (
                <div key={c.id}
                  onClick={() => setSelected(c === selected ? null : c)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all hover:border-blue-300 ${selected?.id === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{c.title}</p>
                      <p className="text-xs text-gray-500">{c.submittedBy.name} · {fmtDate(c.date)}{c.caseNumber ? ` · คดี ${c.caseNumber}` : ''}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="font-bold text-gray-800">฿{fmt(c.amount)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status] ?? 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 flex-wrap text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full">{c.expenseType}</span>
                    {c.files.length > 0 && <span>📎 {c.files.length} ไฟล์</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: detail */}
          {selected && (
            <div className="w-full lg:w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4 h-fit sticky top-4">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-800">{selected.title}</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>

              <div className="space-y-2 text-sm">
                {[
                  ['ผู้ยื่น',      selected.submittedBy.name],
                  ['ประเภท',       selected.expenseType],
                  ['จำนวนเงิน',    `฿${fmt(selected.amount)}`],
                  ['วันที่',        fmtDate(selected.date)],
                  ['เลขคดี',       selected.caseNumber ?? '—'],
                  ['สถานะ',        STATUS_LABEL[selected.status] ?? selected.status],
                ].map(([k,v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-gray-500 w-20 flex-shrink-0">{k}:</span>
                    <span className="text-gray-800 font-medium">{v}</span>
                  </div>
                ))}
                {selected.note && <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">หมายเหตุ:</span><span className="text-gray-700">{selected.note}</span></div>}
                {selected.supervisorNote && <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">หัวหน้า:</span><span className="text-gray-700">{selected.supervisorNote}</span></div>}
                {selected.ceoNote && <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">CEO:</span><span className="text-gray-700">{selected.ceoNote}</span></div>}
                {selected.rejectedNote && <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">เหตุปฏิเสธ:</span><span className="text-red-600">{selected.rejectedNote}</span></div>}
              </div>

              {/* Files */}
              {selected.files.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">ไฟล์แนบ</p>
                  <div className="space-y-1">
                    {selected.files.map(f => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-xs text-blue-600 hover:underline">
                        <span>📎</span>
                        <span className="truncate">{f.filename}</span>
                        <span className="text-gray-400 flex-shrink-0">{fmtSize(f.size)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload receipt */}
              {(selected.submittedBy.id === userId || canPay) && selected.status !== 'PAID' && (
                <div>
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.zip"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(selected.id, f) }} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50">
                    {uploadingFile ? 'กำลังอัพโหลด...' : '+ แนบไฟล์/ใบเสร็จ'}
                  </button>
                </div>
              )}

              {/* Approval actions */}
              {showNote && (
                <div className="space-y-2">
                  <textarea rows={2} value={actionNote} onChange={e => setActionNote(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm resize-none"
                    placeholder={showNote === 'reject' ? 'เหตุผลที่ปฏิเสธ (ระบุ)' : 'หมายเหตุ (ไม่บังคับ)'} />
                  <div className="flex gap-2">
                    <button onClick={() => doAction(selected.id, showNote, actionNote)} disabled={approving}
                      className={`flex-1 py-2 rounded text-white text-sm disabled:opacity-50 ${showNote==='reject' ? 'bg-red-600' : 'bg-green-600'}`}>
                      {approving ? 'กำลังบันทึก...' : 'ยืนยัน'}
                    </button>
                    <button onClick={() => { setShowNote(null); setActionNote('') }} className="flex-1 py-2 rounded border text-sm text-gray-600">ยกเลิก</button>
                  </div>
                </div>
              )}

              {!showNote && (
                <div className="flex flex-col gap-2">
                  {canApproveSup && selected.status === 'PENDING' && (
                    <button onClick={() => setShowNote('supervisor_approve')} className="py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">
                      อนุมัติขั้น 1 (หัวหน้า)
                    </button>
                  )}
                  {canApproveCeo && ['PENDING','SUPERVISOR_APPROVED'].includes(selected.status) && (
                    <button onClick={() => setShowNote('ceo_approve')} className="py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700">
                      อนุมัติ CEO
                    </button>
                  )}
                  {canPay && selected.status === 'CEO_APPROVED' && (
                    <button onClick={() => doAction(selected.id, 'mark_paid')} disabled={approving}
                      className="py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
                      {approving ? '...' : 'บันทึกว่าจ่ายเงินแล้ว'}
                    </button>
                  )}
                  {canApproveSup && !['PAID','REJECTED'].includes(selected.status) && (
                    <button onClick={() => setShowNote('reject')} className="py-2 rounded border border-red-300 text-red-600 text-sm hover:bg-red-50">
                      ปฏิเสธ
                    </button>
                  )}
                  {selected.status === 'PENDING' && selected.submittedBy.id === userId && (
                    <button onClick={() => deleteClaim(selected.id)} className="py-2 rounded border border-gray-200 text-gray-500 text-sm hover:bg-gray-50">
                      ลบใบเบิก
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SUBMIT TAB ───────────────────────────────────────────────────── */}
      {tab === 'submit' && (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4">ยื่นเบิกค่าใช้จ่าย</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">หัวข้อการเบิก *</label>
                <input required value={form.title} onChange={e => setForm({...form,title:e.target.value})}
                  className="border rounded px-3 py-2 text-sm" placeholder="เช่น ค่าเดินทางไปศาล อาทิตย์ที่ 2 มิ.ย." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">ประเภทค่าใช้จ่าย *</label>
                  <select required value={form.expenseType} onChange={e => setForm({...form,expenseType:e.target.value})} className="border rounded px-2 py-2 text-sm">
                    {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">จำนวนเงิน (บาท) *</label>
                  <input required type="number" min="0" step="0.01" value={form.amount}
                    onChange={e => setForm({...form,amount:e.target.value})} className="border rounded px-3 py-2 text-sm" placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">วันที่ *</label>
                  <input required type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} className="border rounded px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">เลขคดี</label>
                  <input value={form.caseNumber} onChange={e => setForm({...form,caseNumber:e.target.value})} className="border rounded px-3 py-2 text-sm" placeholder="เลขคดี (ถ้ามี)" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">หมายเหตุ</label>
                <textarea rows={2} value={form.note} onChange={e => setForm({...form,note:e.target.value})}
                  className="border rounded px-3 py-2 text-sm resize-none" placeholder="รายละเอียดเพิ่มเติม..." />
              </div>

              {/* File attachments */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">แนบใบเสร็จ / เอกสาร</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => document.getElementById('claim-files')?.click()}>
                  <input id="claim-files" type="file" multiple accept="image/*,.pdf,.zip" className="hidden"
                    onChange={e => setFiles(Array.from(e.target.files ?? []))} />
                  {files.length > 0
                    ? <div className="text-sm text-gray-700">{files.map(f => f.name).join(', ')}</div>
                    : <div className="text-sm text-gray-400">คลิกเพื่อเลือกไฟล์ (รองรับ JPG, PNG, PDF, ZIP)</div>
                  }
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => { setForm(empty); setFiles([]) }}
                  className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600">ล้างข้อมูล</button>
                <button type="submit" disabled={submitting}
                  className="px-6 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'กำลังส่ง...' : 'ยื่นเบิก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
