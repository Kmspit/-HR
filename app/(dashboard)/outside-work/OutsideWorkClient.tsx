'use client'

import { useState } from 'react'
import { MapPin, Plus, Clock, User, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Request = {
  id: string; userId: string; userName: string; userDept: string
  date: string; startTime: string; endTime: string
  place: string; purpose: string; client: string; note: string
  status: string; createdAt: string
}

const STATUS_STYLE: Record<string, string> = {
  PENDING:        'bg-yellow-500/20 text-yellow-400',
  ADMIN_APPROVED: 'bg-blue-500/20 text-blue-400',
  ADMIN_REJECTED: 'bg-red-500/20 text-red-400',
  APPROVED:       'bg-green-500/20 text-green-400',
  REJECTED:       'bg-red-500/20 text-red-400',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING:        'รอ Admin',
  ADMIN_APPROVED: 'Admin อนุมัติ',
  ADMIN_REJECTED: 'Admin ปฏิเสธ',
  APPROVED:       'อนุมัติแล้ว',
  REJECTED:       'ปฏิเสธแล้ว',
}

export default function OutsideWorkClient({ isManager, requests: init }: { isManager: boolean; requests: Request[] }) {
  const [showForm, setShowForm] = useState(false)
  const [requests, setRequests] = useState(init)
  const [form, setForm] = useState({
    date: '', startTime: '09:00', endTime: '17:00',
    place: '', purpose: '', client: '', note: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.date || !form.place || !form.purpose) { toast.error('กรุณากรอกข้อมูลให้ครบ'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/outside-work', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('ส่งคำขอแล้ว รอ Admin ตรวจสอบ')
      setShowForm(false)
      const r2 = await fetch('/api/outside-work')
      const d2 = await r2.json()
      setRequests(d2.requests?.map((r: any) => ({
        ...r, userName: r.user?.name ?? '', userDept: r.user?.department ?? '',
        date: r.date, createdAt: r.createdAt,
      })) ?? [])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">ออกนอกสถานที่</h1>
        {!isManager && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" /> ขอออกนอกสถานที่
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-white">คำขอออกนอกสถานที่</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'วันที่', key: 'date', type: 'date' },
              { label: 'เวลาออก', key: 'startTime', type: 'time' },
              { label: 'เวลากลับ', key: 'endTime', type: 'time' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-sm text-white/50 block mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) => set(key as any, e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
          </div>
          {[
            { label: 'สถานที่ปฏิบัติงาน *', key: 'place', placeholder: 'ชื่อสถานที่ / ที่อยู่' },
            { label: 'วัตถุประสงค์ *', key: 'purpose', placeholder: 'เหตุผล/ภารกิจ' },
            { label: 'ชื่อลูกค้า / ผู้ติดต่อ', key: 'client', placeholder: '(ถ้ามี)' },
            { label: 'หมายเหตุ', key: 'note', placeholder: '' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="text-sm text-white/50 block mb-1">{label}</label>
              <input
                value={(form as any)[key]}
                onChange={(e) => set(key as any, e.target.value)}
                placeholder={placeholder}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm hover:bg-white/5 transition">ยกเลิก</button>
            <button onClick={submit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'ส่งคำขอ'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {isManager && (
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-3.5 h-3.5 text-white/40" />
                    <span className="text-white/60 text-sm">{r.userName} · {r.userDept}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-white font-medium">
                  <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="truncate">{r.place}</span>
                </div>
                <p className="text-white/60 text-sm mt-1">{r.purpose}</p>
                {r.client && <p className="text-white/40 text-xs mt-0.5">ลูกค้า: {r.client}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                  <span>{new Date(r.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                  <Clock className="w-3 h-3" />
                  <span>{r.startTime} — {r.endTime}</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_STYLE[r.status] ?? 'bg-white/10 text-white/50'}`}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
          </div>
        ))}
        {requests.length === 0 && (
          <div className="text-center text-white/30 py-12">
            <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>ยังไม่มีคำขอ</p>
          </div>
        )}
      </div>
    </div>
  )
}
