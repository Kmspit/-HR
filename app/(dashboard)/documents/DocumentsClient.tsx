'use client'

import { useEffect, useState } from 'react'
import { FileText, Plus, Loader2, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

type DocumentRequest = {
  id: string
  type: string
  purpose: string | null
  status: string
  notes: string | null
  handledAt: string | null
  createdAt: string
  user?: { name: string; employeeId: string | null; department: string | null }
  handledBy?: { name: string } | null
}

const DOC_TYPES: Record<string, string> = {
  EMPLOYMENT_CERT: 'หนังสือรับรองการทำงาน',
  SALARY_CERT: 'หนังสือรับรองเงินเดือน',
  CONTRACT_COPY: 'สำเนาสัญญาจ้างงาน',
  SALARY_SLIP: 'สลิปเงินเดือนย้อนหลัง',
  OTHER: 'เอกสารอื่นๆ',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  PROCESSING: 'กำลังดำเนินการ',
  READY: 'พร้อมรับเอกสาร',
  REJECTED: 'ไม่อนุมัติ',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  PROCESSING: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  READY: 'text-green-400 bg-green-500/10 border-green-500/20',
  REJECTED: 'text-red-400 bg-red-500/10 border-red-500/20',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function DocumentsClient({ isHr }: { isHr: boolean }) {
  const [requests, setRequests] = useState<DocumentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newType, setNewType] = useState('')
  const [newPurpose, setNewPurpose] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hrAction, setHrAction] = useState<{ id: string; status: string; notes: string } | null>(null)
  const [actioning, setActioning] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const url = statusFilter ? `/api/documents?status=${statusFilter}` : '/api/documents'
      const res = await fetch(url)
      const data = await res.json()
      setRequests(data.requests ?? [])
    } catch {
      toast.error('โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [statusFilter])

  const submitRequest = async () => {
    if (!newType) { toast.error('กรุณาเลือกประเภทเอกสาร'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType, purpose: newPurpose }),
      })
      if (!res.ok) { toast.error('ยื่นคำขอไม่สำเร็จ'); return }
      toast.success('ยื่นคำขอเอกสารแล้ว HR จะดำเนินการให้โดยเร็ว')
      setShowNew(false)
      setNewType('')
      setNewPurpose('')
      await load()
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const submitHrAction = async () => {
    if (!hrAction) return
    setActioning(true)
    try {
      const res = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hrAction),
      })
      if (!res.ok) { toast.error('อัปเดตไม่สำเร็จ'); return }
      toast.success('อัปเดตสถานะแล้ว')
      setHrAction(null)
      await load()
    } catch {
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setActioning(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {isHr && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
          >
            <option value="">ทุกสถานะ</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
        {!isHr && (
          <button
            onClick={() => setShowNew(!showNew)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" /> ยื่นคำขอใหม่
          </button>
        )}
        <button
          onClick={() => load()}
          className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition ml-auto"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* New request form */}
      {showNew && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <h3 className="text-white font-semibold text-sm">ยื่นคำขอเอกสาร</h3>
          <div>
            <label className="text-white/50 text-xs mb-1 block">ประเภทเอกสาร *</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">— เลือกประเภท —</option>
              {Object.entries(DOC_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">วัตถุประสงค์ (ไม่บังคับ)</label>
            <input
              value={newPurpose}
              onChange={(e) => setNewPurpose(e.target.value)}
              placeholder="เช่น ยื่นธนาคาร, ขอสินเชื่อ"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={submitRequest}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40 transition"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              ยื่นคำขอ
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 text-sm transition"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* HR action modal */}
      {hrAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h3 className="text-white font-semibold">อัปเดตสถานะ</h3>
            <div className="flex gap-2">
              {(['PROCESSING', 'READY', 'REJECTED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setHrAction((a) => a ? { ...a, status: s } : a)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition ${
                    hrAction.status === s
                      ? STATUS_COLORS[s]
                      : 'border-white/10 text-white/40 hover:bg-white/5'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <textarea
              value={hrAction.notes}
              onChange={(e) => setHrAction((a) => a ? { ...a, notes: e.target.value } : a)}
              placeholder="หมายเหตุ / แจ้งพนักงาน (ไม่บังคับ)"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-blue-500/50"
            />
            <div className="flex gap-2">
              <button
                onClick={submitHrAction}
                disabled={actioning}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40 transition"
              >
                {actioning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                บันทึก
              </button>
              <button
                onClick={() => setHrAction(null)}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 text-sm transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-white/30">
          <FileText className="w-10 h-10 mb-2 opacity-30" />
          <p>ไม่มีคำขอเอกสาร</p>
          {!isHr && (
            <button
              onClick={() => setShowNew(true)}
              className="mt-3 text-blue-400 text-sm hover:text-blue-300 transition"
            >
              + ยื่นคำขอแรก
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">{DOC_TYPES[r.type] ?? r.type}</p>
                  {isHr && r.user && (
                    <p className="text-white/40 text-xs mt-0.5">{r.user.name} · {r.user.department ?? '—'}</p>
                  )}
                  {r.purpose && <p className="text-white/50 text-xs mt-0.5">วัตถุประสงค์: {r.purpose}</p>}
                  <p className="text-white/30 text-xs mt-1">{formatDate(r.createdAt)}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border shrink-0 ${STATUS_COLORS[r.status]}`}>
                  {STATUS_LABELS[r.status]}
                </span>
              </div>

              {r.notes && (
                <p className="text-white/50 text-xs bg-white/5 rounded-xl px-3 py-2">{r.notes}</p>
              )}

              {r.status === 'READY' && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  เอกสารพร้อมแล้ว — ติดต่อ HR เพื่อรับเอกสาร
                </div>
              )}

              {r.status === 'REJECTED' && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <XCircle className="w-4 h-4" />
                  ไม่ได้รับอนุมัติ{r.notes ? ` — ${r.notes}` : ''}
                </div>
              )}

              {r.status === 'PROCESSING' && (
                <div className="flex items-center gap-2 text-blue-400 text-sm">
                  <Clock className="w-4 h-4" />
                  HR กำลังดำเนินการ
                </div>
              )}

              {isHr && (
                <button
                  onClick={() => setHrAction({ id: r.id, status: r.status === 'PENDING' ? 'PROCESSING' : r.status, notes: r.notes ?? '' })}
                  className="w-full py-2 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 hover:text-white text-xs font-medium transition"
                >
                  อัปเดตสถานะ
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
