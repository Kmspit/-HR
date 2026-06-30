'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, GripVertical, CheckCircle2, Star, StarOff, Power, PowerOff, Edit3, X, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { ROLE_LABELS, ROLE_ICONS } from '@/lib/permissions'
import {
  CHAIN_ENTITY_LABELS,
  CHAIN_ENTITY_TYPES,
  type ChainEntityType,
} from '@/lib/approval-chain-shared'
import type { Role } from '@prisma/client'

// ── Types ──────────────────────────────────────────────────────────────────

type StepDraft = {
  _key: string
  stepOrder: number
  stepName: string
  approverRole: string
  approverId: string
  canSkip: boolean
}

type ChainStep = {
  id: string
  stepOrder: number
  stepName: string
  approverRole: Role | null
  approverId: string | null
  canSkip: boolean
  approver?: { id: string; name: string } | null
}

type Chain = {
  id: string
  name: string
  description: string | null
  entityType: ChainEntityType
  isActive: boolean
  isDefault: boolean
  steps: ChainStep[]
}

type User = { id: string; name: string; role: Role }

type Props = {
  initialChains: Chain[]
  users: User[]
}

const APPROVAL_ROLES: Role[] = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN', 'ENFORCEMENT']

const emptyStep = (): StepDraft => ({
  _key: String(Date.now() + Math.random()),
  stepOrder: 1,
  stepName: '',
  approverRole: 'MANAGER',
  approverId: '',
  canSkip: false,
})

// ── Sub-component: step row in the create/edit form ───────────────────────

