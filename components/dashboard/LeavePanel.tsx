'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Loader2, Paperclip } from 'lucide-react'
import { formatThaiDate } from '@/lib/utils'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { LEAVE_TYPE_OPTIONS, LEAVE_TYPE_LABELS } from '@/lib/leave-types'

type Leave = { id: string; type: string; startDate: string; endDate: string; days: number; reason: string; status: string; attachmentUrl?: string | null; createdAt: string }
type Balance = { sick: number; vacation: number; personal: number } | null

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-yellow-400 bg-yellow-500/10',
  ADMIN_APPROVED: 'text-blue-400 bg-blue-500/10',
  APPROVED: 'text-green-400 bg-green-500/10',
  REJECTED: 'text-red-400 bg-red-500/10',
}
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'รออนุมัติ', ADMIN_APPROVED: 'ผ่าน Admin', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ปฏิเสธ',
}

export default function LeavePanel({ leaves, balance }: { leaves: Leave[]; balance: Balance }) {
  const [tab, setTab] = useState<'request' | 'history'>('request')
  const [loading, setLoading] = useState(false)
  const [attachment, setAttachment] = useState<File | null>(null)
  const [form, setForm] = useState({ type: 'SICK', startDate: '', endDate: '', reason: '' })
  const router = useRouter()

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.startDate || !form.endDate || !form.reason) { toast.error('กรุณากรอกข้อมูลให้ครบ'); return }
    const days = Math.ceil((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1
    if (days < 1) { toast.error('วันที่ไม่ถูกต้อง'); return }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('type', form.type)
      formData.append('startDate', form.startDate)
      formData.append('endDate', form.endDate)
      formData.append('days', String(days))
      formData.append('reason', form.reason)
      if (attachment) formData.append('attachment', attachment)

      const { ok, data, status } = await apiJson('/api/leave', { method: 'POST', body: formData })
      if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }
      toast.success('ส่งคำขอลาเรียบร้อย รอ Admin อนุมัติ')
      setForm({ type: 'SICK', startDate: '', endDate: '', reason: '' })
      setAttachment(null)
      router.refresh()
      setTab('history')
    } catch (err) {
      console.error('[leave]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  const inputCls = 'w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/50'

  return (
    <div className="p-4 md:p-5 space-y-5 max-w-full overflow-x-hidden">
      {balance && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'ลาป่วยคงเหลือ', value: balance.sick, icon: '🤒', color: 'text-red-400' },
            { label: 'ลาพักร้อน', value: balance.vacation, icon: '🏖️', color: 'text-green-400' },
            { label: 'ลากิจ', value: balance.personal, icon: '🗓️', color: 'text-blue-400' },
          ].map((b) => (
            <div key={b.label} className="rounded-2xl border border-white/5 bg-slate-900 p-4 text-center">
              <span className="text-2xl">{b.icon}</span>
              <p className={`mt-1 text-2xl font-extrabold ${b.color}`}>{b.value}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{b.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5">
        {[{ id: 'request' as const, label: '📝 ยื่นคำขอลา' }, { id: 'history' as const, label: `📜 ประวัติ (${leaves.length})` }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 items-center justify-center rounded-lg py-2 text-xs font-semibold transition-all ${tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'request' && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/5 bg-slate-900 p-4 md:p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">ประเภทการลา</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LEAVE_TYPE_OPTIONS.map((t) => (
                <label key={t.value} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-all ${form.type === t.value ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 hover:border-white/20'}`}>
                  <input type="radio" name="type" value={t.value} checked={form.type === t.value} onChange={(e) => set('type', e.target.value)} className="accent-blue-500" />
                  <span className="text-sm text-white">{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0 space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">จากวันที่ *</label>
              <input type="date" className={`${inputCls} min-w-0 max-w-full`} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} required />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">ถึงวันที่ *</label>
              <input type="date" className={`${inputCls} min-w-0 max-w-full`} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">เหตุผลการลา *</label>
            <textarea rows={3} placeholder="ระบุเหตุผล..." className={`${inputCls} resize-none py-2.5`} value={form.reason} onChange={(e) => set('reason', e.target.value)} required />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">แนบเอกสาร (ใบรับรองแพทย์ ฯลฯ)</label>
            <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm text-slate-400 hover:border-blue-500/40">
              <Paperclip className="w-4 h-4" />
              {attachment ? attachment.name : 'เลือกไฟล์ PDF / รูปภาพ'}
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all disabled:opacity-60">
            {loading ? <><Loader2 size={16} className="animate-spin" /> กำลังส่ง...</> : '📤 ส่งคำขออนุมัติ'}
          </button>
        </form>
      )}

      {tab === 'history' && (
        <div className="space-y-2">
          {leaves.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 p-8 text-center text-slate-500">ยังไม่มีประวัติการลา</div>
          ) : leaves.map((l) => (
            <div key={l.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-white">{LEAVE_TYPE_LABELS[l.type] ?? l.type}</p>
                <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[l.status] ?? 'text-slate-400 bg-slate-700'}`}>{STATUS_LABELS[l.status] ?? l.status}</span>
              </div>
              <p className="text-xs text-slate-400">{formatThaiDate(l.startDate)} — {formatThaiDate(l.endDate)} ({l.days} วัน)</p>
              {l.reason && <p className="mt-1.5 text-xs text-slate-300 bg-white/5 rounded-lg px-3 py-1.5">{l.reason}</p>}
              {l.attachmentUrl && (
                <a href={l.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-blue-400 hover:underline">
                  📎 ดูเอกสารแนบ
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
