'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Condition = { field: string; operator: string; value: string }
type ActionParam = Record<string, string>
type AutomationActionDef = { type: string; params: ActionParam }

interface AutomationRule {
  id: string
  name: string
  description: string | null
  trigger: string
  conditions: string
  actions: string
  isActive: boolean
  priority: number
  testMode: boolean
  runCount: number
  successCount: number
  failCount: number
  lastRunAt: string | null
  createdAt: string
  createdBy: { id: string; name: string }
}

interface ExecutionLog {
  id: string
  ruleId: string
  trigger: string
  success: boolean
  actionsRun: string
  errorMessage: string | null
  durationMs: number | null
  testMode: boolean
  triggeredAt: string
  rule: { id: string; name: string; trigger: string }
}

interface InsightData {
  totalRules: number
  activeRules: number
  totalExecutions: number
  successExecutions: number
  failExecutions: number
  recentExecutions: number
  successRate: number
  avgDurationMs: number
  topRules: { id: string; name: string; trigger: string; runCount: number; successCount: number; failCount: number }[]
  failedRules: { id: string; name: string; trigger: string; failCount: number; runCount: number }[]
  manualWorkReduced: { tasksAutoCreated: number; notificationsAutoSent: number; estimatedMinutesSaved: number }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGERS = [
  { value: 'CASE_CREATED',      label: '📁 คดีถูกสร้าง' },
  { value: 'CASE_UPDATED',      label: '📝 คดีถูกแก้ไข' },
  { value: 'COURT_CREATED',     label: '⚖️ นัดศาลถูกสร้าง' },
  { value: 'COURT_MISSED',      label: '❌ พลาดนัดศาล' },
  { value: 'TASK_OVERDUE',      label: '⏰ งานเกินกำหนด' },
  { value: 'TASK_COMPLETED',    label: '✅ งานเสร็จ' },
  { value: 'PROMISE_CREATED',   label: '🤝 สัญญาชำระถูกสร้าง' },
  { value: 'PROMISE_BROKEN',    label: '💔 สัญญาชำระผิด' },
  { value: 'PAYMENT_CONFIRMED', label: '💰 ยืนยันการชำระ' },
  { value: 'PAYMENT_LARGE',     label: '💎 ชำระเงินรายใหญ่' },
  { value: 'DOCUMENT_UPLOADED', label: '📄 อัพโหลดเอกสาร' },
  { value: 'EMPLOYEE_LATE',     label: '🕐 พนักงานมาสาย' },
  { value: 'WARNING_CREATED',   label: '⚠️ ออกใบเตือน' },
  { value: 'LEAVE_REQUESTED',   label: '📅 ขอลาหยุด' },
  { value: 'APPROVAL_PENDING',  label: '🔔 รออนุมัติ' },
]

const ACTION_TYPES = [
  { value: 'SEND_NOTIFICATION',  label: '🔔 ส่งแจ้งเตือนในระบบ' },
  { value: 'SEND_LINE',          label: '💬 ส่ง LINE' },
  { value: 'ESCALATE_TO_MANAGER',label: '📢 แจ้งผู้จัดการ' },
  { value: 'ESCALATE_TO_CEO',    label: '🚨 แจ้ง CEO' },
  { value: 'CREATE_TASK',        label: '✅ สร้างงาน' },
  { value: 'CHANGE_RISK_LEVEL',  label: '⚠️ เปลี่ยน Risk Level ลูกหนี้' },
  { value: 'UPDATE_CASE_STATUS', label: '📁 อัพเดทสถานะคดี' },
  { value: 'ASSIGN_USER',        label: '👤 มอบหมายผู้รับผิดชอบ' },
  { value: 'CREATE_REMINDER',    label: '⏰ สร้างแจ้งเตือน' },
  { value: 'CREATE_FOLLOWUP',    label: '📞 บันทึก Follow-up' },
]

const CONDITION_FIELDS = [
  { value: 'amount',          label: 'จำนวนเงิน' },
  { value: 'riskLevel',       label: 'ระดับความเสี่ยง' },
  { value: 'caseType',        label: 'ประเภทคดี' },
  { value: 'paymentType',     label: 'ประเภทการชำระ' },
  { value: 'remainingDebt',   label: 'หนี้คงเหลือ' },
  { value: 'promisedAmount',  label: 'จำนวนที่สัญญา' },
]

const OPERATORS = [
  { value: 'gt',       label: '> มากกว่า' },
  { value: 'gte',      label: '>= มากกว่าหรือเท่ากับ' },
  { value: 'lt',       label: '< น้อยกว่า' },
  { value: 'lte',      label: '<= น้อยกว่าหรือเท่ากับ' },
  { value: 'eq',       label: '= เท่ากับ' },
  { value: 'neq',      label: '≠ ไม่เท่ากับ' },
  { value: 'contains', label: 'ประกอบด้วย' },
  { value: 'in',       label: 'อยู่ใน list' },
  { value: 'exists',   label: 'มีค่า (exists)' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSafe(json: string): unknown {
  try { return JSON.parse(json) } catch { return [] }
}

function fmt(n: number) { return n.toLocaleString('th-TH') }

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-green-600' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{label}</span>
}

// ─── Rule Modal ───────────────────────────────────────────────────────────────

function RuleModal({
  rule,
  onClose,
  onSave,
}: {
  rule: AutomationRule | null
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName]             = useState(rule?.name ?? '')
  const [description, setDesc]      = useState(rule?.description ?? '')
  const [trigger, setTrigger]       = useState(rule?.trigger ?? TRIGGERS[0].value)
  const [conditions, setConds]      = useState<Condition[]>(
    rule ? (parseSafe(rule.conditions) as Condition[]) : []
  )
  const [actions, setActions]       = useState<AutomationActionDef[]>(
    rule ? (parseSafe(rule.actions) as AutomationActionDef[]) : []
  )
  const [priority, setPriority]     = useState(rule?.priority ?? 0)
  const [testMode, setTestMode]     = useState(rule?.testMode ?? false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  function addCondition() {
    setConds(prev => [...prev, { field: 'amount', operator: 'gt', value: '' }])
  }
  function removeCondition(i: number) {
    setConds(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateCondition(i: number, key: keyof Condition, val: string) {
    setConds(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: val } : c))
  }

  function addAction() {
    setActions(prev => [...prev, { type: ACTION_TYPES[0].value, params: {} }])
  }
  function removeAction(i: number) {
    setActions(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateActionType(i: number, type: string) {
    setActions(prev => prev.map((a, idx) => idx === i ? { ...a, type } : a))
  }
  function updateActionParam(i: number, key: string, val: string) {
    setActions(prev => prev.map((a, idx) => idx === i ? { ...a, params: { ...a.params, [key]: val } } : a))
  }

  async function handleSave() {
    if (!name.trim()) { setError('กรุณาใส่ชื่อ rule'); return }
    setSaving(true)
    setError('')
    try {
      const method = rule ? 'PATCH' : 'POST'
      const url    = rule ? `/api/automation/rules/${rule.id}` : '/api/automation/rules'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, trigger, conditions, actions, priority, testMode }),
      })
      if (!res.ok) throw new Error(await res.text())
      onSave()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const actionParamHints: Record<string, { key: string; label: string }[]> = {
    SEND_NOTIFICATION:   [{ key: 'title', label: 'หัวข้อ' }, { key: 'message', label: 'ข้อความ' }, { key: 'roles', label: 'Roles (comma-separated)' }, { key: 'link', label: 'Link' }],
    SEND_LINE:           [{ key: 'message', label: 'ข้อความ LINE' }],
    ESCALATE_TO_MANAGER: [{ key: 'title', label: 'หัวข้อ' }, { key: 'message', label: 'ข้อความ' }],
    ESCALATE_TO_CEO:     [{ key: 'title', label: 'หัวข้อ' }, { key: 'message', label: 'ข้อความ' }],
    CREATE_TASK:         [{ key: 'title', label: 'ชื่องาน' }, { key: 'description', label: 'รายละเอียด' }, { key: 'priority', label: 'Priority (LOW/MEDIUM/HIGH)' }, { key: 'dueDaysFromNow', label: 'ครบกำหนด (วัน)' }],
    CHANGE_RISK_LEVEL:   [{ key: 'riskLevel', label: 'Risk Level (LOW/MEDIUM/HIGH/CRITICAL)' }],
    UPDATE_CASE_STATUS:  [{ key: 'status', label: 'สถานะคดี' }],
    ASSIGN_USER:         [{ key: 'userId', label: 'User ID' }],
    CREATE_REMINDER:     [{ key: 'title', label: 'หัวข้อ' }, { key: 'message', label: 'ข้อความ' }, { key: 'link', label: 'Link' }],
    CREATE_FOLLOWUP:     [{ key: 'note', label: 'หมายเหตุ' }, { key: 'channel', label: 'ช่องทาง (PHONE/LINE/EMAIL)' }],
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{rule ? 'แก้ไข Rule' : 'สร้าง Rule ใหม่'}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

          {/* Basic info */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อ Rule *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="hr-input w-full" placeholder="เช่น ชำระเงินสูง → แจ้งผู้จัดการ" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">คำอธิบาย</label>
              <input value={description} onChange={e => setDesc(e.target.value)} className="hr-input w-full" placeholder="รายละเอียดเพิ่มเติม..." />
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">เมื่อเกิด (Trigger)</label>
            <select value={trigger} onChange={e => setTrigger(e.target.value)} className="hr-input w-full">
              {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Conditions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">เงื่อนไข (Conditions) — ทุกเงื่อนไขต้องผ่าน</label>
              <button onClick={addCondition} className="rounded-lg bg-green-50 px-3 py-1 text-xs text-green-700 hover:bg-green-100">+ เพิ่มเงื่อนไข</button>
            </div>
            {conditions.length === 0 && <p className="text-xs text-gray-400 italic">ไม่มีเงื่อนไข — rule จะทำงานทุกครั้งที่ trigger เกิดขึ้น</p>}
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <div key={c.field + '-' + c.operator} className="flex items-center gap-2">
                  <select value={c.field} onChange={e => updateCondition(i, 'field', e.target.value)} className="hr-input flex-1 text-sm">
                    {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={c.operator} onChange={e => updateCondition(i, 'operator', e.target.value)} className="hr-input flex-1 text-sm">
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input value={c.value} onChange={e => updateCondition(i, 'value', e.target.value)} className="hr-input flex-1 text-sm" placeholder="ค่า..." />
                  <button onClick={() => removeCondition(i)} className="text-gray-400 hover:text-red-500">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">การกระทำ (Actions)</label>
              <button onClick={addAction} className="rounded-lg bg-green-50 px-3 py-1 text-xs text-green-700 hover:bg-green-100">+ เพิ่มการกระทำ</button>
            </div>
            {actions.length === 0 && <p className="text-xs text-gray-400 italic">ยังไม่มีการกระทำ</p>}
            <div className="space-y-3">
              {actions.map((a, i) => (
                <div key={a.type + '-' + String(i)} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <select value={a.type} onChange={e => updateActionType(i, e.target.value)} className="hr-input flex-1 text-sm mr-2">
                      {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button onClick={() => removeAction(i)} className="text-gray-400 hover:text-red-500">✕</button>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {(actionParamHints[a.type] ?? []).map(hint => (
                      <div key={hint.key} className="flex items-center gap-2">
                        <span className="w-40 shrink-0 text-xs text-gray-500">{hint.label}</span>
                        <input
                          value={a.params[hint.key] ?? ''}
                          onChange={e => updateActionParam(i, hint.key, e.target.value)}
                          className="hr-input flex-1 text-xs"
                          placeholder={`{{debtorName}} ใช้ได้`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Priority (สูง = ทำงานก่อน)</label>
              <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} className="hr-input w-full" min={0} max={100} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Toggle checked={testMode} onChange={setTestMode} />
              <span className="text-sm text-gray-600">Test Mode (ไม่ execute จริง)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button onClick={onClose} className="hr-btn-secondary">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving} className="hr-btn-primary">
            {saving ? 'กำลังบันทึก...' : 'บันทึก Rule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AutomationClient({
  userId,
  userRole,
}: {
  userId: string
  userRole: string
}) {
  const [view, setView]           = useState<'rules' | 'logs' | 'insights'>('rules')
  const [rules, setRules]         = useState<AutomationRule[]>([])
  const [logs, setLogs]           = useState<ExecutionLog[]>([])
  const [insights, setInsights]   = useState<InsightData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [selectedRule, setSelected] = useState<AutomationRule | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditing] = useState<AutomationRule | null>(null)
  const [page, setPage]           = useState(1)
  const [total, setTotal]         = useState(0)
  const [totalPages, setPages]    = useState(1)
  const [logPage, setLogPage]     = useState(1)
  const [logTotal, setLogTotal]   = useState(0)
  const [logPages, setLogPages]   = useState(1)
  const [filterSuccess, setFilterSuccess] = useState('')

  const loadRules = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/automation/rules?page=${p}`)
      const data = await res.json()
      setRules(data.rules ?? [])
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
    } finally { setLoading(false) }
  }, [])

  const loadLogs = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const url = `/api/automation/logs?page=${p}${filterSuccess ? `&success=${filterSuccess}` : ''}${selectedRule ? `&ruleId=${selectedRule.id}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      setLogs(data.logs ?? [])
      setLogTotal(data.total ?? 0)
      setLogPages(data.pages ?? 1)
    } finally { setLoading(false) }
  }, [filterSuccess, selectedRule])

  const loadInsights = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/automation/insights')
      const data = await res.json()
      setInsights(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (view === 'rules')    loadRules(page)
    if (view === 'logs')     loadLogs(logPage)
    if (view === 'insights') loadInsights()
  }, [view, page, logPage, loadRules, loadLogs, loadInsights])

  async function toggleActive(rule: AutomationRule) {
    await fetch(`/api/automation/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    loadRules(page)
  }

  async function deleteRule(id: string) {
    if (!confirm('ลบ rule นี้?')) return
    await fetch(`/api/automation/rules/${id}`, { method: 'DELETE' })
    loadRules(page)
  }

  function openCreate() { setEditing(null); setShowModal(true) }
  function openEdit(r: AutomationRule) { setEditing(r); setShowModal(true) }
  function onSaved() { setShowModal(false); loadRules(page) }

  const triggerLabel = (t: string) => TRIGGERS.find(x => x.value === t)?.label ?? t

  // ─── Render: Rules list ────────────────────────────────────────────────────

  const RulesView = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} rules ทั้งหมด</p>
        <button onClick={openCreate} className="hr-btn-primary text-sm">+ สร้าง Rule ใหม่</button>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">กำลังโหลด...</div>}

      {!loading && rules.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <div className="text-4xl mb-3">⚡</div>
          <p className="text-gray-500 font-medium">ยังไม่มี Automation Rule</p>
          <p className="text-sm text-gray-400 mt-1">สร้าง rule แรกเพื่อให้ระบบทำงานอัตโนมัติ</p>
          <button onClick={openCreate} className="mt-4 hr-btn-primary">+ สร้าง Rule แรก</button>
        </div>
      )}

      <div className="space-y-2">
        {rules.map(rule => (
          <div
            key={rule.id}
            className={`rounded-xl border p-4 cursor-pointer transition-all hover:shadow-sm ${selectedRule?.id === rule.id ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'} ${!rule.isActive ? 'opacity-60' : ''}`}
            onClick={() => setSelected(rule.id === selectedRule?.id ? null : rule)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">{rule.name}</span>
                  {rule.testMode && <Badge label="TEST MODE" color="bg-yellow-100 text-yellow-700" />}
                  {!rule.isActive && <Badge label="ปิดใช้งาน" color="bg-gray-100 text-gray-500" />}
                  {rule.priority > 0 && <Badge label={`P${rule.priority}`} color="bg-purple-100 text-purple-700" />}
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{triggerLabel(rule.trigger)}</p>
                {rule.description && <p className="mt-1 text-xs text-gray-400">{rule.description}</p>}
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                  <span>ทำงาน {rule.runCount} ครั้ง</span>
                  <span className="text-green-600">✓ {rule.successCount}</span>
                  {rule.failCount > 0 && <span className="text-red-500">✗ {rule.failCount}</span>}
                  {rule.lastRunAt && <span>ล่าสุด {new Date(rule.lastRunAt).toLocaleDateString('th-TH')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                <Toggle checked={rule.isActive} onChange={() => toggleActive(rule)} />
                <button onClick={() => openEdit(rule)} className="rounded p-1 text-gray-400 hover:text-green-600 hover:bg-green-50">✏️</button>
                <button onClick={() => deleteRule(rule.id)} className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50">🗑️</button>
              </div>
            </div>

            {selectedRule?.id === rule.id && (
              <div className="mt-3 pt-3 border-t border-green-200">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="font-medium text-gray-600 mb-1">Conditions ({(parseSafe(rule.conditions) as Condition[]).length})</p>
                    {(parseSafe(rule.conditions) as Condition[]).length === 0
                      ? <p className="text-gray-400 italic">ไม่มีเงื่อนไข (ทำงานเสมอ)</p>
                      : (parseSafe(rule.conditions) as Condition[]).map((c) => (
                        <div key={c.field + '-' + c.operator} className="rounded bg-green-50 px-2 py-1 mb-1">
                          {c.field} {c.operator} {c.value}
                        </div>
                      ))
                    }
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 mb-1">Actions ({(parseSafe(rule.actions) as AutomationActionDef[]).length})</p>
                    {(parseSafe(rule.actions) as AutomationActionDef[]).map((a, i) => (
                      <div key={a.type + '-' + String(i)} className="rounded bg-green-50 px-2 py-1 mb-1">
                        {ACTION_TYPES.find(t => t.value === a.type)?.label ?? a.type}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="hr-btn-secondary text-sm px-3 py-1 disabled:opacity-40">← ก่อนหน้า</button>
          <span className="text-sm text-gray-500">หน้า {page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="hr-btn-secondary text-sm px-3 py-1 disabled:opacity-40">ถัดไป →</button>
        </div>
      )}
    </div>
  )

  // ─── Render: Logs ──────────────────────────────────────────────────────────

  const LogsView = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select value={filterSuccess} onChange={e => { setFilterSuccess(e.target.value); setLogPage(1) }} className="hr-input text-sm">
          <option value="">ทั้งหมด</option>
          <option value="true">สำเร็จ</option>
          <option value="false">ล้มเหลว</option>
        </select>
        <p className="text-sm text-gray-500">{logTotal} รายการ</p>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">กำลังโหลด...</div>}

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Rule</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Trigger</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">ผลลัพธ์</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">ระยะเวลา</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">เวลา</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">ยังไม่มี log</td></tr>
            )}
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{log.rule?.name ?? log.ruleId}</td>
                <td className="px-4 py-3 text-gray-500">{triggerLabel(log.trigger)}</td>
                <td className="px-4 py-3">
                  {log.success
                    ? <Badge label="✓ สำเร็จ" color="bg-green-100 text-green-700" />
                    : <Badge label="✗ ล้มเหลว" color="bg-red-100 text-red-700" />
                  }
                  {log.testMode && <Badge label="TEST" color="bg-yellow-100 text-yellow-700 ml-1" />}
                  {log.errorMessage && <p className="mt-1 text-xs text-red-500 truncate max-w-[180px]">{log.errorMessage}</p>}
                </td>
                <td className="px-4 py-3 text-gray-500">{log.durationMs ? `${log.durationMs}ms` : '-'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(log.triggeredAt).toLocaleString('th-TH')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {logPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1} className="hr-btn-secondary text-sm px-3 py-1 disabled:opacity-40">← ก่อนหน้า</button>
          <span className="text-sm text-gray-500">หน้า {logPage}/{logPages}</span>
          <button onClick={() => setLogPage(p => Math.min(logPages, p + 1))} disabled={logPage === logPages} className="hr-btn-secondary text-sm px-3 py-1 disabled:opacity-40">ถัดไป →</button>
        </div>
      )}
    </div>
  )

  // ─── Render: Insights ──────────────────────────────────────────────────────

  const InsightsView = () => !insights ? (
    <div className="text-center py-12 text-gray-400">กำลังโหลด...</div>
  ) : (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Rules ทั้งหมด',   value: insights.totalRules,      color: 'text-green-600' },
          { label: 'Rules เปิดใช้งาน', value: insights.activeRules,     color: 'text-green-600' },
          { label: 'Executions ทั้งหมด', value: fmt(insights.totalExecutions), color: 'text-purple-600' },
          { label: 'Success Rate',     value: `${insights.successRate}%`, color: insights.successRate >= 80 ? 'text-green-600' : 'text-red-600' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-1 text-xs text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Manual work reduced */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-5">
        <h3 className="font-semibold text-green-800 mb-3">💡 Manual Work Reduced</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-700">{fmt(insights.manualWorkReduced.tasksAutoCreated)}</p>
            <p className="text-xs text-green-600">งานที่สร้างอัตโนมัติ</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-700">{fmt(insights.manualWorkReduced.notificationsAutoSent)}</p>
            <p className="text-xs text-green-600">แจ้งเตือนอัตโนมัติ</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-700">{fmt(insights.manualWorkReduced.estimatedMinutesSaved)}</p>
            <p className="text-xs text-green-600">นาทีที่ประหยัดได้ (โดยประมาณ)</p>
          </div>
        </div>
      </div>

      {/* Top rules */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold text-gray-800 mb-3">🏆 Rules ที่ทำงานบ่อยที่สุด</h3>
          <div className="space-y-2">
            {insights.topRules.length === 0
              ? <p className="text-sm text-gray-400 italic">ยังไม่มีข้อมูล</p>
              : insights.topRules.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-300 w-6">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                    <p className="text-xs text-gray-400">{triggerLabel(r.trigger)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium text-gray-700">{fmt(r.runCount)} ครั้ง</p>
                    <p className="text-green-600">{r.runCount > 0 ? Math.round(r.successCount / r.runCount * 100) : 0}% success</p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="font-semibold text-gray-800 mb-3">⚠️ Rules ที่ล้มเหลวบ่อย</h3>
          <div className="space-y-2">
            {insights.failedRules.length === 0
              ? <p className="text-sm text-green-600">✓ ไม่มี rule ที่ล้มเหลวบ่อย</p>
              : insights.failedRules.map(r => (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                    <p className="text-xs text-gray-400">{triggerLabel(r.trigger)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium text-red-600">{r.failCount} ครั้งล้มเหลว</p>
                    <p className="text-gray-400">จาก {r.runCount} ครั้ง</p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-semibold text-gray-800 mb-2">สถิติการทำงาน (30 วันล่าสุด)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-sm">
          <div><p className="text-xl font-bold text-gray-800">{fmt(insights.recentExecutions)}</p><p className="text-gray-500">Executions</p></div>
          <div><p className="text-xl font-bold text-green-600">{fmt(insights.successExecutions)}</p><p className="text-gray-500">สำเร็จ</p></div>
          <div><p className="text-xl font-bold text-red-500">{fmt(insights.failExecutions)}</p><p className="text-gray-500">ล้มเหลว</p></div>
        </div>
        {insights.avgDurationMs > 0 && (
          <p className="mt-2 text-center text-xs text-gray-400">เวลาเฉลี่ยต่อ execution: {insights.avgDurationMs}ms</p>
        )}
      </div>
    </div>
  )

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">⚡ Automation Rules</h1>
          <p className="mt-1 text-sm text-gray-500">กำหนดกฎให้ระบบทำงานอัตโนมัติ ลดการคลิก ลดงานซ้ำ</p>
        </div>

        {/* Tab nav */}
        <div className="mb-6 flex gap-1 border-b border-gray-200">
          {([
            { key: 'rules',    label: '⚡ Rules' },
            { key: 'logs',     label: '📋 Execution Log' },
            { key: 'insights', label: '📊 Insights' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${view === tab.key ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {view === 'rules'    && <RulesView />}
        {view === 'logs'     && <LogsView />}
        {view === 'insights' && <InsightsView />}
      </div>

      {showModal && (
        <RuleModal
          rule={editingRule}
          onClose={() => setShowModal(false)}
          onSave={onSaved}
        />
      )}
    </div>
  )
}
