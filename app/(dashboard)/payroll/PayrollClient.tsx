'use client'

import { useState } from 'react'
import { DollarSign, Download, Loader2, MessageCircle, RefreshCw, Clock, X, CheckCircle } from 'lucide-react'
import { TableSkeletonRows } from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import LateDeductionDetail from '@/components/payroll/LateDeductionDetail'
import { ManualButton } from '@/components/ui/ManualButton'
import { useModalA11y } from '@/hooks/useModalA11y'

type PayrollRow = {
  id: string
  userId: string
  name: string
  employeeId: string
  department: string
  position: string
  socialSecurity: boolean
  baseSalary: number
  lateDeduction: number
  absentDeduction: number
  unpaidLeave: number
  ssDeduction: number
  netSalary: number
  lateDays: number
  absentDays: number
  lateMinutes: number
  lateBillableMinutes?: number
  lateDeductionDetail?: string | null
  status: string
  hasPayroll?: boolean
  payslipSentAt?: string | null
  payslipSentVia?: string | null
  payslipSentStatus?: string | null
  payslipSentError?: string | null
  lineLinked?: boolean
}

type LateSummary = {
  employeesWithLate: number
  totalLateDeduction: number
  totalBillableLateMinutes: number
}

type Props = {
  month: number
  year: number
  payrolls: PayrollRow[]
  totalEmployees?: number
  filterBranchId?: string
  canApprove?: boolean
}

