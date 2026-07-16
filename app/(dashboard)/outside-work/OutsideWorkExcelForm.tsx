'use client'

import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Send, CheckCircle2, XCircle, Pencil, Printer, Trash2, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { canUserActOnStep, type ApprovalStepRow } from '@/lib/approval-chain-shared'
import { useModalA11y } from '@/hooks/useModalA11y'
import type { Role } from '@prisma/client'
import dynamic from 'next/dynamic'
import OutsideWorkStatusBadge from './OutsideWorkStatusBadge'
import { PRODUCT_CATEGORY_KEYS, OTHER_PRODUCT_CATEGORY, productTypesFor } from '@/lib/constants/product-types'
import { OUTSIDE_WORK_PLAN_TITLE_DEFAULT } from '@/lib/company-defaults'
import { SETTINGS_EDIT_ROLES } from '@/lib/access-control'

// Fallback text — matches what was previously hardcoded here before Settings made it editable
const COMPANY_NAME_FALLBACK = 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด'

const OutsideWorkApprovalHistory = dynamic(() => import('./OutsideWorkApprovalHistory'), {
  loading: () => <div className="h-24 animate-pulse rounded-lg bg-white border border-gray-200" />,
})

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
  productCategory?: string | null
  productType?: string | null
  workBranch?: string | null
  caseCount?: number | null
  adminChecked?: string | null
  supervisedBy?: string | null
  note?: string | null
  status: string
  approvalStatus?: string | null
  chainConfigId?: string | null
  currentStepOrder?: number
  steps?: ApprovalStepRow[]
  documentNumber?: string | null
  clientCompanyId?: string | null
  clientCompanyName?: string | null
  assignees?: { id: string; name: string }[]
  createdAt: string
}

type SlotData = {
  id?: string
  userId?: string
  place: string
  purpose: string
  caseNumber: string
  productWork: string
  productCategory: string
  productType: string
  workBranch: string
  caseCount: string
  adminChecked: string
  supervisedBy: string
  note: string
  clientCompanyId: string
  assigneeIds: string[]
  approvalStatus?: string | null
  status?: string
  documentNumber?: string | null
  dirty?: boolean
}

type ClientCompanyOption = { id: string; companyName: string }

type WeekData = Record<string, SlotData>

export type Props = {
  userId: string
  userName: string
  currentUserRole: import('@prisma/client').Role
  canViewAll: boolean
  canApproveOutside: boolean
  requests: OWRequest[]
  companyName?: string | null
  outsideWorkPlanTitle?: string | null
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
  return { place:'', purpose:'', caseNumber:'', productWork:'', productCategory:'', productType:'', workBranch:'', caseCount:'', adminChecked:'', supervisedBy:'', note:'', clientCompanyId:'', assigneeIds:[] }
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
      productCategory: r.productCategory ?? '',
      productType:     r.productType     ?? '',
      workBranch:   r.workBranch     ?? '',
      caseCount:    r.caseCount != null ? String(r.caseCount) : '',
      adminChecked: r.adminChecked   ?? '',
      supervisedBy: r.supervisedBy   ?? '',
      note:         r.note           ?? '',
      clientCompanyId: r.clientCompanyId ?? '',
      assigneeIds:  r.assignees?.map(a => a.id) ?? [],
      approvalStatus: r.approvalStatus,
      status:         r.status,
      documentNumber: r.documentNumber,
    }
  })
  return data
}

// ── Status helpers ────────────────────────────────────────────────────────────

function isPendingSlot(slot: SlotData) {
  if (slot.status === 'APPROVED' || slot.status === 'REJECTED') return false
  return slot.approvalStatus === 'pending_chain' || slot.status === 'PENDING'
}

