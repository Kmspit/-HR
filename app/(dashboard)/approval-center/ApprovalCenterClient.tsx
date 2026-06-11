'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'

const SignaturePad = dynamic(() => import('@/components/approval/SignaturePad'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

type ApprovalStep = {
  id: string
  stepOrder: number
  stepName: string
  approverRole: string | null
  approverId: string | null
  approver: { id: string; name: string } | null
  status: string
  actor: { id: string; name: string } | null
  comment: string | null
  actedAt: string | null
}

type ApprovalRequest = {
  id: string
  docType: string
  docId: string
  docRef: string | null
  title: string
  requestedBy: { id: string; name: string; role: string }
  amount: number | null
  currentStep: number
  totalSteps: number
  status: string
  priority: string
  note: string | null
  steps: ApprovalStep[]
  createdAt: string
  updatedAt: string
}

type ActivityEntry = {
  id: string
  actorName: string
  action: string
  detail: string | null
  createdAt: string
}

type DigitalSig = {
  id: string
  signerName: string
  signerRole: string
  signerPosition: string | null
  signatureType: string
  typedName: string | null
  signatureUrl: string | null
  signedAt: string
}

type SummaryData = {
  totalPending: number
  urgentCount: number
  highValueCount: number
  rejectedToday: number
  recentPending: ApprovalRequest[]
  byType: { docType: string; count: number }[]
  recentActivity: ActivityEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  INVOICE:  'ใบแจ้งหนี้',
  EXPENSE:  'ใบเบิก',
  CONTRACT: 'สัญญา',
  TASK:     'งาน',
  LEAVE:    'ใบลา',
  OUTSIDE:  'ออกนอกสถานที่',
  OTHER:    'อื่นๆ',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:              'รออนุมัติ',
  IN_REVIEW:            'อยู่ระหว่างพิจารณา',
  SUPERVISOR_APPROVED:  'หัวหน้าอนุมัติ',
  MANAGER_APPROVED:     'ผู้จัดการอนุมัติ',
  CEO_APPROVED:         'อนุมัติแล้ว',
  APPROVED:             'อนุมัติแล้ว',
  REJECTED:             'ปฏิเสธ',
  REVISION_REQUIRED:    'ต้องแก้ไข',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:              'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
  IN_REVIEW:            'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  SUPERVISOR_APPROVED:  'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  MANAGER_APPROVED:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  CEO_APPROVED:         'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  APPROVED:             'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  REJECTED:             'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  REVISION_REQUIRED:    'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
}

const PRIORITY_COLORS: Record<string, string> = {
  NORMAL: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  HIGH:   'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300',
  URGENT: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300',
}

const ACTION_ICONS: Record<string, string> = {
  CREATED:  '📝',
  UPDATED:  '✏️',
  APPROVED: '✅',
  REJECTED: '❌',
  REVISE:   '⚠️',
  SIGNED:   '✍️',
  DELETED:  '🗑️',
  VIEWED:   '👁️',
  DOWNLOADED: '⬇️',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtAmt(n: number | null) {
  if (n === null) return ''
  return n.toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm mt-1 opacity-80">{label}</div>
    </div>
  )
}

function StepBadge({ step }: { step: ApprovalStep }) {
  const colors: Record<string, string> = {
    PENDING:            'bg-yellow-100 text-yellow-700 border-yellow-200',
    WAITING:            'bg-gray-100 text-gray-500 border-gray-200',
    APPROVED:           'bg-green-100 text-green-700 border-green-200',
    REJECTED:           'bg-red-100 text-red-700 border-red-200',
    REVISION_REQUIRED:  'bg-orange-100 text-orange-700 border-orange-200',
    SKIPPED:            'bg-gray-100 text-gray-400 border-gray-200',
  }
  const icons: Record<string, string> = {
    PENDING:  '⏳',
    WAITING:  '⋯',
    APPROVED: '✓',
    REJECTED: '✗',
    REVISION_REQUIRED: '!',
    SKIPPED:  '−',
  }
  const cls = colors[step.status] ?? colors.WAITING
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      <span>{icons[step.status] ?? '?'}</span>
      <span>{step.stepName}</span>
    </div>
  )
}

function ApprovalTimeline({ request, activity, signatures }: {
  request: ApprovalRequest
  activity: ActivityEntry[]
  signatures: DigitalSig[]
}) {
  return (
    <div className="space-y-3">
      {/* Steps */}
      <div className="flex gap-2 flex-wrap mb-4">
        {request.steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <StepBadge step={s} />
            {i < request.steps.length - 1 && (
              <span className="text-gray-300 dark:text-gray-600">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Timeline events */}
      <div className="relative pl-4">
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="space-y-4">
          {/* Request created */}
          <TimelineEvent
            icon="📝"
            label={`สร้างคำขอ โดย ${request.requestedBy.name}`}
            date={request.createdAt}
          />

          {/* Step actions */}
          {request.steps
            .filter((s) => s.actedAt)
            .map((s) => (
              <TimelineEvent
                key={s.id}
                icon={s.status === 'APPROVED' ? '✅' : s.status === 'REJECTED' ? '❌' : '⚠️'}
                label={`${s.stepName}: ${s.status === 'APPROVED' ? 'อนุมัติ' : s.status === 'REJECTED' ? 'ปฏิเสธ' : 'ต้องแก้ไข'} โดย ${s.actor?.name ?? '—'}${s.comment ? ` — "${s.comment}"` : ''}`}
                date={s.actedAt!}
              />
            ))}

          {/* Signatures */}
          {signatures.map((sig) => (
            <TimelineEvent
              key={sig.id}
              icon="✍️"
              label={`ลงนามโดย ${sig.signerName} (${sig.signatureType})`}
              date={sig.signedAt}
            />
          ))}

          {/* Activity */}
          {activity
            .filter((a) => !['CREATED'].includes(a.action))
            .slice(0, 8)
            .map((a) => (
              <TimelineEvent
                key={a.id}
                icon={ACTION_ICONS[a.action] ?? '•'}
                label={a.detail ?? `${a.action} โดย ${a.actorName}`}
                date={a.createdAt}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

function TimelineEvent({ icon, label, date }: { icon: string; label: string; date: string }) {
  return (
    <div className="flex gap-3 relative">
      <div className="absolute -left-4 w-2 h-2 rounded-full bg-indigo-400 dark:bg-indigo-500 mt-1.5 -translate-x-px" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="mr-1">{icon}</span>{label}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{fmtDate(date)}</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ApprovalCenterClient({
  userId,
  userRole,
  userName,
}: {
  userId: string
  userRole: string
  userName: string
}) {
  const [tab, setTab] = useState<'pending' | 'all' | 'activity' | 'signatures'>('pending')
  const [summary, setSummary]       = useState<SummaryData | null>(null)
  const [requests, setRequests]     = useState<ApprovalRequest[]>([])
  const [allRequests, setAllReqs]   = useState<ApprovalRequest[]>([])
  const [activity, setActivity]     = useState<ActivityEntry[]>([])
  const [selected, setSelected]     = useState<(ApprovalRequest & { activity: ActivityEntry[]; signatures: DigitalSig[] }) | null>(null)
  const [loading, setLoading]       = useState(true)
  const [actionLoading, setActL]    = useState(false)
  const [showActModal, setActModal] = useState(false)
  const [actAction, setActAction]   = useState<'APPROVE' | 'REJECT' | 'REVISE'>('APPROVE')
  const [actComment, setActComment] = useState('')
  const [showSigPad, setSigPad]     = useState(false)
  const [sigDocType, setSigDocType] = useState('')
  const [sigDocId, setSigDocId]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter]     = useState('')
  const [searchQ, setSearchQ]           = useState('')

  const isSenior = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN'].includes(userRole)

  const loadSummary = useCallback(async () => {
    const r = await fetch('/api/approval-center/summary')
    if (r.ok) setSummary(await r.json())
  }, [])

  const loadPending = useCallback(async () => {
    const r = await fetch('/api/approval-requests?pending=true')
    if (r.ok) {
      const data = await r.json()
      setRequests(data.items ?? [])
    }
  }, [])

  const loadAll = useCallback(async () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (typeFilter)   params.set('docType', typeFilter)
    const r = await fetch(`/api/approval-requests?${params}`)
    if (r.ok) {
      const data = await r.json()
      setAllReqs(data.items ?? [])
    }
  }, [statusFilter, typeFilter])

  const loadActivity = useCallback(async () => {
    const r = await fetch('/api/activity-log?page=1')
    if (r.ok) {
      const data = await r.json()
      setActivity(data.items ?? [])
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadSummary(), loadPending()]).finally(() => setLoading(false))
  }, [loadSummary, loadPending])

  useEffect(() => {
    if (tab === 'all') loadAll()
    if (tab === 'activity') loadActivity()
  }, [tab, loadAll, loadActivity])

  async function loadDetail(req: ApprovalRequest) {
    const r = await fetch(`/api/approval-requests/${req.id}`)
    if (r.ok) {
      const data = await r.json()
      setSelected(data)
    } else {
      setSelected({ ...req, activity: [], signatures: [] })
    }
  }

  async function doAction() {
    if (!selected) return
    setActL(true)
    const r = await fetch(`/api/approval-requests/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: actAction, comment: actComment }),
    })
    setActL(false)
    setActModal(false)
    setActComment('')
    if (r.ok) {
      await loadSummary()
      await loadPending()
      if (tab === 'all') await loadAll()
      await loadDetail(selected)
    }
  }

  async function handleSignatureSave(data: { type: string; data?: string; typedName?: string }) {
    if (!sigDocType || !sigDocId) return
    await fetch('/api/digital-signatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docType:       sigDocType,
        docId:         sigDocId,
        signatureType: data.type,
        signatureData: data.data,
        typedName:     data.typedName,
      }),
    })
    setSigPad(false)
    if (selected) await loadDetail(selected)
  }

  const displayedRequests = (tab === 'pending' ? requests : allRequests).filter((r) => {
    if (!searchQ) return true
    const q = searchQ.toLowerCase()
    return r.title.toLowerCase().includes(q) ||
      r.requestedBy.name.toLowerCase().includes(q) ||
      (r.docRef ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-full lg:w-[420px] flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">

        {/* KPI summary strip */}
        {summary && (
          <div className="grid grid-cols-4 gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
            <KpiCard label="รออนุมัติ"   value={summary.totalPending}  color="bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300" />
            <KpiCard label="เร่งด่วน"    value={summary.urgentCount}   color="bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300" />
            <KpiCard label="มูลค่าสูง"   value={summary.highValueCount} color="bg-orange-50 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300" />
            <KpiCard label="ปฏิเสธวันนี้" value={summary.rejectedToday} color="bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 text-sm">
          {([['pending', 'รอดำเนินการ'], ['all', 'ทั้งหมด'], ['activity', 'กิจกรรม']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2.5 font-medium transition-colors ${
                tab === key
                  ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {label}
              {key === 'pending' && (requests.length > 0) && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">
                  {requests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + filters */}
        {tab !== 'activity' && (
          <div className="p-2 flex gap-1 border-b border-gray-100 dark:border-gray-800">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="ค้นหา..."
              className="flex-1 px-2 py-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            {tab === 'all' && (
              <>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs px-1 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                >
                  <option value="">สถานะทั้งหมด</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-xs px-1 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                >
                  <option value="">ประเภทหมด</option>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </>
            )}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'activity' ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {activity.map((a) => (
                <div key={a.id} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-base">{ACTION_ICONS[a.action] ?? '•'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {a.detail ?? a.action}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {a.actorName} · {fmtDate(a.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {activity.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-400">ยังไม่มีกิจกรรม</div>
              )}
            </div>
          ) : loading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด…</div>
          ) : displayedRequests.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              {tab === 'pending' ? 'ไม่มีรายการรออนุมัติ' : 'ไม่พบรายการ'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {displayedRequests.map((req) => (
                <button
                  key={req.id}
                  onClick={() => loadDetail(req)}
                  className={`w-full text-left px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${
                    selected?.id === req.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {DOC_TYPE_LABELS[req.docType] ?? req.docType}
                        </span>
                        {req.priority !== 'NORMAL' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${PRIORITY_COLORS[req.priority]}`}>
                            {req.priority === 'URGENT' ? 'เร่งด่วน' : 'สำคัญ'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1 truncate">
                        {req.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {req.requestedBy.name}
                        {req.amount ? ` · ${fmtAmt(req.amount)}` : ''}
                        {req.docRef ? ` · ${req.docRef}` : ''}
                      </p>
                      {/* Step progress */}
                      <div className="flex items-center gap-1 mt-1.5">
                        {req.steps.map((s) => (
                          <div
                            key={s.id}
                            className={`h-1.5 flex-1 rounded-full ${
                              s.status === 'APPROVED'  ? 'bg-green-400' :
                              s.status === 'REJECTED'  ? 'bg-red-400' :
                              s.status === 'PENDING'   ? 'bg-yellow-400' :
                              'bg-gray-200 dark:bg-gray-700'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[req.status] ?? ''}`}>
                        {STATUS_LABELS[req.status] ?? req.status}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{fmtDate(req.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel — Detail ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600 text-sm">
            เลือกรายการเพื่อดูรายละเอียด
          </div>
        ) : (
          <div className="p-4 lg:p-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                    {DOC_TYPE_LABELS[selected.docType] ?? selected.docType}
                  </span>
                  {selected.docRef && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{selected.docRef}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selected.status] ?? ''}`}>
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </span>
                  {selected.priority !== 'NORMAL' && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[selected.priority]}`}>
                      {selected.priority === 'URGENT' ? '🚨 เร่งด่วน' : '⚡ สำคัญ'}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-1">
                  {selected.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  ผู้ขออนุมัติ: {selected.requestedBy.name}
                  {selected.amount ? ` · มูลค่า: ${fmtAmt(selected.amount)}` : ''}
                </p>
                {selected.note && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">{selected.note}</p>
                )}
              </div>

              {/* Action buttons */}
              {!['CEO_APPROVED', 'APPROVED', 'REJECTED'].includes(selected.status) && (
                <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => { setActAction('APPROVE'); setActModal(true) }}
                    className="px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    อนุมัติ
                  </button>
                  <button
                    onClick={() => { setActAction('REVISE'); setActModal(true) }}
                    className="px-3 py-1.5 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => { setActAction('REJECT'); setActModal(true) }}
                    className="px-3 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    ปฏิเสธ
                  </button>
                </div>
              )}
            </div>

            {/* Sign button */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  setSigDocType(selected.docType)
                  setSigDocId(selected.docId)
                  setSigPad(true)
                }}
                className="text-sm px-3 py-1.5 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
              >
                ✍️ ลงนามดิจิทัล
              </button>
            </div>

            {/* Two-column: info + timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: meta info */}
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    ข้อมูลคำขอ
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">สร้างเมื่อ</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{fmtDate(selected.createdAt)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">อัปเดต</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{fmtDate(selected.updatedAt)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">ขั้นตอนทั้งหมด</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{selected.currentStep} / {selected.totalSteps}</dd>
                    </div>
                  </dl>
                </div>

                {/* Steps detail */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    ขั้นตอนอนุมัติ
                  </h3>
                  <div className="space-y-3">
                    {selected.steps.map((s) => (
                      <div key={s.id} className="flex items-start gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                          s.status === 'APPROVED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          s.status === 'REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          s.status === 'PENDING'  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                        }`}>
                          {s.stepOrder}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.stepName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {s.approverRole ?? (s.approver?.name ?? 'ไม่ระบุ')}
                            {s.actor ? ` · ${s.actor.name}` : ''}
                          </p>
                          {s.comment && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 italic">"{s.comment}"</p>
                          )}
                          {s.actedAt && (
                            <p className="text-xs text-gray-400">{fmtDate(s.actedAt)}</p>
                          )}
                        </div>
                        <StepBadge step={s} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Signatures */}
                {selected.signatures.length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      ลายเซ็นดิจิทัล
                    </h3>
                    <div className="space-y-2">
                      {selected.signatures.map((sig) => (
                        <div key={sig.id} className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-sm flex-shrink-0">
                            ✍️
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {sig.signerName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {sig.signerPosition ?? sig.signerRole} · {sig.signatureType}
                            </p>
                            {sig.typedName && (
                              <p className="text-xs font-mono text-indigo-700 dark:text-indigo-300 mt-0.5 italic">
                                {sig.typedName}
                              </p>
                            )}
                            {sig.signatureUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={sig.signatureUrl} alt="signature" className="h-10 mt-1 rounded border border-gray-200" />
                            )}
                            <p className="text-xs text-gray-400">{fmtDate(sig.signedAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: timeline */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                  ไทม์ไลน์
                </h3>
                <ApprovalTimeline
                  request={selected}
                  activity={selected.activity}
                  signatures={selected.signatures}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Action Modal ── */}
      {showActModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {actAction === 'APPROVE' ? '✅ อนุมัติคำขอ' :
               actAction === 'REJECT'  ? '❌ ปฏิเสธคำขอ' :
               '⚠️ ขอให้แก้ไข'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{selected?.title}</p>
            <textarea
              value={actComment}
              onChange={(e) => setActComment(e.target.value)}
              placeholder={actAction === 'APPROVE' ? 'หมายเหตุ (ถ้ามี)' : 'เหตุผล (จำเป็น)'}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => { setActModal(false); setActComment('') }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                ยกเลิก
              </button>
              <button
                onClick={doAction}
                disabled={actionLoading || (actAction !== 'APPROVE' && !actComment.trim())}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${
                  actAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' :
                  actAction === 'REJECT'  ? 'bg-red-600 hover:bg-red-700' :
                  'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                {actionLoading ? 'กำลังดำเนินการ…' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Signature Pad Modal ── */}
      {showSigPad && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">✍️ ลงนามดิจิทัล</h3>
              <button
                onClick={() => setSigPad(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {userName} · {DOC_TYPE_LABELS[sigDocType] ?? sigDocType}
            </p>
            <SignaturePad
              onSave={handleSignatureSave}
              onCancel={() => setSigPad(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