const MONTH_NAMES = [
  '',
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

export default function PayrollClient({
  month: initMonth,
  year: initYear,
  payrolls: initPayrolls,
  totalEmployees,
  filterBranchId,
  canApprove = false,
}: Props) {
  const [month, setMonth] = useState(initMonth)
  const [year, setYear] = useState(initYear)
  const [payrolls, setPayrolls] = useState(initPayrolls)
  const [lateSummary, setLateSummary] = useState<LateSummary | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detailRow, setDetailRow] = useState<PayrollRow | null>(null)
  const detailPanelRef = useModalA11y(!!(detailRow && detailRow.hasPayroll))
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendingBatch, setSendingBatch] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approvingBatch, setApprovingBatch] = useState(false)

  const loadPayrolls = async (m: number, y: number) => {
    setLoading(true)
    const { ok, data } = await apiJson<{
      payrolls?: PayrollRow[]
      employeeCount?: number
      lateSummary?: LateSummary
    }>(
      `/api/payroll/report?month=${m}&year=${y}${filterBranchId ? `&branchId=${encodeURIComponent(filterBranchId)}` : ''}`,
    )
    if (ok && data.payrolls) {
      setPayrolls(
        data.payrolls.map((p) => ({
          ...p,
          name: (p as { user?: { name?: string } }).user?.name ?? p.name ?? '',
          employeeId: (p as { user?: { employeeId?: string } }).user?.employeeId ?? p.employeeId ?? '',
          department: (p as { user?: { department?: string } }).user?.department ?? p.department ?? '',
          position: (p as { user?: { position?: string } }).user?.position ?? p.position ?? '',
          socialSecurity:
            (p as { user?: { socialSecurity?: boolean } }).user?.socialSecurity ??
            p.socialSecurity ??
            false,
          ssDeduction: (p as { ssDeduction?: number }).ssDeduction ?? p.ssDeduction ?? 0,
          lateBillableMinutes: p.lateBillableMinutes ?? p.lateMinutes ?? 0,
        })),
      )
      setLateSummary(data.lateSummary ?? null)
    }
    setLoading(false)
  }

  const generate = async () => {
    setGenerating(true)
    const { ok, data, status } = await apiJson('/api/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, branchId: filterBranchId }),
    })
    if (ok) {
      const result = data as { count?: number; message?: string; skippedApproved?: { userId: string; name: string }[] }
      toast.success(`สร้าง payroll สำเร็จ ${result.count ?? 0} คน`)
      if (result.skippedApproved && result.skippedApproved.length > 0) {
        toast.warning(result.message ?? `ข้าม ${result.skippedApproved.length} รายการที่อนุมัติแล้ว`)
      }
      await loadPayrolls(month, year)
    } else {
      toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
    }
    setGenerating(false)
  }

  const exportCSV = () => {
    const headers = [
      'ชื่อ',
      'รหัส',
      'แผนก',
      'เงินเดือนฐาน',
      'หักมาสาย',
      'นาทีหักมาสาย',
      'หักขาด',
      'หักลาไม่รับเงิน',
      'ประกันสังคม',
      'รับสุทธิ',
      'สถานะ',
    ]
    const rows = payrolls.map((p) => [
      p.name,
      p.employeeId,
      p.department,
      p.baseSalary.toFixed(2),
      p.lateDeduction.toFixed(2),
      String(p.lateBillableMinutes ?? p.lateMinutes),
      p.absentDeduction.toFixed(2),
      p.unpaidLeave.toFixed(2),
      p.ssDeduction.toFixed(2),
      p.netSalary.toFixed(2),
      p.status,
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll_${month}_${year}.csv`
    a.click()
  }

  const sendSlipLine = async (row: PayrollRow) => {
    if (!row.hasPayroll || row.status !== 'APPROVED') {
      toast.error('ต้องอนุมัติ payroll ก่อนส่งสลิป')
      return
    }
    if (!row.lineLinked) {
      toast.error('พนักงานยังไม่ได้เชื่อม LINE OA')
      return
    }
    const isResend = row.payslipSentStatus === 'SUCCESS'
    if (isResend) {
      const okResend = window.confirm(
        `ส่งสลิป LINE ซ้ำให้ ${row.name}?\n\nพนักงานจะได้รับ Flex Message ใหม่`,
      )
      if (!okResend) return
    }
    setSendingId(row.id)
    const { ok, data, status } = await apiJson<{
      sent?: number
      failed?: number
      skipped?: number
      results?: { ok: boolean; error?: string; skipped?: boolean }[]
    }>('/api/payslip/send-line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payrollId: row.id,
        userId: row.userId,
        forceResend: isResend,
        ...(filterBranchId ? { branchId: filterBranchId } : {}),
      }),
    })
    if (ok && (data.results?.[0]?.ok ?? data.sent === 1)) {
      toast.success(isResend ? `ส่งสลิป LINE ซ้ำให้ ${row.name} แล้ว` : `ส่งสลิป LINE ให้ ${row.name} แล้ว`)
      await loadPayrolls(month, year)
    } else if (data.results?.[0]?.skipped || (data.skipped ?? 0) > 0) {
      toast.info(data.results?.[0]?.error ?? 'ส่งสลิปแล้ว')
    } else {
      const err = data.results?.[0]?.error ?? apiErrorMessage(data, 'ส่งสลิปไม่สำเร็จ', status)
      toast.error(err)
      await loadPayrolls(month, year)
    }
    setSendingId(null)
  }

  const sendAllSlipsLine = async () => {
    const approved = payrolls.filter((p) => p.hasPayroll && p.status === 'APPROVED')
    const linked = approved.filter((p) => p.lineLinked)
    const pending = linked.filter((p) => p.payslipSentStatus !== 'SUCCESS')
    if (pending.length === 0) {
      toast.error(linked.length > 0 ? 'ส่งสลิปครบแล้วทุกคนที่เชื่อม LINE' : 'ไม่มีพนักงานที่อนุมัติแล้วและเชื่อม LINE')
      return
    }
    const skippedNoLine = approved.length - linked.length
    const alreadySent = linked.length - pending.length
    const okConfirm = window.confirm(
      `ส่งสลิปเงินเดือนผ่าน LINE ให้พนักงาน ${pending.length} คน?` +
        (alreadySent > 0 ? `\n(ข้าม ${alreadySent} คนที่ส่งแล้ว)` : '') +
        (skippedNoLine > 0 ? `\n(ข้าม ${skippedNoLine} คนที่ยังไม่เชื่อม LINE)` : '') +
        `\n\nPDF จะถูกเข้ารหัสด้วยเลขบัตรประชาชน 4 ตัวท้าย`,
    )
    if (!okConfirm) return

    setSendingBatch(true)
    const anchor = pending[0]
    let totalSent = 0
    let totalFailed = 0
    let hasMore = true
    let batchError: string | null = null

    // offset 0 ทุกรอบ — SUCCESS ถูก exclude ฝั่ง server; FAILED ยังอยู่ใน queue
    while (hasMore) {
      const { ok, data, status } = await apiJson<{
        sent?: number
        failed?: number
        skipped?: number
        hasMore?: boolean
        processed?: number
        total?: number
      }>('/api/payslip/send-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollId: anchor.id,
          offset: 0,
          ...(filterBranchId ? { branchId: filterBranchId } : {}),
        }),
      })
      if (!ok) {
        batchError = apiErrorMessage(data, 'ส่งสลิป batch ไม่สำเร็จ', status)
        break
      }
      totalSent += data.sent ?? 0
      totalFailed += data.failed ?? 0
      const processed = data.processed ?? 0
      hasMore = (data.hasMore ?? false) && processed > 0
      // หยุดถ้ารอบนี้ล้มทั้งหมด (กัน loop ไม่รู้จบเมื่อ LINE down)
      if (processed > 0 && (data.sent ?? 0) === 0 && (data.skipped ?? 0) === 0) {
        hasMore = false
      }
    }

    if (batchError) {
      toast.error(`${batchError}${totalSent > 0 ? ` (ส่งสำเร็จ ${totalSent} คนก่อนหยุด)` : ''}`)
    } else if (totalFailed > 0) {
      toast.success(`ส่งสลิป LINE สำเร็จ ${totalSent} คน (ล้มเหลว ${totalFailed} คน)`)
    } else {
      toast.success(`ส่งสลิป LINE สำเร็จ ${totalSent} คน`)
    }
    await loadPayrolls(month, year)
    setSendingBatch(false)
  }

  const approvePayroll = async (row: PayrollRow) => {
    if (!canApprove || !row.hasPayroll || row.status !== 'DRAFT') return
    setApprovingId(row.id)
    const { ok, data, status } = await apiJson('/api/payroll/report', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, status: 'APPROVED' }),
    })
    if (ok) {
      toast.success(`อนุมัติ payroll ${row.name} แล้ว`)
      await loadPayrolls(month, year)
    } else {
      toast.error(apiErrorMessage(data, 'อนุมัติไม่สำเร็จ', status))
    }
    setApprovingId(null)
  }

  const approveAllDrafts = async () => {
    const drafts = payrolls.filter((p) => p.hasPayroll && p.status === 'DRAFT')
    if (drafts.length === 0) {
      toast.error('ไม่มี payroll สถานะร่าง')
      return
    }
    const okConfirm = window.confirm(`อนุมัติ payroll ${drafts.length} รายการ?`)
    if (!okConfirm) return

    setApprovingBatch(true)
    let okCount = 0
    for (const row of drafts) {
      const { ok } = await apiJson('/api/payroll/report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status: 'APPROVED' }),
      })
      if (ok) okCount++
    }
    if (okCount === drafts.length) {
      toast.success(`อนุมัติ payroll สำเร็จ ${okCount} รายการ`)
    } else {
      toast.error(`อนุมัติสำเร็จ ${okCount}/${drafts.length} รายการ`)
    }
    await loadPayrolls(month, year)
    setApprovingBatch(false)
  }

  const renderLineStatus = (p: PayrollRow) => {
    if (p.lineLinked) {
      return <span className="text-green-400 text-xs">✅ เชื่อมแล้ว</span>
    }
    return (
      <span className="text-red-400 text-xs cursor-help" title="พนักงานยังไม่ได้เชื่อม LINE OA">
        ❌ ยังไม่เชื่อม
      </span>
    )
  }

  const renderPayslipSendStatus = (p: PayrollRow) => {
    if (!p.hasPayroll || p.status !== 'APPROVED') return <span className="text-white/30">—</span>
    if (p.payslipSentStatus === 'SUCCESS' && p.payslipSentAt) {
      const d = new Date(p.payslipSentAt)
      const label = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
      return (
        <span className="text-green-400 text-xs" title={p.payslipSentVia === 'LINE' ? 'ส่งผ่าน LINE' : undefined}>
          ✅ {label}
        </span>
      )
    }
    if (p.payslipSentStatus === 'FAILED') {
      const noLine =
        !p.lineLinked ||
        (p.payslipSentError?.includes('LINE OA') ?? false)
      const tooltip = noLine
        ? 'พนักงานยังไม่ได้เชื่อม LINE OA'
        : (p.payslipSentError ?? 'ส่งไม่สำเร็จ')
      return (
        <span className="text-red-400 text-xs cursor-help" title={tooltip}>
          ❌ ส่งไม่สำเร็จ
        </span>
      )
    }
    if (p.payslipSentStatus === 'PENDING') {
      return <span className="text-amber-400 text-xs">⏳ กำลังส่ง…</span>
    }
    return <span className="text-white/40 text-xs">— ยังไม่ส่ง</span>
  }

  const totalNet = payrolls.reduce((s, p) => s + p.netSalary, 0)
  const summary: LateSummary = lateSummary ?? {
    employeesWithLate: payrolls.filter((p) => p.lateDeduction > 0).length,
    totalLateDeduction: payrolls.reduce((s, p) => s + p.lateDeduction, 0),
    totalBillableLateMinutes: payrolls.reduce(
      (s, p) => s + (p.lateBillableMinutes ?? p.lateMinutes ?? 0),
      0,
    ),
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">เงินเดือน</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <ManualButton section="payroll" />
          <select
            value={month}
            onChange={(e) => {
              const m = parseInt(e.target.value)
              setMonth(m)
              loadPayrolls(m, year)
            }}
            className="bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm"
          >
            {MONTH_NAMES.slice(1).map((n, i) => (
              <option key={i + 1} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => {
              const y = parseInt(e.target.value)
              setYear(y)
              loadPayrolls(month, y)
            }}
            className="bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            คำนวณ
          </button>
          {canApprove && (
            <button
              onClick={approveAllDrafts}
              disabled={approvingBatch || loading}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
            >
              {approvingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              อนุมัติทั้งหมด
            </button>
          )}
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl text-sm transition"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={sendAllSlipsLine}
            disabled={sendingBatch || loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
          >
            {sendingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            ส่งสลิปทุกคน
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-hover smooth-transition bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{totalEmployees ?? payrolls.length}</p>
          <p className="text-sm text-slate-500 dark:text-white/50">พนักงานทั้งหมด</p>
        </div>
        <div className="card-hover smooth-transition bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">
            ฿{totalNet.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-sm text-slate-500 dark:text-white/50">รวมจ่ายสุทธิ</p>
        </div>
        <div className="card-hover smooth-transition bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            ฿{summary.totalLateDeduction.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-slate-500 dark:text-white/50">หักมาสายรวม ({summary.employeesWithLate} คน)</p>
        </div>
        <div className="card-hover smooth-transition bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-orange-400">{summary.totalBillableLateMinutes}</p>
          <p className="text-sm text-slate-500 dark:text-white/50">นาทีหักมาสายรวม</p>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-white/45 px-1">
        พนักงานที่ยังไม่ได้เชื่อม LINE OA ให้แอดบอท LINE แล้วส่งรหัส 6 หลัก
      </p>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading && (
          <div className="rounded-2xl glass-card p-6 text-center text-sm text-slate-400 dark:text-white/40">กำลังโหลด...</div>
        )}
        {!loading && payrolls.length === 0 && (
          <div className="rounded-2xl glass-card p-6 text-center text-sm text-slate-400 dark:text-white/40">
            ยังไม่มีข้อมูล กด &quot;คำนวณ&quot; เพื่อสร้าง payroll
          </div>
        )}
        {!loading && payrolls.map((p) => {
          const hasDeductions = p.hasPayroll && (p.lateDeduction > 0 || p.absentDeduction > 0 || p.ssDeduction > 0)
          const statusLabel =
            p.status === 'APPROVED' ? 'อนุมัติ' :
            p.status === 'SENT'     ? 'ส่งแล้ว' :
            p.status === 'PENDING'  ? 'รอคำนวณ' : 'ร่าง'
          const statusCls =
            p.status === 'APPROVED' || p.status === 'SENT' ? 'bg-green-500/20 text-green-400' :
            p.status === 'PENDING'  ? 'bg-amber-500/20 text-amber-400' :
            'bg-white/10 text-slate-400 dark:text-white/40'
          const showApprove = canApprove && p.hasPayroll && p.status === 'DRAFT'
          const showSendLine = p.hasPayroll && p.status === 'APPROVED'

          return (
            <div key={p.id} className={`glass-card rounded-2xl p-4 space-y-3 ${!p.hasPayroll ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-slate-900 dark:text-white font-medium truncate">{p.name}</p>
                  <p className="text-slate-400 dark:text-white/40 text-xs truncate">{p.department} · {p.position}</p>
                  {!p.hasPayroll && (
                    <p className="text-[12px] text-amber-400 mt-0.5">ยังไม่คำนวณ — กดปุ่มคำนวณ</p>
                  )}
                </div>
                {!showApprove && (
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs ${statusCls}`}>{statusLabel}</span>
                )}
              </div>

              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[11px] text-slate-400 dark:text-white/40">ฐาน</p>
                  <p className="text-slate-700 dark:text-white/70 text-sm">
                    {p.hasPayroll ? `฿${p.baseSalary.toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-400 dark:text-white/40">สุทธิ</p>
                  <p className="font-bold text-green-400 text-lg">
                    {p.hasPayroll
                      ? `฿${p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`
                      : '—'}
                  </p>
                </div>
              </div>

              {hasDeductions && (
                <p className="text-xs flex flex-wrap gap-x-3 gap-y-1">
                  {p.lateDeduction > 0 && (
                    <button
                      type="button"
                      onClick={() => setDetailRow(p)}
                      className="text-red-400 hover:text-red-300 underline underline-offset-2"
                    >
                      หักสาย -฿{p.lateDeduction.toFixed(2)}
                      {(p.lateBillableMinutes ?? 0) > 0 && ` (${p.lateBillableMinutes} น.)`}
                    </button>
                  )}
                  {p.absentDeduction > 0 && (
                    <span className="text-red-400">หักขาด -฿{p.absentDeduction.toFixed(0)}</span>
                  )}
                  {p.ssDeduction > 0 && (
                    <span className="text-orange-400">SS -฿{p.ssDeduction.toFixed(0)}</span>
                  )}
                </p>
              )}

              <p className="text-xs text-slate-400 dark:text-white/40">
                สาย {p.lateDays} วัน · ขาด {p.absentDays} วัน
              </p>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-white/[0.06]">
                {renderLineStatus(p)}
                {renderPayslipSendStatus(p)}
              </div>

              {showApprove && (
                <button
                  type="button"
                  onClick={() => approvePayroll(p)}
                  disabled={approvingId === p.id || approvingBatch}
                  className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition"
                >
                  {approvingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  อนุมัติ payroll
                </button>
              )}
              {showSendLine && (
                <button
                  type="button"
                  onClick={() => sendSlipLine(p)}
                  disabled={sendingId === p.id || sendingBatch || !p.lineLinked}
                  title={!p.lineLinked ? 'พนักงานยังไม่ได้เชื่อม LINE OA' : undefined}
                  className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-sm font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50 transition"
                >
                  {sendingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                  ส่ง LINE สลิปเงินเดือน
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="hidden md:block glass-card card-hover rounded-2xl overflow-hidden smooth-transition">
        <div className="table-scroll">
          <table className="w-full text-sm min-w-[1150px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10">
                <th className="text-left p-3 text-slate-400 dark:text-white/40 font-medium">พนักงาน</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">ฐาน</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">หักสาย</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">นาทีหัก</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">หักขาด</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">SS</th>
                <th className="text-right p-3 text-slate-400 dark:text-white/40 font-medium">สุทธิ</th>
                <th className="text-center p-3 text-slate-400 dark:text-white/40 font-medium">สถิติ</th>
                <th className="text-center p-3 text-slate-400 dark:text-white/40 font-medium">สถานะ</th>
                <th className="text-center p-3 text-slate-400 dark:text-white/40 font-medium">LINE</th>
                <th className="text-center p-3 text-slate-400 dark:text-white/40 font-medium">ส่งสลิป LINE</th>
                <th className="text-center p-3 text-slate-400 dark:text-white/40 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeletonRows rows={6} cols={12} />}
              {!loading &&
                payrolls.map((p) => (
                  <tr key={p.id} className={`table-row-hover ${!p.hasPayroll ? 'opacity-70' : ''}`}>
                    <td className="p-3">
                      <p className="text-slate-900 dark:text-white font-medium">{p.name}</p>
                      <p className="text-slate-400 dark:text-white/40 text-xs">
                        {p.department} · {p.position}
                      </p>
                      {!p.hasPayroll && (
                        <p className="text-[12px] text-amber-400 mt-0.5">ยังไม่คำนวณ — กดปุ่มคำนวณ</p>
                      )}
                    </td>
                    <td className="p-3 text-right text-white/70">
                      {p.hasPayroll ? `฿${p.baseSalary.toLocaleString()}` : '—'}
                    </td>
                    <td className="p-3 text-right">
                      {p.lateDeduction > 0 ? (
                        <button
                          type="button"
                          onClick={() => setDetailRow(p)}
                          className="text-red-400 hover:text-red-300 underline underline-offset-2"
                        >
                          -฿{p.lateDeduction.toFixed(2)}
                        </button>
                      ) : (
                        <span className="text-white/30">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-yellow-400/80 text-xs">
                      {p.hasPayroll && (p.lateBillableMinutes ?? 0) > 0
                        ? `${p.lateBillableMinutes} น.`
                        : '-'}
                    </td>
                    <td className="p-3 text-right text-red-400">
                      {p.absentDeduction > 0 ? `-฿${p.absentDeduction.toFixed(0)}` : '-'}
                    </td>
                    <td className="p-3 text-right text-orange-400">
                      {p.ssDeduction > 0 ? `-฿${p.ssDeduction.toFixed(0)}` : '-'}
                    </td>
                    <td className="p-3 text-right font-bold text-green-400">
                      {p.hasPayroll
                        ? `฿${p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 0 })}`
                        : '—'}
                    </td>
                    <td className="p-3 text-center text-xs text-slate-400 dark:text-white/40">
                      สาย {p.lateDays} วัน · ขาด {p.absentDays} วัน
                    </td>
                    <td className="p-3 text-center">
                      {canApprove && p.hasPayroll && p.status === 'DRAFT' ? (
                        <button
                          type="button"
                          onClick={() => approvePayroll(p)}
                          disabled={approvingId === p.id || approvingBatch}
                          title="คลิกเพื่ออนุมัติ payroll"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition"
                        >
                          {approvingId === p.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          อนุมัติ
                        </button>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            p.status === 'APPROVED'
                              ? 'bg-green-500/20 text-green-400'
                              : p.status === 'SENT'
                                ? 'bg-green-500/20 text-green-400'
                                : p.status === 'PENDING'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-white/10 text-slate-400 dark:text-white/40'
                          }`}
                        >
                          {p.status === 'APPROVED'
                            ? 'อนุมัติ'
                            : p.status === 'SENT'
                              ? 'ส่งแล้ว'
                              : p.status === 'PENDING'
                                ? 'รอคำนวณ'
                                : 'ร่าง'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">{renderLineStatus(p)}</td>
                    <td className="p-3 text-center">{renderPayslipSendStatus(p)}</td>
                    <td className="p-3 text-center">
                      {p.hasPayroll && p.status === 'APPROVED' ? (
                        <button
                          type="button"
                          onClick={() => sendSlipLine(p)}
                          disabled={sendingId === p.id || sendingBatch || !p.lineLinked}
                          title={!p.lineLinked ? 'พนักงานยังไม่ได้เชื่อม LINE OA' : undefined}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50 transition"
                        >
                          {sendingId === p.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <MessageCircle className="w-3 h-3" />
                          )}
                          ส่ง LINE
                        </button>
                      ) : (
                        <span className="text-white/20 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              {!loading && payrolls.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-white/30">
                    ยังไม่มีข้อมูล กด &quot;คำนวณ&quot; เพื่อสร้าง payroll
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailRow && detailRow.hasPayroll && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
          <div ref={detailPanelRef} role="dialog" aria-modal aria-label={`รายละเอียดหักมาสาย: ${detailRow.name}`} tabIndex={-1} className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-200 dark:border-white/10 p-5 shadow-2xl max-h-[85dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-white font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  รายละเอียดหักมาสาย
                </p>
                <p className="text-sm text-slate-500 dark:text-white/50 mt-0.5">{detailRow.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                aria-label="ปิด"
                className="p-2 rounded-lg hover:bg-white/10 text-slate-500 dark:text-white/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <LateDeductionDetail
              baseSalary={detailRow.baseSalary}
              lateDeduction={detailRow.lateDeduction}
              lateBillableMinutes={detailRow.lateBillableMinutes ?? detailRow.lateMinutes}
              lateDays={detailRow.lateDays}
              lateDeductionDetail={detailRow.lateDeductionDetail}
            />
          </div>
        </div>
      )}
    </div>
  )
}
