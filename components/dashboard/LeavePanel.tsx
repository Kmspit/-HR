'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Paperclip, Info, Plus, FileText } from 'lucide-react'
import { formatThaiDate } from '@/lib/utils'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { useSuccessAnimation } from '@/components/motion'
import MotionButton from '@/components/motion/MotionButton'
import { LEAVE_TYPE_OPTIONS, LEAVE_TYPE_LABELS } from '@/lib/leave-types'
import type { LeaveBalanceStats } from '@/lib/leave-balance'
import { leaveSchema } from '@/lib/validations/leave'

type Leave = {
  id: string
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string
  status: string
  attachmentUrl?: string | null
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:        'text-amber-700 bg-amber-100 dark:text-yellow-400 dark:bg-yellow-500/10',
  ADMIN_APPROVED: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-500/10',
  APPROVED:       'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-500/10',
  REJECTED:       'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/10',
}
const STATUS_LABELS: Record<string, string> = {
  PENDING:        'รออนุมัติ',
  ADMIN_APPROVED: 'ผ่าน Admin',
  APPROVED:       'อนุมัติแล้ว',
  REJECTED:       'ปฏิเสธ',
}

type HolidayConflict = { date: string; holidayName: string; typeLabel: string }

function ProgressBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const isOver = used > total
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function BalanceCard({
  label, icon, used, total, colorClass, barColor,
}: {
  label: string; icon: string; used: number; total: number; colorClass: string; barColor: string
}) {
  const remaining = Math.max(0, total - used)
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900 p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className={`text-2xl font-extrabold leading-none ${colorClass}`}>{remaining}</p>
          <p className="text-[12px] text-slate-600 mt-1">คงเหลือ</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">{used} / {total} วัน</p>
          <p className="text-[12px] text-slate-600">ใช้แล้ว</p>
        </div>
      </div>
      <ProgressBar used={used} total={total} color={barColor} />
    </div>
  )
}

