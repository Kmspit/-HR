'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Edit3, Check, X, Loader2,
  Download, CheckCircle2, XCircle, Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { REQUEST_STATUS_LABEL as STATUS_LABEL } from '@/lib/status-labels'
import { outsideWorkSchema } from '@/lib/validations/outside-work'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  googleMapsUrl?: string | null
  attachmentUrl?: string | null
  attachmentName?: string | null
  approvalStatus?: string | null
  employeeName?: string | null
  ownerName?: string | null
  workType?: string | null
  distance?: number | null
  distanceLimit?: number | null
  routeType?: string | null
  // ── ฟอร์มบริษัท ──
  timeSlot?: string | null       // เช้า / บ่าย / เต็มวัน
  caseNumber?: string | null     // หมายเลขคดีดำ
  productWork?: string | null    // งานโปรดักส์
  workBranch?: string | null     // งานของสาขาไหน
  caseCount?: number | null      // จำนวนคดีที่ไปดำเนินการ
  adminChecked?: string | null   // มี / ไม่มี
  supervisedBy?: string | null   // ผู้สั่งงาน
  documentNumber?: string | null // OW-2567-001
}

type Props = {
  userId: string
  canViewAll: boolean
  canApproveOutside: boolean
  requests: Request[]
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
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
  return d.toISOString().slice(0, 10)
}

