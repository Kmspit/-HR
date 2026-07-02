'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  AlertTriangle,
  Plus,
  Zap,
  User,
  FileUp,
  FileText,
  X,
  Send,
  ChevronDown,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { WarningPdfActions } from '@/components/warnings/WarningPdfViewer'
import { warningHasPdf } from '@/lib/warning-pdf-url'

type Warning = {
  id: string
  userId: string
  userName: string
  userDept: string
  userPosition: string
  employeeId: string
  reason: string
  description: string
  fileUrl: string | null
  sentToLine: boolean
  lineDeliveryStatus: string | null
  lineSentAt: string | null
  lineUserId: string | null
  lineErrorMessage: string | null
  isAuto: boolean
  month: number | null
  year: number | null
  lateCount: number | null
  status: string
  expiredAt: string | null
  approvedAt: string | null
  approvedByName: string | null
  rejectedByName: string | null
  rejectedReason: string | null
  createdAt: string
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: 'รออนุมัติ',  cls: 'bg-amber-500/20 text-amber-400' },
  APPROVED:         { label: 'อนุมัติแล้ว', cls: 'bg-green-500/20 text-green-400' },
  REJECTED:         { label: 'ปฏิเสธแล้ว',  cls: 'bg-red-500/20 text-red-400' },
  ARCHIVED:         { label: 'เก็บถาวร',    cls: 'bg-slate-500/20 text-slate-400' },
  DRAFT:            { label: 'ร่าง',         cls: 'bg-green-500/20 text-green-400' },
}

const LINE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  sent: {
    label: 'ส่งแล้ว',
    className:
      'bg-green-500/15 text-green-400 light:bg-green-50 light:text-green-700',
  },
  pending: {
    label: 'รอส่ง',
    className:
      'bg-amber-500/15 text-amber-400 light:bg-amber-50 light:text-amber-700',
  },
  failed: {
    label: 'ส่งไม่สำเร็จ',
    className: 'bg-red-500/15 text-red-400 light:bg-red-50 light:text-red-700',
  },
}

