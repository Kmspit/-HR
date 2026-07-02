'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Save, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { ROLE_LABELS } from '@/lib/access-control'
import type { Role } from '@prisma/client'

type Policy = {
  id: string
  name: string
  role: string | null
  isDefault: boolean
  sickDays: number
  vacationDays: number
  personalDays: number
}

type Props = {
  initialPolicies: Policy[]
  defaults: {
    sickDays: number
    vacationDays: number
    personalDays: number
    probationMonths: number
  }
}

const ROLE_OPTIONS = [
  { value: '', label: '— ทุก Role (Default)' },
  ...(['SUPER_ADMIN', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN', 'EMPLOYEE', 'LAWYER', 'ENFORCEMENT'] as Role[]).map(
    (r) => ({ value: r, label: ROLE_LABELS[r] ?? r }),
  ),
]

function PolicyRow({
  policy,
  onDelete,
  onSaved,
}: {
  policy: Policy
  onDelete: (id: string) => void
  onSaved: (p: Policy) => void
}) {
  const [form, setForm] = useState(policy)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const setNum = (k: 'sickDays' | 'vacationDays' | 'personalDays', v: string) => {
    setForm((f) => ({ ...f, [k]: Math.max(0, parseInt(v) || 0) }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const { ok, data, status } = await apiJson<{ policy: Policy }>('/api/leave-policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'บันทึกไม่สำเร็จ', status)); return }
      toast.success('บันทึกแล้ว')
      onSaved(data.policy)
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const del = async () => {
    if (!confirm(`ลบ Policy "${policy.name}"?`)) return
    setDeleting(true)
    try {
      const { ok, data, status } = await apiJson(`/api/leave-policies?id=${policy.id}`, { method: 'DELETE' })
      if (!ok) { toast.error(apiErrorMessage(data, 'ลบไม่สำเร็จ', status)); return }
      toast.success('ลบแล้ว')
      onDelete(policy.id)
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setDeleting(false) }
  }

  const inputCls = 'w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-green-500/50'

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {form.isDefault && (
            <span className="rounded-md bg-green-500/20 px-2 py-0.5 text-[12px] font-semibold text-green-400">Default</span>
          )}
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="bg-transparent text-sm font-semibold text-white outline-none border-b border-transparent hover:border-white/20 focus:border-green-500 px-0 py-0.5"
            placeholder="ชื่อ Policy"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="accent-green-500"
            />
            Default
          </label>
          <button type="button" onClick={del} disabled={deleting} className="text-slate-600 hover:text-red-400 disabled:opacity-50">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">Role</label>
          <select
            value={form.role ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value || null }))}
            className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none"
          >
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">ลาป่วย (วัน/ปี)</label>
          <input type="number" min="0" max="365" value={form.sickDays} onChange={(e) => setNum('sickDays', e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">พักร้อน (วัน/ปี)</label>
          <input type="number" min="0" max="365" value={form.vacationDays} onChange={(e) => setNum('vacationDays', e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">ลากิจ (วัน/ปี)</label>
          <input type="number" min="0" max="365" value={form.personalDays} onChange={(e) => setNum('personalDays', e.target.value)} className={inputCls} />
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-xl bg-green-600 hover:bg-green-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        บันทึก
      </button>
    </div>
  )
}

export default function LeavePolicyManager({ initialPolicies, defaults }: Props) {
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState({
    name: '',
    role: '' as string,
    isDefault: false,
    sickDays: defaults.sickDays,
    vacationDays: defaults.vacationDays,
    personalDays: defaults.personalDays,
  })
  const router = useRouter()

  const createPolicy = async () => {
    if (!newForm.name.trim()) { toast.error('กรุณาตั้งชื่อ Policy'); return }
    setCreating(true)
    try {
      const { ok, data, status } = await apiJson<{ policy: Policy }>('/api/leave-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newForm, role: newForm.role || null }),
      })
      if (!ok) { toast.error(apiErrorMessage(data, 'สร้างไม่สำเร็จ', status)); return }
      toast.success('สร้าง Policy แล้ว')
      setPolicies((p) => [...p, data.policy])
      setNewForm({ name: '', role: '', isDefault: false, sickDays: defaults.sickDays, vacationDays: defaults.vacationDays, personalDays: defaults.personalDays })
      router.refresh()
    } catch { toast.error('เกิดข้อผิดพลาด') }
    finally { setCreating(false) }
  }

  const inputCls = 'w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-green-500/50'

  return (
    <div className="space-y-6">

      {/* Info */}
      <div className="flex items-start gap-2.5 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
        <Info className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-green-300">วิธีทำงาน</p>
          <p>Policy ที่ตรงกับ Role ของพนักงานจะถูกใช้อัตโนมัติเมื่อเริ่มปีใหม่หรือพนักงานใหม่เข้ามา</p>
          <p>ช่วงทดลองงาน ({defaults.probationMonths} เดือน) — พักร้อน = 0 วัน โดยอัตโนมัติ</p>
          <p>Policy = Default จะใช้กับ Role ที่ไม่มี Policy เฉพาะ</p>
        </div>
      </div>

      {/* Existing policies */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Policies ที่มีอยู่ ({policies.length})</h3>
        {policies.length === 0 && (
          <div className="rounded-xl border border-white/5 bg-slate-900 py-8 text-center text-slate-500 text-sm">
            ยังไม่มี Policy — ระบบจะใช้ค่าจาก Company Settings เป็น Default
          </div>
        )}
        {policies.map((p) => (
          <PolicyRow
            key={p.id}
            policy={p}
            onDelete={(id) => setPolicies((prev) => prev.filter((x) => x.id !== id))}
            onSaved={(updated) => setPolicies((prev) => prev.map((x) => x.id === updated.id ? updated : x))}
          />
        ))}
      </div>

      {/* Create new */}
      <div className="rounded-2xl border border-white/5 bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">+ สร้าง Policy ใหม่</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">ชื่อ Policy *</label>
            <input value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="เช่น มาตรฐาน, ผู้จัดการ" />
          </div>
          <div className="space-y-1">
            <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">Role</label>
            <select value={newForm.role} onChange={(e) => setNewForm((f) => ({ ...f, role: e.target.value }))} className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none">
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">ลาป่วย</label>
            <input type="number" min="0" max="365" value={newForm.sickDays} onChange={(e) => setNewForm((f) => ({ ...f, sickDays: parseInt(e.target.value) || 0 }))} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">พักร้อน</label>
            <input type="number" min="0" max="365" value={newForm.vacationDays} onChange={(e) => setNewForm((f) => ({ ...f, vacationDays: parseInt(e.target.value) || 0 }))} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[12px] text-slate-500 font-semibold uppercase tracking-wider">ลากิจ</label>
            <input type="number" min="0" max="365" value={newForm.personalDays} onChange={(e) => setNewForm((f) => ({ ...f, personalDays: parseInt(e.target.value) || 0 }))} className={inputCls} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400">
              <input type="checkbox" checked={newForm.isDefault} onChange={(e) => setNewForm((f) => ({ ...f, isDefault: e.target.checked }))} className="accent-green-500" />
              ตั้งเป็น Default
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={createPolicy}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-xl bg-green-600 hover:bg-green-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          สร้าง Policy
        </button>
      </div>
    </div>
  )
}
