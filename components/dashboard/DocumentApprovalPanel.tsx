'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle, FileText } from 'lucide-react'
import { formatThaiDate } from '@/lib/utils'

type DocStep = {
  id: string
  stepOrder: number
  stepName: string
  status: string
}

type DocRequest = {
  id: string
  docType: string
  title: string
  docRef: string | null
  amount: number | null
  status: string
  priority: string
  currentStep: number
  totalSteps: number
  requestedBy: { name: string; role: string }
  steps: DocStep[]
  createdAt: string
}

const DOC_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'ใบแจ้งหนี้',
  EXPENSE: 'ใบเบิก',
  CONTRACT: 'สัญญา',
  TASK: 'งาน',
  OTHER: 'อื่นๆ',
}

export default function DocumentApprovalPanel() {
  const [items, setItems] = useState<DocRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/approval-requests?pending=true')
      if (!r.ok) throw new Error('โหลดไม่สำเร็จ')
      const data = await r.json()
      setItems(data.items ?? [])
    } catch {
      toast.error('โหลดคำขอเอกสารไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function act(id: string, action: 'APPROVE' | 'REJECT') {
    if (action === 'REJECT' && !comment.trim()) {
      toast.error('กรุณาระบุเหตุผลการปฏิเสธ')
      return
    }
    setActing(id)
    try {
      const r = await fetch(`/api/approval-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment: comment.trim() || undefined }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'ดำเนินการไม่สำเร็จ')
      toast.success(action === 'APPROVE' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว')
      setRejectId(null)
      setComment('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        กำลังโหลดคำขอเอกสาร…
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <section className="mt-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
        <FileText className="h-5 w-5 text-[#1E3A5F] dark:text-blue-400" />
        เอกสาร / เบิกจ่าย
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
          {items.length}
        </span>
      </h2>
      <div className="space-y-3">
        {items.map((req) => {
          const busy = acting === req.id
          const rejecting = rejectId === req.id
          const activeStep = req.steps.find((s) => s.stepOrder === req.currentStep)
          return (
            <div
              key={req.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold text-slate-900 dark:text-white">{req.title}</div>
                  <div className="mt-1 text-[13px] text-slate-500">
                    {DOC_TYPE_LABELS[req.docType] ?? req.docType}
                    {req.docRef ? ` · ${req.docRef}` : ''}
                    {' · '}{req.requestedBy.name}
                    {' · '}{formatThaiDate(req.createdAt)}
                  </div>
                  {activeStep && (
                    <div className="mt-1 text-[12px] text-blue-600 dark:text-blue-400">
                      ขั้นตอน {activeStep.stepOrder}/{req.totalSteps}: {activeStep.stepName}
                    </div>
                  )}
                  {req.amount != null && req.amount > 0 && (
                    <div className="mt-1 text-[13px] font-medium text-slate-700 dark:text-slate-300">
                      จำนวน {req.amount.toLocaleString('th-TH')} บาท
                    </div>
                  )}
                </div>
              </div>
              {rejecting ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="เหตุผลการปฏิเสธ…"
                    rows={2}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !comment.trim()}
                      onClick={() => act(req.id, 'REJECT')}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      ยืนยันปฏิเสธ
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRejectId(null); setComment('') }}
                      className="rounded-xl border px-4 py-2 text-sm text-slate-600 dark:border-white/10"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(req.id, 'APPROVE')}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    อนุมัติ
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRejectId(req.id)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-300 py-2 text-sm font-semibold text-red-600 dark:border-red-500/40 dark:text-red-400"
                  >
                    <XCircle className="h-4 w-4" />
                    ปฏิเสธ
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