const DAY_FULL_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const MONTH_TH   = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function fmtDateTH(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear() + 543}`
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function effectiveStatus(r: Request): string {
  return r.approvalStatus ?? r.status
}


const STATUS_CLS: Record<string, string> = {
  PENDING:          'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  pending_ceo:      'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  APPROVED:         'bg-green-500/15 text-green-400 border-green-500/25',
  approved_by_ceo:  'bg-green-500/15 text-green-400 border-green-500/25',
  REJECTED:         'bg-red-500/15 text-red-400 border-red-500/25',
  rejected_by_ceo:  'bg-red-500/15 text-red-400 border-red-500/25',
}

function isPending(r: Request) {
  const s = effectiveStatus(r)
  return s === 'PENDING' || s === 'pending_ceo'
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLS[status] ?? 'bg-slate-700/50 text-slate-400 border-slate-600/50'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── Summary cards ──────────────────────────────────────────────────────────────

function SummaryCards({ data }: { data: Request[] }) {
  const total    = data.length
  const approved = data.filter(r => ['APPROVED', 'approved_by_ceo'].includes(effectiveStatus(r))).length
  const pending  = data.filter(r => isPending(r)).length
  const rejected = data.filter(r => ['REJECTED', 'rejected_by_ceo'].includes(effectiveStatus(r))).length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'ทั้งหมด',    value: total,    cls: 'text-white'       },
        { label: 'อนุมัติแล้ว', value: approved, cls: 'text-green-400'  },
        { label: 'รออนุมัติ',  value: pending,  cls: 'text-yellow-400' },
        { label: 'ไม่อนุมัติ', value: rejected, cls: 'text-red-400'    },
      ].map(({ label, value, cls }) => (
        <div key={label} className="bg-slate-900 border border-white/[0.07] rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

type FormState = {
  date: string
  timeSlot: string
  place: string
  purpose: string
  caseNumber: string
  productWork: string
  workBranch: string
  caseCount: string
  adminChecked: string
  supervisedBy: string
  note: string
  // legacy fields (kept for DB compat)
  startTime: string; endTime: string; client: string
  googleMapsUrl: string; employeeName: string
  ownerName: string; workType: string
  distance: string; distanceLimit: string; routeType: string
}

const EMPTY: FormState = {
  date: '', timeSlot: '', place: '', purpose: '',
  caseNumber: '', productWork: '', workBranch: '',
  caseCount: '', adminChecked: '', supervisedBy: '', note: '',
  startTime: '', endTime: '', client: '', googleMapsUrl: '',
  employeeName: '', ownerName: '', workType: '',
  distance: '', distanceLimit: '', routeType: '',
}

function toForm(r: Request): FormState {
  return {
    date:          r.date.slice(0, 10),
    timeSlot:      r.timeSlot      ?? '',
    place:         r.place,
    purpose:       r.purpose,
    caseNumber:    r.caseNumber    ?? '',
    productWork:   r.productWork   ?? '',
    workBranch:    r.workBranch    ?? '',
    caseCount:     r.caseCount     != null ? String(r.caseCount) : '',
    adminChecked:  r.adminChecked  ?? '',
    supervisedBy:  r.supervisedBy  ?? '',
    note:          r.note          ?? '',
    startTime:     r.startTime,
    endTime:       r.endTime,
    client:        r.client        ?? '',
    googleMapsUrl: r.googleMapsUrl ?? '',
    employeeName:  r.employeeName  ?? '',
    ownerName:     r.ownerName     ?? '',
    workType:      r.workType      ?? '',
    distance:      r.distance      != null ? String(r.distance) : '',
    distanceLimit: r.distanceLimit != null ? String(r.distanceLimit) : '',
    routeType:     r.routeType     ?? '',
  }
}

function AddEditModal({
  editing,
  defaultDate,
  onClose,
  onSaved,
}: {
  editing: Request | null
  defaultDate?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(
    editing ? toForm(editing) : { ...EMPTY, date: defaultDate ?? '' }
  )
  const [saving, setSaving] = useState(false)

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    const validation = outsideWorkSchema.safeParse(form)
    if (!validation.success) { toast.error(validation.error.issues[0].message); return }
    setSaving(true)
    try {
      const body = {
        ...form,
        caseCount:     form.caseCount     ? Number(form.caseCount)     : null,
        distance:      form.distance      ? Number(form.distance)      : null,
        distanceLimit: form.distanceLimit ? Number(form.distanceLimit) : null,
        timeSlot:      form.timeSlot      || null,
        caseNumber:    form.caseNumber    || null,
        productWork:   form.productWork   || null,
        workBranch:    form.workBranch    || null,
        adminChecked:  form.adminChecked  || null,
        supervisedBy:  form.supervisedBy  || null,
        note:          form.note          || null,
        client:        form.client        || null,
        googleMapsUrl: form.googleMapsUrl || null,
        ownerName:     form.ownerName     || null,
        workType:      form.workType      || null,
        routeType:     form.routeType     || null,
      }
      const { ok, data, status } = await apiJson(
        editing ? `/api/outside-work/${editing.id}` : '/api/outside-work',
        { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      )
      if (!ok) { toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status)); return }
      toast.success(editing ? 'แก้ไขเรียบร้อยแล้ว' : 'ส่งคำขอแล้ว — รอ CEO อนุมัติ')
      onSaved()
    } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally  { setSaving(false) }
  }

  const ic = 'w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition'
  const lb = 'text-[11px] text-slate-400 font-semibold uppercase tracking-wider'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-white/10 p-5 space-y-4 max-h-[94vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{editing ? 'แก้ไขแผนงาน' : 'เพิ่มแผนงานออกนอกพื้นที่'}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Row 1: วันที่ + ช่วงเวลา */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={lb}>วันที่ *</label>
            <input type="date" value={form.date} onChange={set('date')} className={ic} />
          </div>
          <div className="space-y-1.5">
            <label className={lb}>ช่วงเวลา</label>
            <select value={form.timeSlot} onChange={set('timeSlot')} className={ic}>
              <option value="">-- เลือก --</option>
              <option value="เช้า">เช้า</option>
              <option value="บ่าย">บ่าย</option>
              <option value="เต็มวัน">เต็มวัน</option>
            </select>
          </div>
        </div>

        {/* สถานที่ + สิ่งที่ไปดำเนินการ */}
        <div className="space-y-1.5">
          <label className={lb}>สถานที่ไปทำงาน *</label>
          <input value={form.place} onChange={set('place')} placeholder="ชื่อสถานที่ / ที่อยู่" className={ic} />
        </div>
        <div className="space-y-1.5">
          <label className={lb}>สิ่งที่ไปดำเนินการ *</label>
          <textarea value={form.purpose} onChange={set('purpose')} rows={2} placeholder="รายละเอียดภารกิจ" className={`${ic} resize-none`} />
        </div>

        {/* Row: หมายเลขคดีดำ + งานโปรดักส์ */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={lb}>หมายเลขคดีดำ</label>
            <input value={form.caseNumber} onChange={set('caseNumber')} placeholder="เช่น 2567-001" className={ic} />
          </div>
          <div className="space-y-1.5">
            <label className={lb}>งานโปรดักส์</label>
            <input value={form.productWork} onChange={set('productWork')} placeholder="ประเภทงาน" className={ic} />
          </div>
        </div>

        {/* Row: สาขา + จำนวนคดี */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={lb}>งานของสาขาไหน</label>
            <input value={form.workBranch} onChange={set('workBranch')} placeholder="เช่น สาขากรุงเทพ" className={ic} />
          </div>
          <div className="space-y-1.5">
            <label className={lb}>จำนวนคดีที่ไปดำเนินการ</label>
            <input type="number" min="0" value={form.caseCount} onChange={set('caseCount')} placeholder="0" className={ic} />
          </div>
        </div>

        {/* Row: แอดมินตรวจสอบ + ผู้สั่งงาน */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={lb}>แอดมินโปรดักส์ตรวจสอบ</label>
            <select value={form.adminChecked} onChange={set('adminChecked')} className={ic}>
              <option value="">-- เลือก --</option>
              <option value="มี">มี</option>
              <option value="ไม่มี">ไม่มี</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={lb}>ผู้สั่งงาน</label>
            <select value={form.supervisedBy} onChange={set('supervisedBy')} className={ic}>
              <option value="">-- เลือก --</option>
              <option value="แอดมิน">แอดมิน</option>
              <option value="หัวหน้า">หัวหน้า</option>
              <option value="ทนายวางแผนตามเอง">ทนายวางแผนตามเอง</option>
            </select>
          </div>
        </div>

        {/* หมายเหตุ */}
        <div className="space-y-1.5">
          <label className={lb}>หมายเหตุ</label>
          <input value={form.note} onChange={set('note')} placeholder="(ถ้ามี)" className={ic} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition">
            ยกเลิก
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {editing ? 'บันทึกการแก้ไข' : 'ส่งคำขอ'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OutsideWorkClient({ userId, canViewAll, canApproveOutside, requests: init }: Props) {
  const router = useRouter()
  const [requests, setRequests] = useState<Request[]>(init)
  const [weekStart, setWeekStart]       = useState(() => getMonday(new Date()))
  const [filterEmp, setFilterEmp]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState<{ open: boolean; editing: Request | null; defaultDate?: string }>({ open: false, editing: null })
  const [approvingId, setApprovingId]   = useState<string | null>(null)

  const weekEnd  = addDays(weekStart, 6)
  const weekYmds = useMemo(() => Array.from({ length: 7 }, (_, i) => toYmd(addDays(weekStart, i))), [weekStart])

  const filteredRequests = useMemo(() => {
    return requests
      .filter(r => {
        const ymd = r.date.slice(0, 10)
        if (!weekYmds.includes(ymd))              return false
        if (!canViewAll && r.userId !== userId)    return false
        if (filterEmp && r.userId !== filterEmp)  return false
        if (filterStatus) {
          const s = effectiveStatus(r)
          if (filterStatus === 'pending'  && !isPending(r))                                return false
          if (filterStatus === 'approved' && !['APPROVED', 'approved_by_ceo'].includes(s)) return false
          if (filterStatus === 'rejected' && !['REJECTED', 'rejected_by_ceo'].includes(s)) return false
        }
        return true
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.timeSlot ?? '').localeCompare(b.timeSlot ?? ''))
  }, [requests, weekYmds, canViewAll, userId, filterEmp, filterStatus])

  const weekRequests = useMemo(() =>
    requests.filter(r => {
      const ymd = r.date.slice(0, 10)
      return weekYmds.includes(ymd) && (canViewAll || r.userId === userId)
    }),
    [requests, weekYmds, canViewAll, userId]
  )

  const employees = useMemo(() => {
    const map = new Map<string, string>()
    requests.forEach(r => map.set(r.userId, r.userName))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [requests])

  const handleSaved = useCallback(() => {
    setModal({ open: false, editing: null })
    router.refresh()
  }, [router])

  const handleApprove = async (r: Request, action: 'approve' | 'reject') => {
    setApprovingId(r.id)
    try {
      const approvalStatus = action === 'approve' ? 'approved_by_ceo' : 'rejected_by_ceo'
      const status         = action === 'approve' ? 'APPROVED'        : 'REJECTED'
      const { ok, data, status: httpStatus } = await apiJson(`/api/outside-work/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalStatus, status }),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'ดำเนินการไม่สำเร็จ', httpStatus)); return }
      toast.success(action === 'approve' ? 'อนุมัติเรียบร้อย' : 'ปฏิเสธคำขอแล้ว')
      setRequests(prev => prev.map(req => req.id === r.id ? { ...req, approvalStatus, status } : req))
    } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally  { setApprovingId(null) }
  }

  const [exporting, setExporting] = useState(false)
  const weekLabel = `${weekStart.getDate()} ${MONTH_TH[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_TH[weekEnd.getMonth()]} ${weekEnd.getFullYear() + 543}`

  const exportXlsx = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/outside-work/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekLabel, weekStart: toYmd(weekStart), weekEnd: toYmd(weekEnd), canViewAll, requests: filteredRequests }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href: url,
        download: `outside-work-${toYmd(weekStart)}.xlsx`,
      })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('ไม่สามารถ export ได้ กรุณาลองใหม่')
    } finally {
      setExporting(false)
    }
  }

  const th = 'px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap'

  // total columns for empty state colspan
  const colCount = (canViewAll ? 2 : 0) + 14 + 1  // employee cols + 14 data cols + action

  return (
    <div className="p-4 md:p-6 space-y-5">
      {modal.open && (
        <AddEditModal
          editing={modal.editing}
          defaultDate={modal.defaultDate}
          onClose={() => setModal({ open: false, editing: null })}
          onSaved={handleSaved}
        />
      )}

      <SummaryCards data={weekRequests} />

      {/* Admin filters */}
      {canViewAll && (
        <div className="flex flex-wrap gap-3">
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition">
            <option value="">พนักงานทั้งหมด</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition">
            <option value="">ทุกสถานะ</option>
            <option value="pending">รออนุมัติ</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="rejected">ไม่อนุมัติ</option>
          </select>
        </div>
      )}

      {/* Week navigation + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
          <button type="button" onClick={() => setWeekStart(w => addDays(w, -7))}
            className="p-2.5 hover:bg-white/10 text-slate-400 hover:text-white transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 text-sm text-white font-medium whitespace-nowrap select-none">{weekLabel}</span>
          <button type="button" onClick={() => setWeekStart(w => addDays(w, 7))}
            className="p-2.5 hover:bg-white/10 text-slate-400 hover:text-white transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button type="button" onClick={() => setWeekStart(getMonday(new Date()))}
          className="px-3 py-2 rounded-xl border border-white/10 text-slate-400 text-xs hover:bg-white/5 hover:text-white transition">
          สัปดาห์นี้
        </button>
        <div className="flex-1" />
        <button type="button" onClick={exportXlsx} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 hover:text-white transition disabled:opacity-50">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export Excel
        </button>
        <button type="button" onClick={() => setModal({ open: true, editing: null })}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition">
          <Plus className="w-4 h-4" /> เพิ่มแผนงาน
        </button>
      </div>

      {/* Table — matches Excel column order */}
      <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: canViewAll ? 1300 : 1100 }}>
            <thead>
              <tr className="bg-slate-900/80 border-b border-white/[0.07]">
                {canViewAll && (
                  <>
                    <th className={`${th} text-left`}>ชื่อพนักงาน</th>
                    <th className={`${th} text-left`}>สาขา/แผนก</th>
                  </>
                )}
                <th className={`${th} text-center`}>เลขที่</th>
                <th className={`${th} text-center`}>วัน</th>
                <th className={`${th} text-center`}>ว/ด/ปี</th>
                <th className={`${th} text-center`}>ช่วงเวลา</th>
                <th className={`${th} text-left`}>สถานที่ไปทำงาน</th>
                <th className={`${th} text-left`}>สิ่งที่ไปดำเนินการ</th>
                <th className={`${th} text-center`}>หมายเลขคดีดำ</th>
                <th className={`${th} text-left`}>งานโปรดักส์</th>
                <th className={`${th} text-center`}>สาขาไหน</th>
                <th className={`${th} text-center`}>จำนวนคดี</th>
                <th className={`${th} text-center`}>แอดมินตรวจสอบ</th>
                <th className={`${th} text-center`}>ผู้สั่งงาน</th>
                <th className={`${th} text-center`}>สถานะ</th>
                <th className={`${th} text-left`}>หมายเหตุ</th>
                <th className={`${th} text-center`}>จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-14 text-center text-slate-500 text-sm">
                    ไม่มีแผนงานในสัปดาห์นี้
                    <button type="button" onClick={() => setModal({ open: true, editing: null })}
                      className="block mx-auto mt-3 text-xs text-blue-400 hover:text-blue-300 transition">
                      + เพิ่มแผนงาน
                    </button>
                  </td>
                </tr>
              ) : (
                filteredRequests.map(r => {
                  const s           = effectiveStatus(r)
                  const dayIndex    = new Date(r.date).getUTCDay()
                  const canEdit     = isPending(r) && (canApproveOutside || r.userId === userId)
                  const isApproving = approvingId === r.id

                  return (
                    <tr key={r.id} className="bg-slate-900/40 hover:bg-white/[0.025] transition-colors">
                      {canViewAll && (
                        <>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <p className="text-xs font-medium text-white">{r.userName}</p>
                            <p className="text-[10px] text-slate-500">{r.userPosition || '—'}</p>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{r.userDept || '—'}</td>
                        </>
                      )}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="text-[10px] font-mono text-slate-400">{r.documentNumber ?? '—'}</span>
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-300 text-center whitespace-nowrap">
                        {DAY_FULL_TH[dayIndex]}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 text-center whitespace-nowrap">
                        {fmtDateTH(r.date)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {r.timeSlot
                          ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${r.timeSlot === 'เช้า' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : r.timeSlot === 'บ่าย' ? 'bg-sky-500/10 text-sky-300 border-sky-500/20' : 'bg-slate-700/50 text-slate-400 border-slate-600/50'}`}>{r.timeSlot}</span>
                          : <span className="text-slate-600 text-xs">—</span>
                        }
                      </td>
                      <td className="px-3 py-3 max-w-[150px]">
                        <p className="text-xs font-medium text-white truncate">{r.place}</p>
                      </td>
                      <td className="px-3 py-3 max-w-[160px]">
                        <p className="text-xs text-slate-300 line-clamp-2">{r.purpose}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 text-center whitespace-nowrap">
                        {r.caseNumber || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 max-w-[120px] truncate">
                        {r.productWork || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 text-center whitespace-nowrap">
                        {r.workBranch || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-center">
                        {r.caseCount != null
                          ? <span className="font-semibold text-white">{r.caseCount}</span>
                          : <span className="text-slate-600">—</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-center">
                        {r.adminChecked
                          ? <span className={`text-xs font-semibold ${r.adminChecked === 'มี' ? 'text-green-400' : 'text-slate-500'}`}>{r.adminChecked}</span>
                          : <span className="text-slate-600 text-xs">—</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 text-center whitespace-nowrap">
                        {r.supervisedBy || '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusBadge status={s} />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 max-w-[120px] truncate">
                        {r.note || '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button type="button"
                              onClick={() => setModal({ open: true, editing: r })}
                              title="แก้ไข"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button type="button"
                            onClick={() => window.open(`/outside-work/${r.id}/print`, '_blank')}
                            title="พิมพ์ / บันทึก PDF"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {canApproveOutside && isPending(r) && (
                            <>
                              <button type="button" disabled={isApproving}
                                onClick={() => handleApprove(r, 'approve')} title="อนุมัติ"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-green-400 hover:bg-green-500/10 transition disabled:opacity-40">
                                {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              </button>
                              <button type="button" disabled={isApproving}
                                onClick={() => handleApprove(r, 'reject')} title="ปฏิเสธ"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40">
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