function LineDeliveryBadge({ w }: { w: Warning }) {
  const key = w.lineDeliveryStatus ?? (w.sentToLine ? 'sent' : null)
  if (!key || !LINE_STATUS_LABEL[key]) {
    return <span className="dark:text-slate-600 light:text-slate-400 text-xs">—</span>
  }
  const s = LINE_STATUS_LABEL[key]
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold ${s.className}`}
        title={w.lineErrorMessage ?? undefined}
      >
        {s.label}
      </span>
      {w.lineSentAt && (
        <span className="text-[11px] dark:text-slate-500 tabular-nums">
          {new Date(w.lineSentAt).toLocaleString('th-TH', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      )}
      {key === 'failed' && w.lineErrorMessage && (
        <span className="text-[11px] text-red-400 max-w-[120px] truncate" title={w.lineErrorMessage}>
          {w.lineErrorMessage}
        </span>
      )}
    </div>
  )
}

type Employee = {
  id: string
  name: string
  department: string
  position?: string
  employeeId: string
  roleLabel?: string
  warningCount: number
}

function formatEmployeeLabel(e: Employee) {
  const parts = [e.name]
  if (e.employeeId) parts.push(`(${e.employeeId})`)
  parts.push(`— ${e.department || 'ไม่ระบุแผนก'}`)
  if (e.roleLabel) parts.push(`· ${e.roleLabel}`)
  return parts.join(' ')
}

type Props = {
  isManager: boolean
  canApprove: boolean
  warnings: Warning[]
  employees: Employee[]
}

function mapWarningsFromApi(raw: Array<Record<string, unknown>>): Warning[] {
  return raw.map((w) => ({
    id: String(w.id),
    userId: String(w.userId),
    userName: (w.user as { name?: string })?.name ?? '',
    userDept: (w.user as { department?: string })?.department ?? '',
    userPosition: (w.user as { position?: string })?.position ?? '',
    employeeId: (w.user as { employeeId?: string })?.employeeId ?? '',
    reason: String(w.reason),
    description: String(w.description ?? ''),
    fileUrl: w.fileUrl != null ? String(w.fileUrl) : null,
    sentToLine: Boolean(w.sentToLine),
    lineDeliveryStatus: w.lineDeliveryStatus != null ? String(w.lineDeliveryStatus) : null,
    lineSentAt: w.lineSentAt != null ? String(w.lineSentAt) : null,
    lineUserId: w.lineUserId != null ? String(w.lineUserId) : null,
    lineErrorMessage: w.lineErrorMessage != null ? String(w.lineErrorMessage) : null,
    isAuto: Boolean(w.isAuto),
    month: w.month != null ? Number(w.month) : null,
    year: w.year != null ? Number(w.year) : null,
    lateCount: w.lateCount != null ? Number(w.lateCount) : null,
    status: w.status != null ? String(w.status) : 'APPROVED',
    expiredAt: w.expiredAt != null ? String(w.expiredAt) : null,
    approvedAt: w.approvedAt != null ? String(w.approvedAt) : null,
    approvedByName: (w.approvedBy as { name?: string })?.name ?? null,
    rejectedByName: (w.rejectedBy as { name?: string })?.name ?? null,
    rejectedReason: w.rejectedReason != null ? String(w.rejectedReason) : null,
    createdAt: String(w.createdAt),
  }))
}

const MAX_PDF_MB = 10

function branchEmployeesQuery(): string {
  if (typeof window === 'undefined') return ''
  const id = new URLSearchParams(window.location.search).get('branchId')
  return id && id !== 'all' ? `?branchId=${encodeURIComponent(id)}` : ''
}

async function loadEmployeesFromApi(): Promise<Employee[] | null> {
  const { ok, data } = await apiJson<{ employees?: Employee[] }>(
    `/api/warnings/employees${branchEmployeesQuery()}`,
  )
  if (ok && Array.isArray(data.employees)) return data.employees
  return null
}

export default function WarningsClient({ isManager, canApprove, warnings, employees }: Props) {
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ userId: '', reason: '', description: '' })
  const [empSearch, setEmpSearch] = useState('')
  const [empPickerOpen, setEmpPickerOpen] = useState(false)
  const empPickerRef = useRef<HTMLDivElement>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [sendToEmployee, setSendToEmployee] = useState(true)
  const [employeeList, setEmployeeList] = useState(employees)
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [runningCron, setRunningCron] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [list, setList] = useState(warnings)
  const [employeeStats, setEmployeeStats] = useState<{
    total: number
    warningNumber: number
  } | null>(null)

  const selectedEmployee = employeeList.find((e) => e.id === form.userId)

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    if (!q) return employeeList
    return employeeList.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.employeeId && e.employeeId.toLowerCase().includes(q)) ||
        (e.department && e.department.toLowerCase().includes(q)),
    )
  }, [employeeList, empSearch])

  useEffect(() => {
    setEmployeeList(employees)
  }, [employees])

  const refreshEmployeeList = () => {
    setLoadingEmployees(true)
    return loadEmployeesFromApi()
      .then((list) => {
        if (list) setEmployeeList(list)
      })
      .finally(() => setLoadingEmployees(false))
  }

  useEffect(() => {
    if (!isManager) return
    refreshEmployeeList()
  }, [isManager])

  useEffect(() => {
    if (!showForm || !isManager) return
    refreshEmployeeList()
  }, [showForm, isManager])

  useEffect(() => {
    if (!empPickerOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (empPickerRef.current && !empPickerRef.current.contains(e.target as Node)) {
        setEmpPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [empPickerOpen])

  const pickEmployee = (e: Employee) => {
    setForm((f) => ({ ...f, userId: e.id }))
    setEmpSearch(formatEmployeeLabel(e))
    setEmpPickerOpen(false)
  }

  const onEmpSearchChange = (text: string) => {
    setEmpSearch(text)
    const q = text.trim().toLowerCase()
    if (!q) {
      setForm((f) => ({ ...f, userId: '' }))
      return
    }
    const exact = employeeList.find(
      (e) =>
        e.name.toLowerCase() === q ||
        formatEmployeeLabel(e).toLowerCase() === q ||
        (e.employeeId && e.employeeId.toLowerCase() === q),
    )
    if (exact) setForm((f) => ({ ...f, userId: exact.id }))
    else if (form.userId) {
      const cur = employeeList.find((x) => x.id === form.userId)
      if (cur && !formatEmployeeLabel(cur).toLowerCase().includes(q) && !cur.name.toLowerCase().includes(q)) {
        setForm((f) => ({ ...f, userId: '' }))
      }
    }
  }

  useEffect(() => {
    if (!form.userId) {
      setEmployeeStats(null)
      return
    }
    apiJson<{
      total: number
      warningNumber: number
    }>(`/api/warnings/count?userId=${form.userId}`).then(({ ok, data }) => {
      if (ok && data) {
        setEmployeeStats({
          total: data.total,
          warningNumber: data.warningNumber,
        })
      }
    })
  }, [form.userId, selectedEmployee?.warningCount])

  const refreshList = async () => {
    const { data } = await apiJson<{ warnings?: Array<Record<string, unknown>> }>('/api/warnings')
    if (data.warnings) setList(mapWarningsFromApi(data.warnings))
  }

  const handleSendWarning = async (warningId: string) => {
    setSendingId(warningId)
    try {
      const { ok, data, status } = await apiJson<{
        success?: boolean
        lineDeliveryStatus?: string
        lineErrorMessage?: string | null
      }>(`/api/warnings/${warningId}/send`, {
        method: 'POST',
      })
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'ส่งไม่สำเร็จ', status))
        return
      }
      if (data.lineDeliveryStatus === 'sent') {
        toast.success('ส่ง PDF ใบเตือนไป LINE พนักงานแล้ว')
      } else {
        toast.error(data.lineErrorMessage ?? 'ส่ง LINE ไม่สำเร็จ — ลองใหม่หรือให้พนักงานผูก LINE')
      }
      await refreshList()
    } catch (err) {
      console.error('[warnings-send]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSendingId(null)
    }
  }

  const submit = async () => {
    if (!form.userId || !form.reason) {
      toast.error('กรุณาเลือกพนักงานและระบุเหตุผล')
      return
    }
    if (pdfFile && pdfFile.size > MAX_PDF_MB * 1024 * 1024) {
      toast.error(`ไฟล์ PDF ต้องไม่เกิน ${MAX_PDF_MB} MB`)
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('userId', form.userId)
      formData.append('reason', form.reason)
      formData.append('description', form.description)
      formData.append('sendToEmployee', sendToEmployee ? 'true' : 'false')
      if (pdfFile) formData.append('file', pdfFile, pdfFile.name)

      const { ok, data, status } = await apiJson<{
        warningNumber?: number
        sent?: boolean
        fileUrl?: string | null
      }>('/api/warnings', {
        method: 'POST',
        body: formData,
      })
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'เกิดข้อผิดพลาด', status))
        return
      }
      const n = data.warningNumber ?? '?'
      if (sendToEmployee) {
        const line = (data as { lineDelivery?: { status?: string; errorMessage?: string | null } })
          .lineDelivery
        if (line?.status === 'sent') {
          toast.success(`ออกใบเตือนครั้งที่ ${n} — สร้าง PDF และส่ง LINE แล้ว`)
        } else if (line?.status === 'failed') {
          toast.warning(
            `ออกใบเตือนครั้งที่ ${n} แล้ว — PDF สร้างแล้ว แต่ส่ง LINE ไม่สำเร็จ: ${line.errorMessage ?? ''}`,
          )
        } else {
          toast.success(`ออกใบเตือนครั้งที่ ${n} และแจ้งพนักงานแล้ว`)
        }
      } else {
        toast.success(`ออกใบเตือนครั้งที่ ${n} เรียบร้อย`)
      }
      setShowForm(false)
      setForm({ userId: '', reason: '', description: '' })
      setEmpSearch('')
      setEmpPickerOpen(false)
      setSendToEmployee(true)
      setPdfFile(null)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
      setEmployeeStats(null)
      await refreshList()
    } catch (err) {
      console.error('[warnings]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const approveWarning = async (id: string) => {
    setActingId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/warnings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' }),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'อนุมัติไม่สำเร็จ', status)); return }
      toast.success('อนุมัติใบเตือนแล้ว — พนักงานจะได้รับแจ้งเตือน')
      setList((prev) => prev.map((w) => w.id === id ? { ...w, status: 'APPROVED', approvedAt: new Date().toISOString() } : w))
      await refreshList()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setActingId(null) }
  }

  const rejectWarning = async (id: string) => {
    const reason = window.prompt('ระบุเหตุผลที่ปฏิเสธ (ไม่บังคับ):') ?? ''
    setActingId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/warnings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECT', rejectedReason: reason }),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'ปฏิเสธไม่สำเร็จ', status)); return }
      toast.success('ปฏิเสธใบเตือนแล้ว')
      setList((prev) => prev.map((w) => w.id === id ? { ...w, status: 'REJECTED' } : w))
      await refreshList()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setActingId(null) }
  }

  const runCron = async () => {
    setRunningCron(true)
    try {
      const { ok, data, status } = await apiJson<{ warned?: number }>(
        '/api/warnings/run-check',
        { method: 'POST' },
      )
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'เกิดข้อผิดพลาด', status))
        return
      }
      toast.success(`ตรวจสอบเสร็จ: ออกใบเตือน ${data.warned ?? 0} คน`)
      await refreshList()
    } catch (err) {
      console.error('[warnings-cron]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setRunningCron(false)
    }
  }

  const warningNumber = employeeStats?.warningNumber ?? (selectedEmployee ? selectedEmployee.warningCount + 1 : 1)

  const warningOrdinalById = useMemo(() => {
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    const ordinalByWarningId = new Map<string, number>()
    const countByUser = new Map<string, number>()
    for (const w of sorted) {
      const n = (countByUser.get(w.userId) ?? 0) + 1
      countByUser.set(w.userId, n)
      ordinalByWarningId.set(w.id, n)
    }
    return ordinalByWarningId
  }, [list])

  const sortedHistory = useMemo(
    () => [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [list],
  )

  const monthNames = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

  const getMonthKey = (w: Warning) => {
    const d = new Date(w.createdAt)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const formatMonthLabel = (key: string) => {
    const [y, m] = key.split('-')
    const mi = parseInt(m, 10)
    return `${monthNames[mi] ?? m} ${parseInt(y, 10) + 543}`
  }

  const summaryByMonth = useMemo(() => {
    const map = new Map<
      string,
      { key: string; total: number; employeeIds: Set<string>; latestAt: string }
    >()
    for (const w of list) {
      const key = getMonthKey(w)
      const cur = map.get(key)
      if (!cur) {
        map.set(key, {
          key,
          total: 1,
          employeeIds: new Set([w.userId]),
          latestAt: w.createdAt,
        })
      } else {
        cur.total += 1
        cur.employeeIds.add(w.userId)
        if (new Date(w.createdAt) > new Date(cur.latestAt)) {
          cur.latestAt = w.createdAt
        }
      }
    }
    return [...map.values()]
      .map((row) => ({ ...row, employeeCount: row.employeeIds.size }))
      .sort(
        (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
      )
  }, [list])

  const formatShortDate = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    })

  const thCls =
    'px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap dark:text-slate-400 light:text-slate-500'
  const tdCls = 'px-4 py-3 align-middle text-sm whitespace-nowrap'
  const trRowCls =
    'table-row-hover border-b dark:border-white/[0.06] light:border-slate-100 even:dark:bg-white/[0.02] even:light:bg-slate-50/80'

  const renderWarningRow = (w: Warning) => {
    const userOrdinal = warningOrdinalById.get(w.id) ?? '?'
    const dateStr = new Date(w.createdAt).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    })
    return (
      <tr key={w.id} className={trRowCls}>
        <td
          className={`${tdCls} text-center tabular-nums dark:text-slate-300 light:text-slate-600`}
          title={new Date(w.createdAt).toLocaleString('th-TH')}
        >
          {dateStr}
        </td>
        {isManager && (
          <td
            className={`${tdCls} dark:text-white light:text-slate-900 font-medium max-w-[180px] truncate`}
            title={w.userName}
          >
            {w.userName}
            {w.employeeId ? (
              <span className="block text-[11px] font-normal dark:text-slate-500 light:text-slate-500">
                {w.employeeId}
              </span>
            ) : null}
          </td>
        )}
        <td className={`${tdCls} text-center dark:text-slate-400 light:text-slate-500 tabular-nums`}>
          ครั้งที่ {userOrdinal}
        </td>
        <td
          className={`${tdCls} dark:text-slate-200 light:text-slate-700 max-w-[220px] truncate`}
          title={w.reason}
        >
          {w.reason}
        </td>
        <td className={`${tdCls} text-center`}>
          {w.isAuto ? (
            <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-purple-500/15 text-purple-400 light:bg-purple-50 light:text-purple-700">
              อัตโนมัติ
            </span>
          ) : (
            <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-green-500/15 text-green-400 light:bg-green-50 light:text-green-700">
              ด้วยตนเอง
            </span>
          )}
        </td>
        <td className={`${tdCls} text-center`}>
          {(() => {
            const b = STATUS_BADGE[w.status] ?? STATUS_BADGE.APPROVED
            return (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold ${b.cls}`}>
                {b.label}
              </span>
            )
          })()}
        </td>
        <td className={`${tdCls} text-center`}>
          {warningHasPdf(w.fileUrl) ? (
            <WarningPdfActions
              warningId={w.id}
              label={`ใบเตือน — ${w.userName} (${userOrdinal})`}
              compact
            />
          ) : (
            <span className="dark:text-slate-600 light:text-slate-400 text-xs">—</span>
          )}
        </td>
        <td className={`${tdCls} text-center`}>
          <LineDeliveryBadge w={w} />
        </td>
        {isManager && (
          <td className={`${tdCls} text-center`}>
            {w.status === 'PENDING_APPROVAL' && canApprove ? (
              <div className="flex gap-1 justify-center">
                <button
                  type="button"
                  onClick={() => approveWarning(w.id)}
                  disabled={actingId === w.id}
                  className="inline-flex items-center gap-1 rounded-lg bg-green-600/80 hover:bg-green-500 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {actingId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '✓ อนุมัติ'}
                </button>
                <button
                  type="button"
                  onClick={() => rejectWarning(w.id)}
                  disabled={actingId === w.id}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-600/60 hover:bg-red-500 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  ✗
                </button>
              </div>
            ) : w.status === 'APPROVED' ? (
              <button
                type="button"
                onClick={() => handleSendWarning(w.id)}
                disabled={sendingId === w.id}
                title="ส่ง PDF ใบเตือนไป LINE พนักงาน (retry อัตโนมัติ)"
                className="inline-flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-green-400 light:border-green-200 light:bg-green-50 light:text-green-700 hover:bg-green-500/20 light:hover:bg-green-100 disabled:opacity-50 touch-manipulation min-h-[36px]"
              >
                <Send className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">
                  {sendingId === w.id ? 'กำลังส่ง...' : 'ส่งใหม่ไป LINE'}
                </span>
                <span className="sm:hidden">{sendingId === w.id ? '...' : 'LINE'}</span>
              </button>
            ) : (
              <span className="dark:text-slate-600 light:text-slate-400 text-xs">—</span>
            )}
          </td>
        )}
      </tr>
    )
  }

  const historyHead = (
    <tr className="border-b dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-slate-50">
      <th className={`${thCls} text-center`}>วันที่</th>
      {isManager && <th className={`${thCls} text-left`}>พนักงาน</th>}
      <th className={`${thCls} text-center`}>ครั้งที่</th>
      <th className={`${thCls} text-left`}>เหตุผล</th>
      <th className={`${thCls} text-center`}>ประเภท</th>
      <th className={`${thCls} text-center`}>สถานะ</th>
      <th className={`${thCls} text-center`}>PDF</th>
      <th className={`${thCls} text-center`}>LINE</th>
      {isManager && <th className={`${thCls} text-center`}>{canApprove ? 'อนุมัติ / ส่ง LINE' : 'ส่ง LINE'}</th>}
    </tr>
  )

  const pendingWarnings = list.filter((w) => w.status === 'PENDING_APPROVAL')

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Pending approval banner */}
      {canApprove && pendingWarnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            รออนุมัติใบเตือน {pendingWarnings.length} รายการ
          </div>
          <div className="space-y-2">
            {pendingWarnings.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 flex-wrap rounded-xl bg-slate-900/60 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-white">{w.userName}</span>
                  {w.userDept && <span className="text-slate-400 text-xs ml-1">— {w.userDept}</span>}
                  <p className="text-xs text-slate-400 mt-0.5">{w.reason}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => approveWarning(w.id)}
                    disabled={actingId === w.id}
                    className="flex items-center gap-1 rounded-xl bg-green-600 hover:bg-green-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {actingId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '✓'} อนุมัติ
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectWarning(w.id)}
                    disabled={actingId === w.id}
                    className="flex items-center gap-1 rounded-xl bg-red-600/70 hover:bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    ✗ ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end flex-wrap gap-3">
        {isManager && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runCron}
              disabled={runningCron}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm transition"
            >
              <Zap className="w-4 h-4" />
              {runningCron ? 'กำลังตรวจ...' : 'รัน Auto-Check'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition"
            >
              <Plus className="w-4 h-4" /> ออกใบเตือน
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="glass-card card-hover rounded-2xl p-5 space-y-4 animate-fade-in-sm">
          <h3 className="font-semibold text-white">ออกใบเตือนด้วยตนเอง</h3>

          <div>
            <label className="text-sm text-white/50 block mb-1.5">เลือกพนักงาน</label>
            <div
              ref={empPickerRef}
              className="relative rounded-xl border border-white/15 bg-slate-900/80 focus-within:border-green-500/50 transition-colors"
            >
              <div className="flex items-center gap-1 pr-1">
                <input
                  type="text"
                  value={empSearch}
                  onChange={(e) => {
                    onEmpSearchChange(e.target.value)
                    setEmpPickerOpen(true)
                  }}
                  onFocus={() => setEmpPickerOpen(true)}
                  placeholder="พิมพ์ชื่อพนักงาน รหัส หรือแผนก..."
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-transparent border-0 px-4 py-3.5 text-sm text-white placeholder:text-slate-500 outline-none"
                />
                {loadingEmployees ? (
                  <Loader2 className="w-5 h-5 text-green-400 animate-spin flex-shrink-0" />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEmpPickerOpen((o) => !o)}
                    className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition touch-manipulation"
                    aria-label="เปิดรายชื่อพนักงาน"
                    title="เลือกจากรายการ"
                  >
                    <ChevronDown
                      className={`w-5 h-5 transition-transform ${empPickerOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </div>

              {empPickerOpen && !loadingEmployees && (
                <ul
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/15 bg-slate-900 shadow-xl"
                  role="listbox"
                >
                  {filteredEmployees.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-slate-500">ไม่พบพนักงานที่ตรงกับคำค้น</li>
                  ) : (
                    filteredEmployees.map((e) => (
                      <li key={e.id} role="option">
                        <button
                          type="button"
                          onClick={() => pickEmployee(e)}
                          className={`w-full text-left px-4 py-2.5 text-sm transition hover:bg-white/5 touch-manipulation ${
                            form.userId === e.id ? 'bg-green-500/15 text-green-200' : 'text-white'
                          }`}
                        >
                          <span className="font-medium">{e.name}</span>
                          {e.employeeId && (
                            <span className="text-slate-400 ml-1">({e.employeeId})</span>
                          )}
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {e.department || 'ไม่ระบุแผนก'}
                            {e.roleLabel ? ` · ${e.roleLabel}` : ''}
                            {' · ใบเตือนแล้ว '}
                            {e.warningCount} ครั้ง
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-1">
              พิมพ์ชื่อหรือกดลูกศรเลือกจากรายการ ·{' '}
              {loadingEmployees
                ? 'กำลังโหลดจากฐานข้อมูล...'
                : `พนักงาน ACTIVE ทั้งหมด ${employeeList.length} คน`}
            </p>
          </div>

          {form.userId && selectedEmployee && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-white">
                <User className="w-4 h-4 text-amber-400" />
                <span className="font-semibold">{selectedEmployee.name}</span>
                {selectedEmployee.employeeId && (
                  <span className="text-xs text-slate-400">({selectedEmployee.employeeId})</span>
                )}
              </div>
              <p className="text-sm text-amber-100/90">
                เคยได้รับใบเตือนแล้ว{' '}
                <strong className="text-white">{employeeStats?.total ?? selectedEmployee.warningCount}</strong> ครั้ง
                {' · '}ครั้งนี้จะเป็น{' '}
                <strong className="text-white">ครั้งที่ {warningNumber}</strong>
              </p>
            </div>
          )}

          <div>
            <label className="text-sm text-white/50 block mb-1">เหตุผล *</label>
            <input
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500"
              placeholder="ระบุเหตุผลการออกใบเตือน..."
            />
          </div>
          <div>
            <label className="text-sm text-white/50 block mb-1">รายละเอียดเพิ่มเติม</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-500 resize-none"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-3">
            <label className="text-sm font-semibold text-white block">ไฟล์ใบเตือน (PDF)</label>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) {
                  setPdfFile(null)
                  return
                }
                if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                  toast.error('กรุณาเลือกไฟล์ PDF เท่านั้น')
                  e.target.value = ''
                  setPdfFile(null)
                  return
                }
                if (file.size > MAX_PDF_MB * 1024 * 1024) {
                  toast.error(`ไฟล์ต้องไม่เกิน ${MAX_PDF_MB} MB`)
                  e.target.value = ''
                  setPdfFile(null)
                  return
                }
                setPdfFile(file)
                setSendToEmployee(true)
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm font-medium hover:bg-red-500/20 transition touch-manipulation"
              >
                <FileUp className="w-4 h-4" />
                เลือกไฟล์ PDF
              </button>
              {pdfFile && (
                <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-3 py-2 text-sm text-slate-300">
                  <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="truncate max-w-[180px]">{pdfFile.name}</span>
                  <span className="text-xs text-slate-500">
                    ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPdfFile(null)
                      if (pdfInputRef.current) pdfInputRef.current.value = ''
                    }}
                    className="p-0.5 text-slate-500 hover:text-white"
                    aria-label="ลบไฟล์"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-[12px] text-slate-500">ไม่บังคับ — สูงสุด {MAX_PDF_MB} MB</p>
            <label className="flex items-start gap-2.5 cursor-pointer touch-manipulation">
              <input
                type="checkbox"
                checked={sendToEmployee}
                onChange={(e) => setSendToEmployee(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-green-500"
              />
              <span className="text-xs text-slate-300 leading-relaxed">
                ส่งแจ้งพนักงานทันที (แอพ + LINE){pdfFile ? ' พร้อมลิงก์ไฟล์ PDF' : ''}
              </span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setEmployeeStats(null)
                setEmpSearch('')
                setPdfFile(null)
                setSendToEmployee(true)
                if (pdfInputRef.current) pdfInputRef.current.value = ''
              }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm hover:bg-white/5 transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !form.userId}
              className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition disabled:opacity-50"
            >
              {submitting ? 'กำลังส่ง...' : `ออกใบเตือน (ครั้งที่ ${warningNumber})`}
            </button>
          </div>
        </div>
      )}

      {isManager && summaryByMonth.length > 0 && (
        <div className="glass-card card-hover rounded-2xl overflow-hidden smooth-transition">
          <div className="px-4 py-3 border-b dark:border-white/10 light:border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold dark:text-white light:text-slate-900">
              สรุปใบเตือนรายเดือน
            </h2>
            <p className="text-[11px] dark:text-slate-500 light:text-slate-500">
              เรียงตามวันที่ล่าสุดในแต่ละเดือน
            </p>
          </div>
          <div className="table-scroll">
            <table className="warnings-table hr-table min-w-[480px]">
              <thead>
                <tr className="border-b dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-slate-50">
                  <th className={`${thCls} text-left`}>เดือน / ปี</th>
                  <th className={`${thCls} text-center`}>ล่าสุดในเดือน</th>
                  <th className={`${thCls} text-center`}>จำนวนใบ</th>
                  <th className={`${thCls} text-center`}>พนักงานที่โดน</th>
                </tr>
              </thead>
              <tbody>
                {summaryByMonth.map((row) => (
                  <tr key={row.key} className={trRowCls}>
                    <td className={`${tdCls} dark:text-white light:text-slate-900 font-semibold`}>
                      {formatMonthLabel(row.key)}
                    </td>
                    <td
                      className={`${tdCls} text-center tabular-nums dark:text-slate-400 light:text-slate-600`}
                      title={new Date(row.latestAt).toLocaleString('th-TH')}
                    >
                      {formatShortDate(row.latestAt)}
                    </td>
                    <td className={`${tdCls} text-center`}>
                      <span className="inline-flex min-w-[3.5rem] justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 light:border-amber-200 light:bg-amber-50 light:text-amber-800 tabular-nums">
                        {row.total}
                      </span>
                    </td>
                    <td className={`${tdCls} text-center tabular-nums dark:text-slate-300 light:text-slate-700`}>
                      {row.employeeCount} คน
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-white/30">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          {isManager ? 'ยังไม่มีใบเตือนในระบบ' : 'คุณยังไม่มีใบเตือน'}
        </div>
      ) : (
        <div className="glass-card card-hover rounded-2xl overflow-hidden smooth-transition">
          <div className="px-4 py-3 border-b dark:border-white/10 light:border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold dark:text-white light:text-slate-900">
              {isManager ? 'ประวัติใบเตือนทั้งหมด' : 'ประวัติใบเตือนของฉัน'}
            </h2>
            <p className="text-[11px] dark:text-slate-500 light:text-slate-500">เรียงจากใหม่ → เก่า</p>
          </div>
          <div className="table-scroll">
            <table className={`warnings-table hr-table ${isManager ? 'min-w-[640px]' : 'min-w-[480px]'}`}>
              <thead>{historyHead}</thead>
              <tbody>{sortedHistory.map((w) => renderWarningRow(w))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