function StepRow({
  step, idx, total,
  onChange, onRemove, onMove,
  users,
}: {
  step: StepDraft; idx: number; total: number
  onChange: (updated: StepDraft) => void
  onRemove: () => void
  onMove: (dir: 'up' | 'down') => void
  users: User[]
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-slate-800/40 p-3">
      <div className="flex flex-col gap-0.5 pt-0.5">
        <button type="button" disabled={idx === 0}     onClick={() => onMove('up')}   className="text-slate-500 hover:text-white disabled:opacity-30"><ChevronUp size={14}/></button>
        <GripVertical size={14} className="text-slate-600 mx-auto" />
        <button type="button" disabled={idx === total - 1} onClick={() => onMove('down')} className="text-slate-500 hover:text-white disabled:opacity-30"><ChevronDown size={14}/></button>
      </div>

      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
            {idx + 1}
          </span>
          <input
            className="flex-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
            placeholder="ชื่อขั้นตอน เช่น หัวหน้าทีมอนุมัติ"
            value={step.stepName}
            onChange={(e) => onChange({ ...step, stepName: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase">Role ที่อนุมัติ</label>
            <select
              className="mt-0.5 w-full rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500/50"
              value={step.approverRole}
              onChange={(e) => onChange({ ...step, approverRole: e.target.value, approverId: '' })}
            >
              <option value="">— ไม่กำหนด role —</option>
              {APPROVAL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_ICONS[r] ?? ''} {ROLE_LABELS[r] ?? r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase">หรือระบุคน</label>
            <select
              className="mt-0.5 w-full rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500/50"
              value={step.approverId}
              onChange={(e) => onChange({ ...step, approverId: e.target.value, approverRole: e.target.value ? '' : step.approverRole })}
            >
              <option value="">— ใช้ role —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={step.canSkip} onChange={(e) => onChange({ ...step, canSkip: e.target.checked })} className="accent-blue-500" />
          สามารถข้ามขั้นตอนนี้ได้ (canSkip)
        </label>
      </div>

      <button type="button" onClick={onRemove} className="mt-0.5 flex-shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ── Create / Edit form ─────────────────────────────────────────────────────

function ChainForm({
  initial, users, entityType, onSave, onCancel,
}: {
  initial?: Chain
  users: User[]
  entityType: ChainEntityType
  onSave: (chain: Chain) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false)
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps.map((s) => ({
      _key:         s.id,
      stepOrder:    s.stepOrder,
      stepName:     s.stepName,
      approverRole: s.approverRole ?? '',
      approverId:   s.approverId ?? '',
      canSkip:      s.canSkip,
    })) ?? [emptyStep()],
  )
  const [saving, setSaving] = useState(false)

  const addStep = () => {
    setSteps((prev) => {
      const nextOrder = (prev[prev.length - 1]?.stepOrder ?? 0) + 1
      return [...prev, { ...emptyStep(), stepOrder: nextOrder }]
    })
  }

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 })))
  }

  const updateStep = (idx: number, updated: StepDraft) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? updated : s)))
  }

  const moveStep = (idx: number, dir: 'up' | 'down') => {
    setSteps((prev) => {
      const next = [...prev]
      const target = dir === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target]!, next[idx]!]
      return next.map((s, i) => ({ ...s, stepOrder: i + 1 }))
    })
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('กรุณาระบุชื่อ chain'); return }
    if (steps.some((s) => !s.stepName.trim())) { toast.error('กรุณาระบุชื่อทุกขั้นตอน'); return }

    setSaving(true)
    try {
      const url  = initial ? `/api/leave/approval-chains/${initial.id}` : '/api/leave/approval-chains'
      const method = initial ? 'PUT' : 'POST'
      const { ok, data, status } = await apiJson<{ chain?: Chain }>(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, entityType: initial?.entityType ?? entityType, isDefault, steps }),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status)); return }
      toast.success(initial ? 'อัปเดต chain เรียบร้อย' : 'สร้าง chain เรียบร้อย')
      onSave(data?.chain as Chain)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">{initial ? 'แก้ไข Chain' : 'สร้าง Approval Chain ใหม่'}</h3>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-500 hover:text-white"><X size={16}/></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-400 uppercase">ชื่อ Chain *</label>
          <input className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50" placeholder="เช่น Standard Leave Approval" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-400 uppercase">คำอธิบาย</label>
          <input className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50" placeholder="optional" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-blue-500" />
        ใช้เป็น Default Chain ({CHAIN_ENTITY_LABELS[entityType]})
      </label>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase">ขั้นตอนการอนุมัติ</p>
        {steps.map((s, idx) => (
          <StepRow
            key={s._key}
            step={s} idx={idx} total={steps.length}
            onChange={(u) => updateStep(idx, u)}
            onRemove={() => removeStep(idx)}
            onMove={(dir) => moveStep(idx, dir)}
            users={users}
          />
        ))}
        <button type="button" onClick={addStep} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-2.5 text-xs text-slate-400 hover:border-blue-500/40 hover:text-blue-400 transition-colors">
          <Plus size={14} /> เพิ่มขั้นตอน
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors">ยกเลิก</button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 transition-colors">
          <Save size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}

// ── Chain card ─────────────────────────────────────────────────────────────