export default function LeavePanel({
  leaves,
  stats,
  branchId,
}: {
  leaves: Leave[]
  stats: LeaveBalanceStats
  branchId: string | null
}) {
  const [tab, setTab] = useState<'request' | 'history'>('request')
  const [loading, setLoading] = useState(false)
  const [checkingHolidays, setCheckingHolidays] = useState(false)
  const [holidayBlock, setHolidayBlock] = useState<{ message: string; conflicts: HolidayConflict[] } | null>(null)
  const [attachment, setAttachment] = useState<File | null>(null)
  const [form, setForm] = useState({ type: 'SICK', startDate: '', endDate: '', reason: '' })
  const router = useRouter()
  const triggerSuccess = useSuccessAnimation()

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const isOrdination = form.type === 'ORDINATION'

  useEffect(() => {
    if (!form.startDate || !form.endDate) { setHolidayBlock(null); return }
    const t = setTimeout(async () => {
      setCheckingHolidays(true)
      const q = new URLSearchParams({ startDate: form.startDate, endDate: form.endDate })
      if (branchId) q.set('branchId', branchId)
      const { ok, data } = await apiJson<{ blocked?: boolean; message?: string; conflicts?: HolidayConflict[] }>(
        `/api/holidays/check?${q}`,
      )
      setCheckingHolidays(false)
      if (ok && data.blocked) {
        setHolidayBlock({ message: data.message ?? 'ช่วงวันที่มีวันหยุด', conflicts: data.conflicts ?? [] })
      } else {
        setHolidayBlock(null)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [form.startDate, form.endDate, branchId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validation = leaveSchema.safeParse(form)
    if (!validation.success) { toast.error(validation.error.issues[0].message); return }
    const days = Math.ceil((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1
    if (days < 1) { toast.error('วันที่ไม่ถูกต้อง'); return }
    if (holidayBlock && !isOrdination) { toast.error(holidayBlock.message); return }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('type', form.type)
      formData.append('startDate', form.startDate)
      formData.append('endDate', form.endDate)
      formData.append('days', String(days))
      formData.append('reason', form.reason)
      if (attachment) formData.append('attachment', attachment)

      const { ok, data, status } = await apiJson<{ autoApproved?: boolean }>('/api/leave', {
        method: 'POST',
        body: formData,
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status)); return }

      if (data.autoApproved) {
        toast.success('🙏 ส่งคำขอลาบวชแล้ว — อนุมัติอัตโนมัติ')
      } else {
        toast.success('ส่งคำขอลาเรียบร้อย รอ Admin อนุมัติ')
      }
      triggerSuccess('leave')
      setForm({ type: 'SICK', startDate: '', endDate: '', reason: '' })
      setAttachment(null)
      router.refresh()
      setTab('history')
    } catch (err) {
      console.error('[leave]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  const inputCls = 'w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-green-500/50 focus:ring-2 focus:ring-green-500/50'

  const { used, remaining, balance, isProbation } = stats

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-full overflow-x-hidden">

      {/* Probation warning */}
      {isProbation && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-400">อยู่ในช่วงทดลองงาน</p>
            <p className="text-xs text-amber-200/80 mt-0.5">ยังไม่มีสิทธิ์ลาพักร้อน — สิทธิ์จะเริ่มหลังผ่านช่วงทดลองงาน</p>
          </div>
        </div>
      )}

      {/* Extra types used (ordination etc.) */}
      {(used.ORDINATION > 0 || used.FUNERAL > 0 || used.WEDDING > 0 || used.MATERNITY > 0) && (
        <div className="rounded-xl border border-white/5 bg-slate-900 px-4 py-3">
          <p className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider mb-2">วันลาประเภทอื่น (ปีนี้)</p>
          <div className="flex flex-wrap gap-3">
            {[
              { key: 'ORDINATION', label: '🙏 ลาบวช', val: used.ORDINATION },
              { key: 'FUNERAL',    label: '⚱️ ลาพิธีศพ', val: used.FUNERAL },
              { key: 'WEDDING',    label: '💒 แต่งงาน', val: used.WEDDING },
              { key: 'MATERNITY',  label: '👶 ลาคลอด', val: used.MATERNITY },
            ].filter((i) => i.val > 0).map((i) => (
              <span key={i.key} className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                {i.label} <span className="font-bold text-white">{i.val}</span> วัน
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5">
        {[
          { id: 'request' as const, label: '📝 ยื่นคำขอลา' },
          { id: 'history' as const, label: `📜 ประวัติ (${leaves.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center rounded-lg py-2 text-xs font-semibold transition-all ${
              tab === t.id ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'request' && (
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Balance summary — visible only in request tab */}
          <div className="grid grid-cols-3 gap-2">
            <BalanceCard label="ลาป่วย" icon="🤒" used={used.SICK} total={balance.sick} colorClass="text-red-600 dark:text-red-400" barColor="bg-red-500" />
            <BalanceCard
              label="ลาพักร้อน"
              icon="🏖️"
              used={used.VACATION}
              total={balance.vacation}
              colorClass={isProbation ? 'text-slate-600' : 'text-green-700 dark:text-green-400'}
              barColor="bg-green-500"
            />
            <BalanceCard label="ลากิจ" icon="🗓️" used={used.PERSONAL} total={balance.personal} colorClass="text-green-700 dark:text-green-400" barColor="bg-green-500" />
          </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900 p-4 md:p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">ประเภทการลา</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LEAVE_TYPE_OPTIONS.map((t) => {
                const isVacation = t.value === 'VACATION'
                const isDisabledVacation = isVacation && isProbation
                return (
                  <label
                    key={t.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-all ${
                      isDisabledVacation
                        ? 'border-white/5 opacity-40 cursor-not-allowed'
                        : form.type === t.value
                          ? t.value === 'ORDINATION'
                            ? 'border-purple-500/50 bg-purple-500/10'
                            : 'border-green-500/50 bg-green-500/10'
                          : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={t.value}
                      checked={form.type === t.value}
                      onChange={(e) => !isDisabledVacation && set('type', e.target.value)}
                      disabled={isDisabledVacation}
                      className="accent-green-500"
                    />
                    <span className="text-sm text-white flex-1">{t.label}</span>
                    {t.value === 'ORDINATION' && (
                      <span className="text-[12px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-md font-semibold">อัตโนมัติ</span>
                    )}
                    {isDisabledVacation && (
                      <span className="text-[12px] text-amber-400">ทดลองงาน</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Ordination hint */}
          {isOrdination && (
            <div className="flex items-start gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2.5">
              <span className="text-lg leading-none">🙏</span>
              <p className="text-xs text-purple-200">
                <span className="font-semibold">ลาบวช อนุมัติอัตโนมัติ</span> — ไม่ต้องรอ Approver จะอนุมัติทันทีหลังส่ง
              </p>
            </div>
          )}

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

          {(checkingHolidays || holidayBlock) && !isOrdination && (
            <div className={`rounded-xl border p-3 text-sm ${holidayBlock ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-white/5 text-slate-400'}`}>
              {checkingHolidays ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบวันหยุด...</span>
              ) : holidayBlock ? (
                <div>
                  <p className="font-semibold flex items-center gap-2 text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> ไม่สามารถลาในวันหยุดได้
                  </p>
                  <p className="text-xs mt-1.5 text-amber-200/90">{holidayBlock.message}</p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-200/80">
                    {holidayBlock.conflicts.map((c) => (
                      <li key={c.date}>{c.date} — {c.typeLabel}: {c.holidayName}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">เหตุผลการลา *</label>
            <textarea rows={3} placeholder="ระบุเหตุผล..." className={`${inputCls} resize-none py-2.5`} value={form.reason} onChange={(e) => set('reason', e.target.value)} required />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">แนบเอกสาร (ใบรับรองแพทย์ ฯลฯ)</label>
            <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm text-slate-400 hover:border-green-500/40">
              <Paperclip className="w-4 h-4" />
              {attachment ? attachment.name : 'เลือกไฟล์ PDF / รูปภาพ'}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <MotionButton
            type="submit"
            disabled={loading || (!!holidayBlock && !isOrdination) || checkingHolidays}
            variant="primary"
            className={`w-full ${isOrdination ? 'bg-purple-600 hover:bg-purple-500' : ''}`}
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> กำลังส่ง...</>
              : isOrdination ? '🙏 ส่งคำขอลาบวช (อัตโนมัติ)' : '📤 ส่งคำขออนุมัติ'}
          </MotionButton>
        </div>
        </form>
      )}

      {/* Mobile FAB — ยื่นคำขอลา (shows only when viewing history) */}
      {tab === 'history' && (
        <button
          type="button"
          onClick={() => setTab('request')}
          className="md:hidden fixed z-30 right-4 flex items-center gap-2 rounded-2xl bg-green-600 px-5 py-3.5 text-[14px] font-bold text-white shadow-lg shadow-green-600/30 active:scale-95 transition-transform"
          style={{ bottom: 'calc(58px + env(safe-area-inset-bottom) + 16px)' }}
        >
          <Plus className="w-4 h-4" />
          ยื่นคำขอลา
        </button>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {leaves.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-slate-900 py-14 text-center space-y-3">
              <FileText className="w-12 h-12 mx-auto text-slate-600" />
              <p className="font-semibold text-white text-[15px]">ยังไม่มีประวัติการลา</p>
              <p className="text-[13px] text-slate-500">เมื่อยื่นคำขอลา ประวัติจะแสดงที่นี่</p>
              <button
                type="button"
                onClick={() => setTab('request')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 transition-colors"
              >
                <Plus className="w-4 h-4" /> ยื่นคำขอลาแรก
              </button>
            </div>
          ) : leaves.map((l) => (
            <div key={l.id} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-white">{LEAVE_TYPE_LABELS[l.type] ?? l.type}</p>
                  {l.type === 'ORDINATION' && l.status === 'APPROVED' && (
                    <span className="rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[12px] font-semibold text-purple-300">อัตโนมัติ</span>
                  )}
                </div>
                <span className={`rounded-lg px-2 py-0.5 text-[12px] font-bold ${STATUS_COLORS[l.status] ?? 'text-slate-400 bg-slate-700'}`}>
                  {STATUS_LABELS[l.status] ?? l.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">{formatThaiDate(l.startDate)} — {formatThaiDate(l.endDate)} ({l.days} วัน)</p>
              {l.reason && <p className="mt-1.5 text-xs text-slate-300 bg-white/5 rounded-lg px-3 py-1.5">{l.reason}</p>}
              {l.attachmentUrl && (
                <a href={l.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-green-400 hover:underline">
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