function canUserApproveRequest(
  req: Pick<OWRequest, 'chainConfigId' | 'currentStepOrder' | 'steps' | 'approvalStatus' | 'status'>,
  userId: string,
  userRole: Role,
): boolean {
  if (req.status === 'APPROVED' || req.status === 'REJECTED') return false
  if (req.chainConfigId && req.steps?.length) {
    const current = req.steps.find(
      (s) => s.stepOrder === (req.currentStepOrder ?? 0) && s.status === 'PENDING',
    )
    if (!current) return false
    return canUserActOnStep(
      { approverRole: current.approverRole, approverId: current.approverId },
      userId,
      userRole,
    )
  }
  return false
}

// ── Product work cell (cascading category → type popover) ─────────────────────

function ProductWorkCell({
  category, type, legacy, readOnly, onChange,
}: {
  category: string
  type: string
  legacy: string
  readOnly: boolean
  onChange: (category: string, type: string) => void
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useModalA11y(open)
  const [draftCategory, setDraftCategory] = useState(category)
  const [draftType, setDraftType] = useState(type)

  const openPopover = () => {
    if (readOnly) return
    setDraftCategory(category)
    setDraftType(type)
    setOpen(true)
  }

  const confirm = () => {
    onChange(draftCategory, draftType)
    setOpen(false)
  }

  const summary = category
    ? `${category}${type ? ' > ' + type : ''}`
    : legacy

  const isOther    = draftCategory === OTHER_PRODUCT_CATEGORY
  const draftTypes = productTypesFor(draftCategory)

  return (
    <>
      <button
        type="button"
        onClick={openPopover}
        disabled={readOnly}
        title={summary || '—'}
        className={`w-full min-h-[32px] text-left text-xs px-1 py-0.5 rounded truncate ${
          readOnly ? 'cursor-default text-gray-500' : 'hover:bg-blue-50 cursor-pointer text-gray-900'
        }`}
      >
        {summary || <span className="text-gray-400">—</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal
            aria-label="เลือกงานโปรดักส์"
            tabIndex={-1}
            className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-900 mb-3">เลือกงานโปรดักส์</h3>

            <label htmlFor="field-1" className="block text-xs font-medium text-gray-700 mb-1">หมวดหมู่หลัก</label>
            <select id="field-1"
              value={draftCategory}
              onChange={(e) => { setDraftCategory(e.target.value); setDraftType('') }}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mb-3 text-gray-900"
            >
              <option value="">— เลือกหมวดหมู่ —</option>
              {PRODUCT_CATEGORY_KEYS.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <label htmlFor="product-subtype-field" className="block text-xs font-medium text-gray-700 mb-1">ประเภทย่อย</label>
            {isOther ? (
              <input
                id="product-subtype-field"
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                placeholder="ระบุประเภท..."
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mb-4 text-gray-900"
              />
            ) : (
              <select
                id="product-subtype-field"
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                disabled={!draftCategory}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mb-4 text-gray-900 disabled:bg-gray-100"
              >
                <option value="">— เลือกประเภทย่อย —</option>
                {draftTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirm}
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Assignee picker (multi-select popover — พนักงานที่รับผิดชอบ) ──────────────

function AssigneeCell({
  value, options, readOnly, onChange,
}: {
  value: string[]
  options: { id: string; name: string }[]
  readOnly: boolean
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useModalA11y(open)
  const [draft, setDraft] = useState<string[]>(value)

  const openPopover = () => {
    if (readOnly) return
    setDraft(value)
    setOpen(true)
  }

  const toggle = (id: string) => {
    setDraft(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const confirm = () => {
    onChange(draft)
    setOpen(false)
  }

  const names = value
    .map(id => options.find(o => o.id === id)?.name)
    .filter((n): n is string => Boolean(n))
  const summary = names.length === 0
    ? ''
    : names.length === 1
      ? names[0]
      : `${names[0]} และอีก ${names.length - 1} คน`

  return (
    <>
      <button
        type="button"
        onClick={openPopover}
        disabled={readOnly}
        title={names.join(', ') || 'ยังไม่ได้ระบุผู้รับผิดชอบ'}
        className={`w-full min-h-[20px] text-left text-[11px] px-1 py-0.5 rounded truncate ${
          readOnly ? 'cursor-default text-gray-400' : 'hover:bg-blue-50 cursor-pointer text-gray-600'
        }`}
      >
        {summary || <span className="text-gray-400">+ ผู้รับผิดชอบ</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal
            aria-label="เลือกพนักงานที่รับผิดชอบ"
            tabIndex={-1}
            className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-900 mb-3">เลือกพนักงานที่รับผิดชอบ</h3>

            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100 mb-4">
              {options.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">ไม่มีรายชื่อพนักงาน</div>
              )}
              {options.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-900 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={draft.includes(opt.id)}
                    onChange={() => toggle(opt.id)}
                    className="accent-green-600"
                  />
                  {opt.name}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirm}
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Inline-editable header text (company name / plan title) ───────────────────

function InlineEditableText({
  value, canEdit, onSave, className, tag: Tag = 'p',
}: {
  value: string
  canEdit: boolean
  onSave: (next: string) => Promise<boolean>
  className?: string
  tag?: 'p' | 'h1'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const cancelledRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  const startEdit = () => {
    if (!canEdit || saving) return
    setDraft(value)
    cancelledRef.current = false
    setEditing(true)
  }

  const cancel = () => {
    cancelledRef.current = true
    setDraft(value)
    setEditing(false)
  }

  const commit = async () => {
    if (cancelledRef.current) { cancelledRef.current = false; return }
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      setEditing(false)
      setDraft(value)
      return
    }
    setSaving(true)
    const ok = await onSave(trimmed)
    setSaving(false)
    if (!ok) setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        onFocus={(e) => e.target.select()}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        className={`${className ?? ''} w-full bg-white border border-green-500 rounded px-1 -mx-1 outline-none ${saving ? 'opacity-50' : ''}`}
      />
    )
  }

  return (
    <Tag
      onClick={startEdit}
      title={canEdit ? 'คลิกเพื่อแก้ไข' : undefined}
      className={`${className ?? ''} ${canEdit ? 'group inline-flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 hover:bg-black/5 transition' : ''}`}
    >
      {value}
      {canEdit && <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition shrink-0 print:hidden" />}
    </Tag>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OutsideWorkExcelForm({
  userId, userName, currentUserRole, canViewAll, canApproveOutside, requests: initReqs,
  companyName, outsideWorkPlanTitle,
}: Props) {
  const router = useRouter()
  const [reqs, setReqs]           = useState<OWRequest[]>(initReqs)
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [viewUserId, setViewUserId] = useState(userId)
  const [saving, setSaving]       = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [todayYmd]                = useState(() => toYmd(new Date()))

  // ── Client company filter ("ทุกบริษัท" = '' = no filter, backward compatible) ──
  const [viewCompanyId, setViewCompanyId] = useState('')
  const [companies, setCompanies] = useState<ClientCompanyOption[]>([])
  useEffect(() => {
    let cancelled = false
    apiJson<{ items?: ClientCompanyOption[] }>('/api/client-companies?status=ACTIVE')
      .then(({ ok, data }) => {
        if (!cancelled && ok && Array.isArray(data.items)) setCompanies(data.items)
      })
    return () => { cancelled = true }
  }, [])

  // ── Assignable employees (พนักงานที่รับผิดชอบ picker) ────────────────────────
  const [assignableEmployees, setAssignableEmployees] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    let cancelled = false
    apiJson<{ employees?: { id: string; name: string }[] }>('/api/outside-work/employees')
      .then(({ ok, data }) => {
        if (!cancelled && ok && Array.isArray(data.employees)) setAssignableEmployees(data.employees)
      })
    return () => { cancelled = true }
  }, [])

  const canEditCompanyText = SETTINGS_EDIT_ROLES.includes(currentUserRole)
  const [displayCompanyName, setDisplayCompanyName] = useState(companyName || COMPANY_NAME_FALLBACK)
  const [displayPlanTitle, setDisplayPlanTitle]     = useState(outsideWorkPlanTitle || OUTSIDE_WORK_PLAN_TITLE_DEFAULT)
  useEffect(() => { setDisplayCompanyName(companyName || COMPANY_NAME_FALLBACK) }, [companyName])
  useEffect(() => { setDisplayPlanTitle(outsideWorkPlanTitle || OUTSIDE_WORK_PLAN_TITLE_DEFAULT) }, [outsideWorkPlanTitle])

  const saveCompanySetting = useCallback(async (field: 'companyName' | 'outsideWorkPlanTitle', next: string) => {
    const { ok, data, status } = await apiJson('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    if (!ok) {
      toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status))
      return false
    }
    if (field === 'companyName') setDisplayCompanyName(next)
    else setDisplayPlanTitle(next)
    toast.success('บันทึกแล้ว')
    router.refresh()
    return true
  }, [router])

  useEffect(() => { setReqs(initReqs) }, [initReqs])

  const weekEnd  = addDays(weekStart, 6)
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toYmd(addDays(weekStart, i))),
    [weekStart],
  )

  const viewReqs = useMemo(
    () => reqs.filter(r =>
      weekDays.includes(r.date.slice(0, 10)) &&
      r.userId === viewUserId &&
      (!viewCompanyId || r.clientCompanyId === viewCompanyId),
    ),
    [reqs, weekDays, viewUserId, viewCompanyId],
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

  const updateProductWork = useCallback((key: string, category: string, type: string) => {
    setWeekData(prev => ({ ...prev, [key]: { ...prev[key], productCategory: category, productType: type, dirty: true } }))
  }, [])

  const updateAssignees = useCallback((key: string, ids: string[]) => {
    setWeekData(prev => ({ ...prev, [key]: { ...prev[key], assigneeIds: ids, dirty: true } }))
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
          productCategory: slot.productCategory || null,
          productType:     slot.productType     || null,
          workBranch:   slot.workBranch   || null,
          caseCount:    slot.caseCount    ? Number(slot.caseCount) : null,
          adminChecked: slot.adminChecked || null,
          supervisedBy: slot.supervisedBy || null,
          note:         slot.note         || null,
          assigneeIds:  slot.assigneeIds,
          // Only set clientCompanyId when a specific company filter is active — when
          // viewing "ทุกบริษัท" (all), omit it so existing records keep whatever
          // clientCompanyId they already had (undefined ≠ null: PATCH ignores absent keys).
          ...(viewCompanyId ? { clientCompanyId: viewCompanyId } : {}),
        }
        const url    = slot.id ? `/api/outside-work/${slot.id}` : '/api/outside-work'
        const method = slot.id ? 'PATCH' : 'POST'
        const { ok, data, status } = await apiJson(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!ok) { toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status)); return }
      }
      toast.success('บันทึกสำเร็จ — ส่งเข้าขั้นตอนอนุมัติแล้ว')
      router.refresh()
    } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally   { setSaving(false) }
  }

  // ── Approve ───────────────────────────────────────────────────────────────

  const handleApprove = async (reqId: string, action: 'approve' | 'reject') => {
    const req = reqs.find((r) => r.id === reqId)
    setApprovingId(reqId)
    try {
      if (req?.chainConfigId) {
        const { ok, data, status: hs } = await apiJson(`/api/outside-work/${reqId}/step-approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action === 'approve' ? 'APPROVE' : 'REJECT' }),
        })
        if (!ok) { toast.error(apiErrorMessage(data, 'ดำเนินการไม่สำเร็จ', hs)); return }
        toast.success(action === 'approve' ? 'อนุมัติขั้นตอนเรียบร้อย' : 'ปฏิเสธคำขอแล้ว')
        router.refresh()
        return
      }

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

  const showApproveFor = (req: OWRequest) =>
    canApproveOutside && canUserApproveRequest(req, userId, currentUserRole)

  const canApproveSlotId = (id?: string) => {
    if (!id) return false
    const req = reqs.find((r) => r.id === id)
    return req ? showApproveFor(req) : false
  }

  // ── Delete (soft-delete, PENDING only) ───────────────────────────────────

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const deleteSlot = async (id: string) => {
    if (!window.confirm('ลบรายการนี้? HR สามารถกู้คืนได้ภายหลังจากหน้า "รายการที่ถูกลบ"')) return
    setDeletingId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/outside-work/${id}`, { method: 'DELETE' })
      if (!ok) { toast.error(apiErrorMessage(data, 'ลบไม่สำเร็จ', status)); return }
      setReqs(prev => prev.filter(r => r.id !== id))
      toast.success('ลบรายการแล้ว')
    } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally { setDeletingId(null) }
  }

  // ── Export (current week + person + company filter) ─────────────────────

  const [exporting, setExporting] = useState(false)

  const exportExcel = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/outside-work/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: toYmd(weekStart),
          weekEnd: toYmd(weekEnd),
          filterUserId: viewUserId,
          clientCompanyId: viewCompanyId || null,
        }),
      })
      if (!res.ok) { toast.error('ส่งออกไม่สำเร็จ'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `outside-work-${toYmd(weekStart)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally { setExporting(false) }
  }

  // ── CSS tokens ────────────────────────────────────────────────────────────

  const TH = 'border border-black bg-gray-200 text-sm font-semibold text-center px-1 py-1.5 leading-tight align-middle text-gray-900'
  const TD = 'border border-black align-top text-sm text-gray-900'
  const INP = 'form-on-light w-full bg-white text-sm !text-gray-900 outline-none px-1 py-1 border border-gray-300 shadow-sm placeholder:text-gray-400 leading-snug rounded-sm focus:ring-2 focus:ring-green-500 focus:border-green-500'
  const SEL = 'select-on-light w-full bg-white text-sm !text-gray-900 outline-none px-0.5 py-1 cursor-pointer leading-snug border border-gray-300 shadow-sm rounded-sm focus:ring-2 focus:ring-green-500 focus:border-green-500'
  const INP_RO = 'cursor-default bg-slate-100 !text-gray-900'
  const RO_SPAN = 'text-sm font-medium text-gray-900'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-gray-50 min-h-screen print:bg-white">
      <div className="max-w-[1440px] mx-auto px-3 py-4 md:px-6 md:py-6 space-y-4">

        {/* Admin — employee switcher + client company filter */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-white border border-gray-300 rounded-xl px-4 py-2.5 shadow-sm print:hidden">
          {canViewAll && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 font-semibold shrink-0">ดูแผนของ:</span>
              <select
                value={viewUserId}
                onChange={e => setViewUserId(e.target.value)}
                className="form-on-light select-on-light flex-1 max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm !text-gray-900 bg-white shadow-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
              >
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}{e.id === userId ? ' (ตัวเอง)' : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 font-semibold shrink-0">บริษัทลูกค้า:</span>
            <select
              value={viewCompanyId}
              onChange={e => setViewCompanyId(e.target.value)}
              className="form-on-light select-on-light flex-1 max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm !text-gray-900 bg-white shadow-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
            >
              <option value="">ทุกบริษัท</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={exportExcel}
            disabled={exporting}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg shadow-sm hover:bg-slate-100 hover:border-gray-400 text-gray-800 font-semibold transition disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Export Excel
          </button>
        </div>

        {/* ── Form card ───────────────────────────────────────────────── */}
        <div className="bg-white text-gray-900 border border-gray-400 rounded-lg shadow-sm overflow-hidden print:shadow-none print:rounded-none">

          {/* Company header */}
          <div className="border-b-2 border-gray-400 text-center px-4 py-3">
            <InlineEditableText
              tag="p"
              value={displayCompanyName}
              canEdit={canEditCompanyText}
              onSave={(next) => saveCompanySetting('companyName', next)}
              className="text-base font-bold text-gray-900 tracking-wide"
            />
            <InlineEditableText
              tag="h1"
              value={displayPlanTitle}
              canEdit={canEditCompanyText}
              onSave={(next) => saveCompanySetting('outsideWorkPlanTitle', next)}
              className="mt-1.5 text-base font-bold text-red-800 leading-snug"
            />
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
          <div className="px-4">
            <div className="table-scroll">
            <table className="w-full border-collapse text-gray-900" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th className={`${TH} w-[58px]`}     rowSpan={2}>วัน</th>
                  <th className={`${TH} w-[56px]`}     rowSpan={2}>ว/ด/ปี</th>
                  <th className={`${TH} w-[48px]`}     rowSpan={2}>ช่วง<br/>เวลา</th>
                  <th className={`${TH} w-[130px]`}    rowSpan={2}>สถานที่ไปทำงาน</th>
                  <th className={`${TH} w-[150px]`}    rowSpan={2}>สิ่งที่ไปดำเนินการ</th>
                  <th className={`${TH} w-[80px]`}     rowSpan={2}>หมายเลข<br/>คดี</th>
                  <th className={`${TH} w-[90px]`}     rowSpan={2}>งานโปรดักส์</th>
                  <th className={`${TH} w-[76px]`}     rowSpan={2}>งานของ<br/>สาขาไหน</th>
                  <th className={`${TH} w-[52px]`}     rowSpan={2}>จำนวน<br/>คดี</th>
                  <th className={`${TH} w-[68px]`}>แอดมินโปรดักส์<br/>ตรวจสอบ</th>
                  <th className={`${TH} w-[86px]`}>ผู้สั่งงาน</th>
                  <th className={`${TH} w-[70px]`}     rowSpan={2}>อนุมัติ/<br/>ไม่อนุมัติ</th>
                  <th className={`${TH} w-[90px]`}     rowSpan={2}>หมายเหตุ</th>
                  <th className={`${TH} w-[56px] print:hidden`} rowSpan={2}>จัดการ</th>
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
                      <tr className={`${stripe} ${today ? 'outline outline-1 outline-green-400 outline-offset-[-1px]' : ''}`}>

                        {/* วัน — rowSpan 2 */}
                        <td className={`border border-black text-center align-middle font-bold text-sm text-gray-900 ${today ? 'bg-green-50' : stripe}`}
                          rowSpan={2}>
                          <div className="flex flex-col items-center gap-0.5 text-gray-900">
                            {today && <span className="text-xs text-green-800 font-semibold">วันนี้</span>}
                            {DAYS_TH[dayIdx]}
                          </div>
                        </td>

                        {/* ว/ด/ปี — rowSpan 2 */}
                        <td className={`border border-black text-center align-middle text-sm text-gray-900 ${today ? 'bg-green-50' : stripe}`}
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

                        {/* งานโปรดักส์ */}
                        <td className={`${TD} ${stripe}`}>
                          <ProductWorkCell
                            category={morn.productCategory}
                            type={morn.productType}
                            legacy={morn.productWork}
                            readOnly={mLock}
                            onChange={(category, type) => updateProductWork(kM, category, type)}
                          />
                          <div className="border-t border-gray-200 mt-0.5 pt-0.5">
                            <AssigneeCell
                              value={morn.assigneeIds}
                              options={assignableEmployees}
                              readOnly={mLock}
                              onChange={(ids) => updateAssignees(kM, ids)}
                            />
                          </div>
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
                                <OutsideWorkStatusBadge slot={morn} />
                                {canApproveSlotId(morn.id) && (
                                  <div className="flex flex-col gap-2 mt-1">
                                    <button onClick={() => handleApprove(morn.id!, 'approve')} disabled={approvingId === morn.id}
                                      title="อนุมัติ" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-green-100 active:bg-green-200 text-green-800 transition disabled:opacity-40 touch-manipulation">
                                      {approvingId === morn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    </button>
                                    <button onClick={() => handleApprove(morn.id!, 'reject')} disabled={approvingId === morn.id}
                                      title="ปฏิเสธ" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-red-100 active:bg-red-200 text-red-800 transition disabled:opacity-40 touch-manipulation">
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

                        {/* จัดการ — พิมพ์ / ลบ */}
                        <td className={`${TD} ${stripe} text-center print:hidden`}>
                          {morn.id && (
                            <div className="flex flex-col items-center justify-center gap-2">
                              <button type="button" onClick={() => window.open(`/outside-work/${morn.id}/print`, '_blank')}
                                title="พิมพ์" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-gray-200 active:bg-gray-300 text-gray-700 transition touch-manipulation">
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {(morn.userId === userId || canApproveOutside) && isPendingSlot(morn) && (
                                <button type="button" onClick={() => deleteSlot(morn.id!)} disabled={deletingId === morn.id}
                                  title="ลบ" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-red-100 active:bg-red-200 text-red-700 transition disabled:opacity-40 touch-manipulation">
                                  {deletingId === morn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          )}
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
                          <ProductWorkCell
                            category={aftn.productCategory}
                            type={aftn.productType}
                            legacy={aftn.productWork}
                            readOnly={aLock}
                            onChange={(category, type) => updateProductWork(kA, category, type)}
                          />
                          <div className="border-t border-gray-200 mt-0.5 pt-0.5">
                            <AssigneeCell
                              value={aftn.assigneeIds}
                              options={assignableEmployees}
                              readOnly={aLock}
                              onChange={(ids) => updateAssignees(kA, ids)}
                            />
                          </div>
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
                                <OutsideWorkStatusBadge slot={aftn} />
                                {canApproveSlotId(aftn.id) && (
                                  <div className="flex flex-col gap-2 mt-1">
                                    <button onClick={() => handleApprove(aftn.id!, 'approve')} disabled={approvingId === aftn.id}
                                      title="อนุมัติ" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-green-100 active:bg-green-200 text-green-800 transition disabled:opacity-40 touch-manipulation">
                                      {approvingId === aftn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    </button>
                                    <button onClick={() => handleApprove(aftn.id!, 'reject')} disabled={approvingId === aftn.id}
                                      title="ปฏิเสธ" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-red-100 active:bg-red-200 text-red-800 transition disabled:opacity-40 touch-manipulation">
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

                        {/* จัดการ — พิมพ์ / ลบ */}
                        <td className={`${TD} ${stripe} text-center print:hidden`}>
                          {aftn.id && (
                            <div className="flex flex-col items-center justify-center gap-2">
                              <button type="button" onClick={() => window.open(`/outside-work/${aftn.id}/print`, '_blank')}
                                title="พิมพ์" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-gray-200 active:bg-gray-300 text-gray-700 transition touch-manipulation">
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {(aftn.userId === userId || canApproveOutside) && isPendingSlot(aftn) && (
                                <button type="button" onClick={() => deleteSlot(aftn.id!)} disabled={deletingId === aftn.id}
                                  title="ลบ" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-red-100 active:bg-red-200 text-red-700 transition disabled:opacity-40 touch-manipulation">
                                  {deletingId === aftn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            </div>
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
                className="flex items-center gap-2 px-5 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-sm transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {saving ? 'กำลังบันทึก...' : 'บันทึกและส่งอนุมัติ'}
              </button>
            </div>
          )}
        </div>

        <OutsideWorkApprovalHistory
          viewReqs={viewReqs}
          approvingId={approvingId}
          showApproveFor={showApproveFor}
          onApprove={handleApprove}
        />

      </div>
    </div>
  )
}