function ChainCard({
  chain, users, onUpdate, onDelete,
}: {
  chain: Chain
  users: User[]
  onUpdate: (c: Chain) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)

  const toggleActive = async () => {
    setToggling(true)
    try {
      const { ok, data, status } = await apiJson<{ chain?: Chain }>(`/api/leave/approval-chains/${chain.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !chain.isActive }),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'อัปเดตไม่สำเร็จ', status)); return }
      onUpdate({ ...chain, isActive: !chain.isActive })
      toast.success(chain.isActive ? 'ปิดใช้งาน chain แล้ว' : 'เปิดใช้งาน chain แล้ว')
    } finally {
      setToggling(false)
    }
  }

  const setDefault = async () => {
    const { ok, data, status } = await apiJson<{ chain?: Chain }>(`/api/leave/approval-chains/${chain.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    })
    if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'อัปเดตไม่สำเร็จ', status)); return }
    onUpdate({ ...chain, isDefault: true })
    toast.success('ตั้งเป็น Default chain แล้ว')
  }

  if (editing) {
    return (
      <ChainForm
        initial={chain} users={users} entityType={chain.entityType}
        onSave={(updated) => { onUpdate(updated); setEditing(false) }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className={`rounded-2xl border p-4 transition-all ${chain.isDefault ? 'border-blue-500/40 bg-blue-500/5' : chain.isActive ? 'border-white/10 bg-slate-800/30' : 'border-white/5 bg-slate-800/10 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{chain.name}</h3>
            {chain.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                <Star size={10} /> Default
              </span>
            )}
            <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-medium text-slate-300">
              {CHAIN_ENTITY_LABELS[chain.entityType]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${chain.isActive ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
              {chain.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {chain.description && <p className="mt-0.5 text-xs text-slate-500">{chain.description}</p>}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {!chain.isDefault && chain.isActive && (
            <button type="button" title="ตั้งเป็น Default" onClick={setDefault} className="rounded-lg p-1.5 text-slate-500 hover:bg-yellow-500/10 hover:text-yellow-400 transition-colors">
              <Star size={14} />
            </button>
          )}
          <button type="button" title={chain.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} onClick={toggleActive} disabled={toggling} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-700/60 hover:text-white transition-colors disabled:opacity-50">
            {chain.isActive ? <PowerOff size={14} /> : <Power size={14} />}
          </button>
          <button type="button" title="แก้ไข" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 transition-colors">
            <Edit3 size={14} />
          </button>
          <button type="button" title="ลบ" onClick={() => onDelete(chain.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Steps preview */}
      <div className="mt-3 flex flex-wrap gap-2">
        {chain.steps.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400">{idx + 1}</span>
            <span className="text-xs text-white">{s.stepName}</span>
            {s.approverRole && <span className="text-[10px] text-slate-500">({ROLE_LABELS[s.approverRole] ?? s.approverRole})</span>}
            {s.approver    && <span className="text-[10px] text-slate-500">({s.approver.name})</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main manager ───────────────────────────────────────────────────────────

export default function ApprovalChainManager({ initialChains, users }: Props) {
  const [chains, setChains] = useState<Chain[]>(initialChains)
  const [creating, setCreating] = useState(false)
  const [entityFilter, setEntityFilter] = useState<ChainEntityType>('LEAVE')

  const filteredChains = chains.filter((c) => c.entityType === entityFilter)

  const handleUpdate = (updated: Chain) => {
    setChains((prev) => {
      let next = prev.map((c) => (c.id === updated.id ? updated : c))
      if (updated.isDefault) {
        next = next.map((c) => (
          c.id !== updated.id && c.entityType === updated.entityType
            ? { ...c, isDefault: false }
            : c
        ))
      }
      return next
    })
  }

  const handleCreate = (chain: Chain) => {
    setChains((prev) => {
      let next = [chain, ...prev]
      if (chain.isDefault) {
        next = next.map((c) => (
          c.id !== chain.id && c.entityType === chain.entityType
            ? { ...c, isDefault: false }
            : c
        ))
      }
      return next
    })
    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการปิดใช้งาน chain นี้?')) return
    const { ok } = await apiJson(`/api/leave/approval-chains/${id}`, { method: 'DELETE' })
    if (ok) {
      setChains((prev) => prev.map((c) => (c.id === id ? { ...c, isActive: false, isDefault: false } : c)))
      toast.success('ปิดใช้งาน chain แล้ว')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">กำหนดขั้นตอนการอนุมัติ (ลา · นอกสถานที่ · แผนงาน · แก้เวลา)</p>
          <p className="text-xs text-slate-500 mt-0.5">Default chain จะถูกใช้กับคำขอใหม่ของประเภทนั้นอัตโนมัติ</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            <Plus size={16} /> สร้าง Chain
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {CHAIN_ENTITY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setEntityFilter(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              entityFilter === t
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {CHAIN_ENTITY_LABELS[t]}
          </button>
        ))}
      </div>

      {creating && (
        <ChainForm
          users={users}
          entityType={entityFilter}
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {filteredChains.length === 0 && !creating && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-800/20 py-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">ยังไม่มี Approval Chain สำหรับ {CHAIN_ENTITY_LABELS[entityFilter]}</p>
          <p className="text-xs text-slate-600 mt-1">กดปุ่ม "สร้าง Chain" เพื่อเริ่มต้น</p>
        </div>
      )}

      <div className="space-y-3">
        {filteredChains.map((chain) => (
          <ChainCard
            key={chain.id}
            chain={chain}
            users={users}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}
