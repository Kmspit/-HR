'use client'

import { useState, useMemo, useCallback, useEffect, Fragment } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Send, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { REQUEST_STATUS_LABEL as STATUS_LABEL } from '@/lib/status-labels'

// ── Types ─────────────────────────────────────────────────────────────────────

export type OWRequest = {
  id: string
  userId: string
  userName: string
  userDept: string
  userPosition: string
  date: string
  timeSlot?: string | null
  place: string
  purpose: string
  caseNumber?: string | null
  productWork?: string | null
  workBranch?: string | null
  caseCount?: number | null
  adminChecked?: string | null
  supervisedBy?: string | null
  note?: string | null
  status: string
  approvalStatus?: string | null
  documentNumber?: string | null
  createdAt: string
}

type SlotData = {
  id?: string
  userId?: string
  place: string
  purpose: string
  caseNumber: string
  productWork: string
  workBranch: string
  caseCount: string
  adminChecked: string
  supervisedBy: string
  note: string
  approvalStatus?: string | null
  status?: string
  documentNumber?: string | null
  dirty?: boolean
}

type WeekData = Record<string, SlotData>

export type Props = {
  userId: string
  userName: string
  canViewAll: boolean
  canApproveOutside: boolean
  requests: OWRequest[]
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day  = date.getDay()
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

function toYmd(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDateTH(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d}/${m}/${(y + 543).toString().slice(2)}`
}

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function fmtRangeTH(start: Date, end: Date): string {
  const s = `${start.getDate()} ${MONTHS_TH[start.getMonth()]}`
  const e = `${end.getDate()} ${MONTHS_TH[end.getMonth()]} ${end.getFullYear() + 543}`
  return `${s} – ${e}`
}

const DAYS_TH = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์']
const SLOTS   = ['เช้า','บ่าย'] as const

// ── Slot helpers ──────────────────────────────────────────────────────────────

function sKey(ymd: string, slot: 'เช้า' | 'บ่าย'): string {
  return `${ymd}_${slot}`
}

function emptySlot(): SlotData {
  return { place:'', purpose:'', caseNumber:'', productWork:'', workBranch:'', caseCount:'', adminChecked:'', supervisedBy:'', note:'' }
}

function buildWeekData(requests: OWRequest[], weekDays: string[]): WeekData {
  const data: WeekData = {}
  weekDays.forEach(ymd => SLOTS.forEach(s => { data[sKey(ymd, s)] = emptySlot() }))
  requests.forEach(r => {
    const ymd  = r.date.slice(0, 10)
    if (!weekDays.includes(ymd)) return
    const slot = r.timeSlot === 'บ่าย' ? 'บ่าย' : 'เช้า'
    data[sKey(ymd, slot)] = {
      id: r.id, userId: r.userId,
      place:        r.place          ?? '',
      purpose:      r.purpose        ?? '',
      caseNumber:   r.caseNumber     ?? '',
      productWork:  r.productWork    ?? '',
      workBranch:   r.workBranch     ?? '',
      caseCount:    r.caseCount != null ? String(r.caseCount) : '',
      adminChecked: r.adminChecked   ?? '',
      supervisedBy: r.supervisedBy   ?? '',
      note:         r.note           ?? '',
      approvalStatus: r.approvalStatus,
      status:         r.status,
      documentNumber: r.documentNumber,
    }
  })
  return data
}

// ── Status helpers ────────────────────────────────────────────────────────────

function isPendingSlot(slot: SlotData) {
  return slot.approvalStatus === 'pending_ceo' || slot.status === 'PENDING'
}

function StatusBadge({ slot }: { slot: SlotData }) {
  const s = slot.approvalStatus ?? slot.status
  if (!s) return <span className="text-gray-700 text-sm">—</span>
  const label = STATUS_LABEL[s] ?? s
  const cls =
    s === 'approved_by_ceo' || s === 'APPROVED' ? 'bg-green-100 text-green-800 border-green-300' :
    s === 'rejected_by_ceo' || s === 'REJECTED' ? 'bg-red-100 text-red-800 border-red-300' :
    'bg-yellow-100 text-yellow-800 border-yellow-300'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-sm font-semibold leading-tight ${cls}`}>
      {label}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OutsideWorkExcelForm({ userId, userName, canViewAll, canApproveOutside, requests: initReqs }: Props) {
  const router = useRouter()
  const [reqs, setReqs]           = useState<OWRequest[]>(initReqs)
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [viewUserId, setViewUserId] = useState(userId)
  const [saving, setSaving]       = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [todayYmd]                = useState(() => toYmd(new Date()))

  useEffect(() => { setReqs(initReqs) }, [initReqs])

  const weekEnd  = addDays(weekStart, 6)
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toYmd(addDays(weekStart, i))),
    [weekStart],
  )

  const viewReqs = useMemo(
    () => reqs.filter(r => weekDays.includes(r.date.slice(0, 10)) && r.userId === viewUserId),
    [reqs, weekDays, viewUserId],
  )

  const [weekData, setWeekData] = useState<WeekData>(() => buildWeekData(viewReqs, weekDays))

  useEffect(() => {
    setWeekData(prev => {
      const fresh = buildWeekData(viewReqs, weekDays)
      // Preserve any slot the user has started editing (dirty flag)
      const merged = { ...fresh }
      Object.entries(prev).forEach(([key, slot]) => {
        if (slot.dirty && merged[key]) merged[key] = slot
      })
      return merged
    })
  }, [viewReqs, weekDays])

  const updateSlot = useCallback((key: string, field: keyof SlotData, value: string) => {
    setWeekData(prev => ({ ...prev, [key]: { ...prev[key], [field]: value, dirty: true } }))
  }, [])

  const employees = useMemo(() => {
    const map = new Map<string, string>([[userId, userName]])
    reqs.forEach(r => map.set(r.userId, r.userName))
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [reqs, userId, userName])

  const viewUserName = employees.find(e => e.id === viewUserId)?.name ?? userName
  const canEditForm  = viewUserId === userId

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = async () => {
    const toSave = Object.entries(weekData).filter(([, s]) => s.place || s.purpose)
    if (toSave.length === 0) {
      toast.error('กรุณากรอกสถานที่หรือสิ่งที่ไปดำเนินการอย่างน้อย 1 รายการ')
      return
    }
    for (const [key, slot] of toSave) {
      if (!slot.place)   { toast.error(`กรุณาระบุสถานที่ (${key.split('_')[1]})`);   return }
      if (!slot.purpose) { toast.error(`กรุณาระบุสิ่งที่ไปดำเนินการ (${key.split('_')[1]})`); return }
    }
    setSaving(true)
    try {
      for (const [key, slot] of toSave) {
        const [ymd, timeSlot] = key.split('_')
        const body = {
          date: ymd, timeSlot: timeSlot || null,
          place:        slot.place,
          purpose:      slot.purpose,
          caseNumber:   slot.caseNumber   || null,
          productWork:  slot.productWork  || null,
          workBranch:   slot.workBranch   || null,
          caseCount:    slot.caseCount    ? Number(slot.caseCount) : null,
          adminChecked: slot.adminChecked || null,
          supervisedBy: slot.supervisedBy || null,
          note:         slot.note         || null,
        }
        const url    = slot.id ? `/api/outside-work/${slot.id}` : '/api/outside-work'
        const method = slot.id ? 'PATCH' : 'POST'
        const { ok, data, status } = await apiJson(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!ok) { toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status)); return }
      }
      toast.success('บันทึกสำเร็จ — รอ CEO อนุมัติ')
      router.refresh()
    } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally   { setSaving(false) }
  }

  // ── Approve ───────────────────────────────────────────────────────────────

  const handleApprove = async (reqId: string, action: 'approve' | 'reject') => {
    setApprovingId(reqId)
    try {
      const approvalStatus = action === 'approve' ? 'approved_by_ceo' : 'rejected_by_ceo'
      const status         = action === 'approve' ? 'APPROVED'        : 'REJECTED'
      const { ok, data, status: hs } = await apiJson(`/api/outside-work/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalStatus, status }),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'ดำเนินการไม่สำเร็จ', hs)); return }
      toast.success(action === 'approve' ? 'อนุมัติเรียบร้อย' : 'ปฏิเสธคำขอแล้ว')
      setReqs(prev => prev.map(r => r.id === reqId ? { ...r, approvalStatus, status } : r))
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally  { setApprovingId(null) }
  }

  // ── CSS tokens ────────────────────────────────────────────────────────────

  const TH = 'border border-black bg-gray-200 text-sm font-semibold text-center px-1 py-1.5 leading-tight align-middle text-gray-900'
  const TD = 'border border-black align-top text-sm text-gray-900'
  const INP = 'w-full bg-white text-sm !text-gray-900 outline-none px-1 py-1 border border-gray-300 shadow-sm placeholder:text-gray-400 leading-snug rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
  const SEL = 'select-on-light w-full bg-white text-sm !text-gray-900 outline-none px-0.5 py-1 cursor-pointer leading-snug border border-gray-300 shadow-sm rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
  const INP_RO = 'cursor-default bg-slate-100 !text-gray-900'
  const RO_SPAN = 'text-sm font-medium text-gray-900'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-gray-50 min-h-screen print:bg-white">
      <div className="max-w-[1440px] mx-auto px-3 py-4 md:px-6 md:py-6 space-y-4">

        {/* Admin — employee switcher */}
        {canViewAll && (
          <div className="flex items-center gap-3 bg-white border border-gray-300 rounded-xl px-4 py-2.5 shadow-sm print:hidden">
            <span className="text-sm text-gray-700 font-semibold shrink-0">ดูแผนของ:</span>
            <select
              value={viewUserId}
              onChange={e => setViewUserId(e.target.value)}
              className="select-on-light flex-1 max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm !text-gray-900 bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            >
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}{e.id === userId ? ' (ตัวเอง)' : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Form card ───────────────────────────────────────────────── */}
        <div className="bg-white text-gray-900 border border-gray-400 rounded-lg shadow-sm overflow-hidden print:shadow-none print:rounded-none">

          {/* Company header */}
          <div className="border-b-2 border-gray-400 text-center px-4 py-3">
            <p className="text-base font-bold text-gray-900 tracking-wide">
              บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด
            </p>
            <h1 className="mt-1.5 text-base font-bold text-red-800 leading-snug">
              แผนการดำเนินงานของบังคับคดีและทนายความประจำบริษัท
            </h1>
          </div>

          {/* Week navigation */}
          <div className="border-b border-gray-300 px-4 py-2 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden border border-gray-300">
              <button type="button" onClick={() => setWeekStart(w => addDays(w, -7))}
                className="p-2 hover:bg-gray-200 transition text-gray-800">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-sm font-semibold text-gray-900 select-none whitespace-nowrap">
                {fmtRangeTH(weekStart, weekEnd)}
              </span>
              <button type="button" onClick={() => setWeekStart(w => addDays(w, 7))}
                className="p-2 hover:bg-gray-200 transition text-gray-800">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button type="button" onClick={() => setWeekStart(getMonday(new Date()))}
              className="px-3 py-1.5 text-sm border border-gray-400 rounded-lg shadow-sm hover:bg-slate-100 hover:border-gray-500 text-gray-900 font-semibold transition">
              สัปดาห์นี้
            </button>
          </div>

          {/* Form meta */}
          <div className="grid grid-cols-2 border-b border-gray-300 text-sm text-gray-900">
            <div className="px-4 py-1.5 border-r border-gray-300">
              <span className="font-semibold">แผนงานช่วงวันที่: </span>{fmtRangeTH(weekStart, weekEnd)}
            </div>
            <div className="px-4 py-1.5">
              <span className="font-semibold">บังคับคดีผู้จัดทำแผน: </span>{viewUserName}
            </div>
          </div>

          {/* ── Weekly table ─────────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-gray-900" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th className={`${TH} w-[58px]`}     rowSpan={2}>วัน</th>
                  <th className={`${TH} w-[56px]`}     rowSpan={2}>ว/ด/ปี</th>
                  <th className={`${TH} w-[48px]`}     rowSpan={2}>ช่วง<br/>เวลา</th>
                  <th className={`${TH} w-[130px]`}    rowSpan={2}>สถานที่ไปทำงาน</th>
                  <th className={`${TH} w-[150px]`}    rowSpan={2}>สิ่งที่ไปดำเนินการ</th>
                  <th className={`${TH} w-[80px]`}     rowSpan={2}>หมายเลข<br/>คดี</th>
                  <th className={`${TH} w-[90px]`}     rowSpan={2}>งานผลิตภัณฑ์</th>
                  <th className={`${TH} w-[76px]`}     rowSpan={2}>งานของ<br/>สาขาไหน</th>
                  <th className={`${TH} w-[52px]`}     rowSpan={2}>จำนวน<br/>คดี</th>
                  <th className={`${TH} w-[68px]`}>แอดมินโปรดักส์<br/>ตรวจสอบ</th>
                  <th className={`${TH} w-[86px]`}>ผู้สั่งงาน</th>
                  <th className={`${TH} w-[70px]`}     rowSpan={2}>อนุมัติ/<br/>ไม่อนุมัติ</th>
                  <th className={`${TH} w-[90px]`}     rowSpan={2}>หมายเหตุ</th>
                </tr>
                <tr>
                  <th className={`${TH} font-semibold`}>(มี/ไม่มี)</th>
                  <th className={`${TH} font-semibold`}>(แอดมิน/หัวหน้า/<br/>ทนายวางแผนตามเอง)</th>
                </tr>
              </thead>
              <tbody>
                {weekDays.map((ymd, dayIdx) => {
                  const kM    = sKey(ymd, 'เช้า')
                  const kA    = sKey(ymd, 'บ่าย')
                  const morn  = weekData[kM] ?? emptySlot()
                  const aftn  = weekData[kA] ?? emptySlot()
                  const today = ymd === todayYmd
                  const stripe = dayIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                  const mLock = !canEditForm || morn.approvalStatus === 'approved_by_ceo' || morn.approvalStatus === 'APPROVED'
                  const aLock = !canEditForm || aftn.approvalStatus === 'approved_by_ceo' || aftn.approvalStatus === 'APPROVED'

                  return (
                    <Fragment key={ymd}>

                      {/* Morning row */}
                      <tr className={`${stripe} ${today ? 'outline outline-1 outline-blue-400 outline-offset-[-1px]' : ''}`}>

                        {/* วัน — rowSpan 2 */}
                        <td className={`border border-black text-center align-middle font-bold text-sm text-gray-900 ${today ? 'bg-blue-50' : stripe}`}
                          rowSpan={2}>
                          <div className="flex flex-col items-center gap-0.5 text-gray-900">
                            {today && <span className="text-xs text-blue-800 font-semibold">วันนี้</span>}
                            {DAYS_TH[dayIdx]}
                          </div>
                        </td>

                        {/* ว/ด/ปี — rowSpan 2 */}
                        <td className={`border border-black text-center align-middle text-sm text-gray-900 ${today ? 'bg-blue-50' : stripe}`}
                          rowSpan={2}>
                          {fmtDateTH(ymd)}
                        </td>

                        {/* ช่วงเวลา */}
                        <td className={`${TD} text-center align-middle bg-amber-50`}>
                          <span className="text-sm font-bold text-amber-800">เช้า</span>
                        </td>

                        {/* สถานที่ */}
                        <td className={`${TD} ${stripe}`}>
                          <input value={morn.place} readOnly={mLock} placeholder="สถานที่..."
                            onChange={e => updateSlot(kM, 'place', e.target.value)}
                            className={`${INP} ${mLock ? INP_RO : ''}`} />
                        </td>

                        {/* สิ่งที่ไปดำเนินการ */}
                        <td className={`${TD} ${stripe}`}>
                          <input value={morn.purpose} readOnly={mLock} placeholder="รายละเอียด..."
                            onChange={e => updateSlot(kM, 'purpose', e.target.value)}
                            className={`${INP} ${mLock ? INP_RO : ''}`} />
                        </td>

                        {/* หมายเลขคดี */}
                        <td className={`${TD} ${stripe}`}>
                          <input value={morn.caseNumber} readOnly={mLock} placeholder="—"
                            onChange={e => updateSlot(kM, 'caseNumber', e.target.value)}
                            className={`${INP} text-center ${mLock ? INP_RO : ''}`} />
                        </td>

                        {/* งานผลิตภัณฑ์ */}
                        <td className={`${TD} ${stripe}`}>
                          <input value={morn.productWork} readOnly={mLock} placeholder="—"
                            onChange={e => updateSlot(kM, 'productWork', e.target.value)}
                            className={`${INP} ${mLock ? INP_RO : ''}`} />
                        </td>

                        {/* สาขา */}
                        <td className={`${TD} ${stripe}`}>
                          <input value={morn.workBranch} readOnly={mLock} placeholder="—"
                            onChange={e => updateSlot(kM, 'workBranch', e.target.value)}
                            className={`${INP} text-center ${mLock ? INP_RO : ''}`} />
                        </td>

                        {/* จำนวนคดี */}
                        <td className={`${TD} ${stripe}`}>
                          <input type="number" min="0" value={morn.caseCount} readOnly={mLock} placeholder="—"
                            onChange={e => updateSlot(kM, 'caseCount', e.target.value)}
                            className={`${INP} text-center ${mLock ? INP_RO : ''}`} />
                        </td>

                        {/* แอดมินตรวจสอบ */}
                        <td className={`${TD} ${stripe} text-center`}>
                          {mLock
                            ? <span className={RO_SPAN}>{morn.adminChecked || '—'}</span>
                            : <select value={morn.adminChecked} onChange={e => updateSlot(kM, 'adminChecked', e.target.value)} className={SEL}>
                                <option value="">—</option>
                                <option value="มี">มี</option>
                                <option value="ไม่มี">ไม่มี</option>
                              </select>
                          }
                        </td>

                        {/* ผู้สั่งงาน */}
                        <td className={`${TD} ${stripe} text-center`}>
                          {mLock
                            ? <span className={RO_SPAN}>{morn.supervisedBy || '—'}</span>
                            : <select value={morn.supervisedBy} onChange={e => updateSlot(kM, 'supervisedBy', e.target.value)} className={SEL}>
                                <option value="">—</option>
                                <option value="แอดมิน">แอดมิน</option>
                                <option value="หัวหน้า">หัวหน้า</option>
                                <option value="ทนายวางแผนตามเอง">ทนายวางแผนตามเอง</option>
                              </select>
                          }
                        </td>

                        {/* อนุมัติ */}
                        <td className={`${TD} ${stripe} text-center`}>
                          {morn.id
                            ? <div className="flex flex-col items-center gap-0.5 py-0.5">
                                <StatusBadge slot={morn} />
                                {canApproveOutside && isPendingSlot(morn) && (
                                  <div className="flex gap-0.5 mt-0.5">
                                    <button onClick={() => handleApprove(morn.id!, 'approve')} disabled={approvingId === morn.id}
                                      title="อนุมัติ" className="p-0.5 rounded hover:bg-green-100 text-green-800 transition disabled:opacity-40">
                                      {approvingId === morn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    </button>
                                    <button onClick={() => handleApprove(morn.id!, 'reject')} disabled={approvingId === morn.id}
                                      title="ปฏิเสธ" className="p-0.5 rounded hover:bg-red-100 text-red-800 transition disabled:opacity-40">
                                      <XCircle className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            : <span className="text-gray-900 text-sm font-medium">—</span>
                          }
                        </td>

                        {/* หมายเหตุ */}
                        <td className={`${TD} ${stripe}`}>
                          <input value={morn.note} readOnly={mLock} placeholder="—"
                            onChange={e => updateSlot(kM, 'note', e.target.value)}
                            className={`${INP} ${mLock ? INP_RO : ''}`} />
                        </td>
                      </tr>

                      {/* Afternoon row */}
                      <tr className={stripe}>
                        {/* วัน + ว/ด/ปี already covered by rowSpan */}

                        <td className={`${TD} text-center align-middle bg-sky-50`}>
                          <span className="text-sm font-bold text-sky-800">บ่าย</span>
                        </td>

                        <td className={`${TD} ${stripe}`}>
                          <input value={aftn.place} readOnly={aLock} placeholder="สถานที่..."
                            onChange={e => updateSlot(kA, 'place', e.target.value)}
                            className={`${INP} ${aLock ? INP_RO : ''}`} />
                        </td>

                        <td className={`${TD} ${stripe}`}>
                          <input value={aftn.purpose} readOnly={aLock} placeholder="รายละเอียด..."
                            onChange={e => updateSlot(kA, 'purpose', e.target.value)}
                            className={`${INP} ${aLock ? INP_RO : ''}`} />
                        </td>

                        <td className={`${TD} ${stripe}`}>
                          <input value={aftn.caseNumber} readOnly={aLock} placeholder="—"
                            onChange={e => updateSlot(kA, 'caseNumber', e.target.value)}
                            className={`${INP} text-center ${aLock ? INP_RO : ''}`} />
                        </td>

                        <td className={`${TD} ${stripe}`}>
                          <input value={aftn.productWork} readOnly={aLock} placeholder="—"
                            onChange={e => updateSlot(kA, 'productWork', e.target.value)}
                            className={`${INP} ${aLock ? INP_RO : ''}`} />
                        </td>

                        <td className={`${TD} ${stripe}`}>
                          <input value={aftn.workBranch} readOnly={aLock} placeholder="—"
                            onChange={e => updateSlot(kA, 'workBranch', e.target.value)}
                            className={`${INP} text-center ${aLock ? INP_RO : ''}`} />
                        </td>

                        <td className={`${TD} ${stripe}`}>
                          <input type="number" min="0" value={aftn.caseCount} readOnly={aLock} placeholder="—"
                            onChange={e => updateSlot(kA, 'caseCount', e.target.value)}
                            className={`${INP} text-center ${aLock ? INP_RO : ''}`} />
                        </td>

                        <td className={`${TD} ${stripe} text-center`}>
                          {aLock
                            ? <span className={RO_SPAN}>{aftn.adminChecked || '—'}</span>
                            : <select value={aftn.adminChecked} onChange={e => updateSlot(kA, 'adminChecked', e.target.value)} className={SEL}>
                                <option value="">—</option>
                                <option value="มี">มี</option>
                                <option value="ไม่มี">ไม่มี</option>
                              </select>
                          }
                        </td>

                        <td className={`${TD} ${stripe} text-center`}>
                          {aLock
                            ? <span className={RO_SPAN}>{aftn.supervisedBy || '—'}</span>
                            : <select value={aftn.supervisedBy} onChange={e => updateSlot(kA, 'supervisedBy', e.target.value)} className={SEL}>
                                <option value="">—</option>
                                <option value="แอดมิน">แอดมิน</option>
                                <option value="หัวหน้า">หัวหน้า</option>
                                <option value="ทนายวางแผนตามเอง">ทนายวางแผนตามเอง</option>
                              </select>
                          }
                        </td>

                        <td className={`${TD} ${stripe} text-center`}>
                          {aftn.id
                            ? <div className="flex flex-col items-center gap-0.5 py-0.5">
                                <StatusBadge slot={aftn} />
                                {canApproveOutside && isPendingSlot(aftn) && (
                                  <div className="flex gap-0.5 mt-0.5">
                                    <button onClick={() => handleApprove(aftn.id!, 'approve')} disabled={approvingId === aftn.id}
                                      title="อนุมัติ" className="p-0.5 rounded hover:bg-green-100 text-green-800 transition disabled:opacity-40">
                                      {approvingId === aftn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    </button>
                                    <button onClick={() => handleApprove(aftn.id!, 'reject')} disabled={approvingId === aftn.id}
                                      title="ปฏิเสธ" className="p-0.5 rounded hover:bg-red-100 text-red-800 transition disabled:opacity-40">
                                      <XCircle className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            : <span className="text-gray-900 text-sm font-medium">—</span>
                          }
                        </td>

                        <td className={`${TD} ${stripe}`}>
                          <input value={aftn.note} readOnly={aLock} placeholder="—"
                            onChange={e => updateSlot(kA, 'note', e.target.value)}
                            className={`${INP} ${aLock ? INP_RO : ''}`} />
                        </td>
                      </tr>

                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="border-t border-gray-300 px-4 py-2 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">หมายเหตุ:</span>{' '}
            กรอกข้อมูลให้ครบถ้วน แล้วกด &ldquo;บันทึกและส่งอนุมัติ&rdquo;
          </div>

          {/* Action buttons */}
          {canEditForm && (
            <div className="border-t border-gray-300 px-4 py-3 flex justify-end gap-2 bg-slate-50 print:hidden">
              <button type="button" onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-sm transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {saving ? 'กำลังบันทึก...' : 'บันทึกและส่งอนุมัติ'}
              </button>
            </div>
          )}
        </div>

        {/* ── Approval history ─────────────────────────────────────── */}
        {viewReqs.length > 0 && (
          <div className="bg-white text-gray-900 border border-gray-300 rounded-lg shadow-sm p-4 print:hidden">
            <h3 className="text-base font-semibold text-gray-900 mb-3">ประวัติรายการของสัปดาห์นี้</h3>
            <div className="divide-y divide-gray-300">
              {viewReqs.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-900 min-w-0">
                    <span className="font-mono text-sm text-gray-900 shrink-0">{r.documentNumber ?? '—'}</span>
                    <span className="shrink-0 font-medium text-gray-900">{r.date.slice(0, 10)}</span>
                    <span className="text-gray-900 shrink-0">({r.timeSlot ?? '—'})</span>
                    <span className="font-medium truncate text-gray-900">{r.place}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge slot={{ approvalStatus: r.approvalStatus, status: r.status, place:'', purpose:'', caseNumber:'', productWork:'', workBranch:'', caseCount:'', adminChecked:'', supervisedBy:'', note:'' }} />
                    {canApproveOutside && (r.approvalStatus === 'pending_ceo' || r.status === 'PENDING') && (
                      <div className="flex gap-1">
                        <button onClick={() => handleApprove(r.id, 'approve')} disabled={approvingId === r.id}
                          className="px-3 py-1 rounded bg-green-100 text-green-800 hover:bg-green-200 border border-green-300 text-sm font-bold transition disabled:opacity-40">
                          อนุมัติ
                        </button>
                        <button onClick={() => handleApprove(r.id, 'reject')} disabled={approvingId === r.id}
                          className="px-3 py-1 rounded bg-red-100 text-red-800 hover:bg-red-200 border border-red-300 text-sm font-bold transition disabled:opacity-40">
                          ปฏิเสธ
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
