'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2, CheckCircle, XCircle, Inbox, CheckCheck, Ban, Send,
  Settings2, Filter, Search, Eye,
} from 'lucide-react'
import { formatThaiDate } from '@/lib/utils'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import type {
  ApprovalCenterPayload,
  ApprovalFilters,
  ApprovalTab,
  ApprovalType,
  UnifiedApprovalItem,
} from '@/lib/approval-center/types'
import {
  STATUS_COLORS, STATUS_LABELS, TAB_LABELS, TYPE_COLORS, TYPE_ICONS, TYPE_LABELS,
} from '@/lib/approval-center/constants'
import { useSuccessAnimation } from '@/components/motion'
import ApprovalDetailDrawer from './ApprovalDetailDrawer'

type Props = ApprovalCenterPayload

const TABS: { id: ApprovalTab; icon: typeof Inbox }[] = [
  { id: 'pending', icon: Inbox },
  { id: 'approved', icon: CheckCheck },
  { id: 'rejected', icon: Ban },
  { id: 'mine', icon: Send },
]

const TYPE_OPTIONS: { value: ApprovalType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'ทุกประเภท' },
  { value: 'LEAVE', label: TYPE_LABELS.LEAVE },
  { value: 'OUTSIDE', label: TYPE_LABELS.OUTSIDE },
  { value: 'WEEKLY_PLAN', label: TYPE_LABELS.WEEKLY_PLAN },
  { value: 'FORGOT_SCAN', label: TYPE_LABELS.FORGOT_SCAN },
]

function applyFilters(items: UnifiedApprovalItem[], filters: ApprovalFilters): UnifiedApprovalItem[] {
  return items.filter((item) => {
    if (filters.type !== 'ALL' && item.type !== filters.type) return false
    if (filters.department && filters.department !== 'ALL') {
      if ((item.department ?? '') !== filters.department) return false
    }
    if (filters.status && filters.status !== 'ALL' && item.status !== filters.status) return false
    if (filters.dateFrom) {
      const from = new Date(`${filters.dateFrom}T00:00:00`)
      if (new Date(item.submittedAt) < from) return false
    }
    if (filters.dateTo) {
      const to = new Date(`${filters.dateTo}T23:59:59`)
      if (new Date(item.submittedAt) > to) return false
    }
    return true
  })
}

