'use client'

import { useState } from 'react'
import { MapPin, Clock, Loader2, History, CheckCircle2, Edit3, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type Request = {
  id: string
  userId: string
  userName: string
  userDept: string
  userPosition: string
  date: string
  startTime: string
  endTime: string
  place: string
  purpose: string
  client: string
  note: string
  status: string
  createdAt: string
}

const STATUS_STYLE: Record<string, string> = {
  PENDING:        'bg-yellow-500/20 text-yellow-400',
  ADMIN_APPROVED: 'bg-blue-500/20 text-blue-400',
  APPROVED:       'bg-green-500/20 text-green-400',
  REJECTED:       'bg-red-500/20 text-red-400',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:        'รอ Admin',
  ADMIN_APPROVED: 'รอ Final Approve',
  APPROVED:       'อนุมัติแล้ว',
  REJECTED:       'ปฏิเสธแล้ว',
}

type Props = {
  canViewAll: boolean
  canApproveOutside: boolean
  requests: Request[]
}

function EditPlaceModal({
  requestId,
  currentPlace,
  currentNote,
  currentStartTime,
  currentEndTime,
  onClose,
  onSaved,
}: {
  requestId: string
  currentPlace: string
  currentNote: string
  currentStartTime: string
  currentEndTime: string
  onClose: () => void
  onSaved: () => void
}) {
  const [place, setPlace] = useState(currentPlace)
  const [note, setNote] = useState(currentNote)
  const [startTime, setStartTime] = useState(currentStartTime)
  const [endTime, setEndTime] = useState(currentEndTime)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!place.trim()) { toast.error('กรุณาระบุสถานที่'); return }
    setSaving(true)
    try {
      const { ok, data, status } = await apiJson(`/api/outside-work/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place, note, startTime, endTime }),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status)); return }
      toast.success('แก้ไขสถานที่เรียบร้อย')
      onSaved()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const inputCls = 'w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">แก้ไขรายละเอียด (HR)</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">สถานที่ *</label>
            <input value={place} onChange={(e) => setPlace(e.target.value)} className={inputCls} placeholder="ชื่อสถานที่" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">เวลาออก</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">เวลากลับ</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">หมายเหตุ HR</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="(ถ้ามี)" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OutsideWorkClient({ canViewAll, canApproveOutside, requests: init }: Props) {
  const [tab, setTab] = useState<'request' | 'history'>('request')
  const [form, setForm] = useState({
    date: '',
    startTime: '09:00',
    endTime: '17:00',
    place: '',
    purpose: '',
    client: '',
    note: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [requests, setRequests] = useState<Request[]>(init)
  const router = useRouter()

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.date || !form.place || !form.purpose) {
      toast.error('กรุณากรอกข้อมูลให้ครบ')
      return
    }
    setSubmitting(true)
    try {
      const { ok, data, status } = await apiJson<{ request: Request }>('/api/outside-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!ok) {
        toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
        return
      }
      toast.success('ส่งคำขอแล้ว รอ Approver ตรวจสอบ')
      setForm({ date: '', startTime: '09:00', endTime: '17:00', place: '', purpose: '', client: '', note: '' })
      router.refresh()
      setTab('history')
    } catch (err) {
      console.error('[outside-work]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaved = () => {
    setEditingId(null)
    router.refresh()
  }

  const inputCls =
    'w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/50'

  const editingRequest = editingId ? requests.find((r) => r.id === editingId) : null

  return (
    <div className="p-4 md:p-5 space-y-5 max-w-full overflow-x-hidden">
      {editingRequest && (
        <EditPlaceModal
          requestId={editingRequest.id}
          currentPlace={editingRequest.place}
          currentNote={editingRequest.note}
          currentStartTime={editingRequest.startTime}
          currentEndTime={editingRequest.endTime}
          onClose={() => setEditingId(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5">
        {[
          { id: 'request' as const, label: '📝 ขอออกนอกสถานที่' },
          {
            id: 'history' as const,
            label: canViewAll
              ? `📜 ประวัติทุกคน (${requests.length})`
              : `📜 ประวัติของฉัน (${requests.length})`,
          },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-1 min-h-[40px] items-center justify-center rounded-lg px-2 py-2.5 text-xs font-semibold transition-all touch-manipulation ${
              tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'request' && (
        <div className="rounded-2xl border border-white/5 bg-slate-900 p-4 md:p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-white text-[15px]">แบบฟอร์มขอออกนอกสถานที่</h3>
            <p className="text-xs text-slate-500 mt-1">
              หลังอนุมัติแล้วสามารถเช็คอินนอกบริษัทได้ · กฎสาย: เช็คอินหลัง 09:00 = สาย
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'วันที่ *', key: 'date' as const, type: 'date' },
              { label: 'เวลาออก *', key: 'startTime' as const, type: 'time' },
              { label: 'เวลากลับ *', key: 'endTime' as const, type: 'time' },
            ].map(({ label, key, type }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className={inputCls}
                />
              </div>
            ))}
          </div>

          {[
            { label: 'สถานที่ปฏิบัติงาน *', key: 'place' as const, placeholder: 'ชื่อสถานที่ / ที่อยู่' },
            { label: 'วัตถุประสงค์ *', key: 'purpose' as const, placeholder: 'เหตุผล / ภารกิจ' },
            { label: 'ชื่อลูกค้า / ผู้ติดต่อ', key: 'client' as const, placeholder: '(ถ้ามี)' },
            { label: 'หมายเหตุ', key: 'note' as const, placeholder: '' },
          ].map(({ label, key, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
              <input
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                className={inputCls}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full min-h-[44px] rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition disabled:opacity-50 touch-manipulation"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> กำลังส่ง...
              </span>
            ) : (
              'ส่งคำขอออกนอกสถานที่'
            )}
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {canViewAll && (
            <p className="text-xs text-slate-500 px-1">
              แสดงคำขอออกนอกสถานที่ของพนักงาน · เรียงจากล่าสุด
            </p>
          )}
          {requests.map((r) => (
            <div
              key={r.id}
              className={`rounded-2xl border p-4 transition ${
                r.status === 'APPROVED'
                  ? 'border-green-500/30 bg-green-500/5'
                  : r.status === 'REJECTED'
                    ? 'border-red-500/20 bg-slate-900'
                    : 'border-white/5 bg-slate-900'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  {canViewAll && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-400">
                        {r.userName[0] ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{r.userName}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {r.userPosition || '—'} · {r.userDept || '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Approved badge */}
                  {r.status === 'APPROVED' && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-green-500/15 border border-green-500/30 px-2.5 py-1.5 w-fit">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      <span className="text-xs font-semibold text-green-400">อนุมัติแล้ว — เช็คอินนอกบริษัทได้</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-white font-medium">
                    <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="truncate">{r.place}</span>
                    {canApproveOutside && (
                      <button
                        type="button"
                        onClick={() => setEditingId(r.id)}
                        title="แก้ไขสถานที่ (HR)"
                        className="ml-1 text-slate-500 hover:text-blue-400 flex-shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-slate-400 text-sm">{r.purpose}</p>
                  {r.client && <p className="text-slate-500 text-xs">ลูกค้า: {r.client}</p>}
                  {r.note && <p className="text-slate-500 text-xs">หมายเหตุ: {r.note}</p>}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>
                      {new Date(r.date).toLocaleDateString('th-TH', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        timeZone: 'Asia/Bangkok',
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {r.startTime} — {r.endTime}
                    </span>
                    <span>
                      ยื่น{' '}
                      {new Date(r.createdAt).toLocaleDateString('th-TH', {
                        day: 'numeric', month: 'short',
                      })}
                    </span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex-shrink-0 ${
                    STATUS_STYLE[r.status] ?? 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
            </div>
          ))}

          {requests.length === 0 && (
            <div className="rounded-2xl border border-white/5 bg-slate-900 py-14 text-center text-slate-500">
              <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{canViewAll ? 'ยังไม่มีคำขอออกนอกสถานที่ในระบบ' : 'ยังไม่มีประวัติคำขอของคุณ'}</p>
              <button
                type="button"
                onClick={() => setTab('request')}
                className="mt-3 text-xs text-blue-400 hover:text-blue-300"
              >
                ไปยื่นคำขอแรก →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