function RejectForm({
  reason, setReason, busy, onConfirm, onCancel,
}: {
  reason: string
  setReason: (v: string) => void
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-3 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5 p-3 space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="ระบุเหตุผลการปฏิเสธ..."
        rows={2}
        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-[13px] outline-none focus:border-red-400 resize-none"
      />
      <div className="flex gap-2">
        <button type="button" onClick={onConfirm} disabled={busy || !reason.trim()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-[13px] font-semibold text-white disabled:opacity-50 btn-press">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} ยืนยันปฏิเสธ
        </button>
        <button type="button" onClick={onCancel} className="px-3 rounded-lg border border-slate-200 dark:border-white/10 text-[13px] btn-press">ยกเลิก</button>
      </div>
    </div>
  )
}

function ApprovalCard({
  item,
  tab,
  loading,
  rejectingId,
  reason,
  setRejectingId,
  setReason,
  onApprove,
  onReject,
  onView,
}: {
  item: UnifiedApprovalItem
  tab: ApprovalTab
  loading: string | null
  rejectingId: string | null
  reason: string
  setRejectingId: (id: string | null) => void
  setReason: (v: string) => void
  onApprove: (item: UnifiedApprovalItem) => void
  onReject: (item: UnifiedApprovalItem) => void
  onView: (item: UnifiedApprovalItem) => void
}) {
  const busy = loading === `${item.type}:${item.id}`
  const isRejecting = rejectingId === `${item.type}:${item.id}`
  const showActions = tab === 'pending' && item.canAct

  return (
    <article className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900/80 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ${TYPE_COLORS[item.type]}`}>
              {TYPE_ICONS[item.type]} {TYPE_LABELS[item.type]}
            </span>
            <span className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-bold ${STATUS_COLORS[item.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {item.statusLabel}
            </span>
          </div>
          {item.currentStep && (
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-lg">
              {item.currentStep}
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="min-w-0 space-y-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">พนักงาน</p>
              <p className="text-[16px] font-bold text-slate-900 dark:text-white truncate">{item.employeeName}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
              <div>
                <span className="text-slate-500">ประเภท: </span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">{item.requestTypeLabel}</span>
              </div>
              <div>
                <span className="text-slate-500">แผนก: </span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">{item.department || '—'}</span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-slate-500">ส่งเมื่อ: </span>
                <span className="text-slate-800 dark:text-slate-200">{formatThaiDate(item.submittedAt)}</span>
              </div>
            </div>
            <p className="text-[13px] text-slate-500 truncate">{item.summary}</p>
          </div>

          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            {showActions && !isRejecting && (
              <>
                <button type="button" disabled={!!loading && !busy} onClick={() => onApprove(item)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 btn-press min-w-[100px]">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} อนุมัติ
                </button>
                <button type="button" disabled={!!loading} onClick={() => onReject(item)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-4 py-2.5 text-[13px] font-semibold btn-press min-w-[100px]">
                  <XCircle className="h-4 w-4" /> ปฏิเสธ
                </button>
              </>
            )}
            <button type="button" onClick={() => onView(item)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 btn-press">
              <Eye className="h-4 w-4" /> ดูรายละเอียด
            </button>
          </div>
        </div>

        {isRejecting && (
          <RejectForm
            reason={reason}
            setReason={setReason}
            busy={busy}
            onConfirm={() => onReject(item)}
            onCancel={() => { setRejectingId(null); setReason('') }}
          />
        )}
      </div>
    </article>
  )
}

export default function ApprovalCenterClient(props: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as ApprovalTab) || 'pending'

  const [tab, setTab] = useState<ApprovalTab>(initialTab)
  const [filters, setFilters] = useState<ApprovalFilters>({
    type: 'ALL',
    department: 'ALL',
    status: 'ALL',
    dateFrom: '',
    dateTo: '',
  })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [detailItem, setDetailItem] = useState<UnifiedApprovalItem | null>(null)
  const triggerSuccess = useSuccessAnimation()

  const { pending, approved, rejected, myRequests, departments, counts, canManageChains } = props

  const tabItems = useMemo(() => {
    const map: Record<ApprovalTab, UnifiedApprovalItem[]> = {
      pending,
      approved,
      rejected,
      mine: myRequests,
    }
    let items = map[tab]
    items = applyFilters(items, filters)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(
        (i) =>
          i.employeeName.toLowerCase().includes(q) ||
          i.requestTypeLabel.toLowerCase().includes(q) ||
          (i.department ?? '').toLowerCase().includes(q) ||
          i.summary.toLowerCase().includes(q),
      )
    }
    return items
  }, [tab, pending, approved, rejected, myRequests, filters, search])

  const tabCounts: Record<ApprovalTab, number> = {
    pending: counts.pending,
    approved: counts.approved,
    rejected: counts.rejected,
    mine: counts.mine,
  }

  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const i of tabItems) set.add(i.status)
    return ['ALL', ...Array.from(set)]
  }, [tabItems])

  const itemKey = (item: UnifiedApprovalItem) => `${item.type}:${item.id}`

  const handleAction = async (item: UnifiedApprovalItem, action: 'APPROVE' | 'REJECT') => {
    const key = itemKey(item)
    if (action === 'REJECT' && rejectingId !== key) {
      setRejectingId(key)
      return
    }
    setLoading(key)
    try {
      const { ok, data, status } = await apiJson('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: item.type,
          requestId: item.id,
          action,
          reason: action === 'REJECT' ? reason : undefined,
        }),
      })
      if (!ok) {
        toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
        return
      }
      toast.success(action === 'APPROVE' ? 'อนุมัติเรียบร้อย' : 'ปฏิเสธเรียบร้อย')
      if (action === 'APPROVE') triggerSuccess('approval')
      setRejectingId(null)
      setReason('')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.slice(1)
            .filter((t) => counts.byType[t.value as ApprovalType] > 0)
            .map((t) => (
              <span key={t.value} className="text-[12px] rounded-lg bg-slate-100 dark:bg-white/[0.06] px-2.5 py-1 text-slate-600 dark:text-slate-300">
                {TYPE_ICONS[t.value as ApprovalType]} {counts.byType[t.value as ApprovalType]} {t.label}
              </span>
            ))}
        </div>
        {canManageChains && (
          <Link href="/settings/approval-chains"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5">
            <Settings2 size={16} /> ตั้งค่าสายอนุมัติ
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-900/80 p-1 border border-slate-200 dark:border-white/5 overflow-x-auto">
        {TABS.map(({ id, icon: Icon }) => (
          <button key={id} type="button"
            onClick={() => { setTab(id); setRejectingId(null); setReason('') }}
            className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-[13px] font-semibold whitespace-nowrap transition-colors ${tab === id ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
            <Icon size={16} /> {TAB_LABELS[id]}
            {tabCounts[id] > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${tab === id ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {tabCounts[id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
          <Filter size={15} /> ตัวกรอง
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as ApprovalType | 'ALL' }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500">
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500">
            <option value="ALL">ทุกแผนก</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500">
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s === 'ALL' ? 'ทุกสถานะ' : STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500"
            placeholder="จากวันที่" />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500"
            placeholder="ถึงวันที่" />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อพนักงาน แผนก หรือรายละเอียด..."
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-[13px] outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {tabItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 py-16 text-center">
            <Inbox className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">ไม่มีรายการ</p>
            <p className="text-[13px] text-slate-500 mt-1">ลองเปลี่ยนแท็บหรือตัวกรอง</p>
          </div>
        ) : (
          tabItems.map((item) => (
            <ApprovalCard
              key={itemKey(item)}
              item={item}
              tab={tab}
              loading={loading}
              rejectingId={rejectingId}
              reason={reason}
              setRejectingId={setRejectingId}
              setReason={setReason}
              onApprove={(i) => handleAction(i, 'APPROVE')}
              onReject={(i) => handleAction(i, 'REJECT')}
              onView={setDetailItem}
            />
          ))
        )}
      </div>

      <ApprovalDetailDrawer item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  )
}
