'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, X, Save, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import FormField from '@/components/profile/FormField'
import { profileInputClass, profileInputErrorClass } from '@/lib/profile-validators-client'
import { formatLast4 } from '@/lib/last4-mask'
import { DEPENDENT_RELATION_LABELS } from '@/lib/dependent-relation-labels'
import { DEPENDENT_RELATION_TYPES } from '@/lib/register-form-validation'
import {
  validateDependentRow,
  dependentRowHasErrors,
  type DependentForm,
  type DependentErrors,
} from '@/lib/employee-subrecords-validation'
import type { PersonalRecordsDependent } from '@/lib/personal-records-load'

const EMPTY_FORM: DependentForm = { name: '', relationType: '', birthDate: '', nationalId: '', isTaxAllowance: false, note: '' }

function formatThaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DependentSection({
  employeeId,
  dependents,
  canViewSensitive,
  onReload,
}: {
  employeeId: string
  dependents: PersonalRecordsDependent[]
  /** HR_ADMIN only — same gate as the "ดูเลขเต็ม" button on the employee's
   *  own nationalId field. Computed server-side from the viewer's role. */
  canViewSensitive: boolean
  onReload: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<DependentForm>(EMPTY_FORM)
  // Present only when the HR admin explicitly revealed then edited the
  // nationalId during THIS edit session — mirrors the server's "absent
  // means untouched" PATCH contract exactly (see the route's own comment).
  const [nationalIdTouched, setNationalIdTouched] = useState(false)
  const [errors, setErrors] = useState<DependentErrors>({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [revealedIds, setRevealedIds] = useState<Record<string, string>>({})
  const [revealingId, setRevealingId] = useState<string | null>(null)

  const reveal = async (dependentId: string) => {
    setRevealingId(dependentId)
    try {
      const { ok, data, status } = await apiJson<{ nationalId: string | null }>(
        `/api/users/${employeeId}/dependents/${dependentId}/sensitive`,
      )
      if (!ok) { toast.error(apiErrorMessage(data, 'ดูเลขบัตรไม่สำเร็จ', status)); return }
      setRevealedIds((r) => ({ ...r, [dependentId]: data.nationalId ?? '' }))
    } finally {
      setRevealingId(null)
    }
  }

  const startAdd = () => { setAdding(true); setEditingId(null); setForm(EMPTY_FORM); setNationalIdTouched(false); setErrors({}) }
  const startEdit = (d: PersonalRecordsDependent) => {
    setEditingId(d.id); setAdding(false)
    setForm({
      name: d.name, relationType: d.relationType, birthDate: d.birthDate ?? '',
      nationalId: revealedIds[d.id] ?? '', isTaxAllowance: d.isTaxAllowance, note: d.note ?? '',
    })
    setNationalIdTouched(false)
    setErrors({})
  }
  const cancel = () => { setAdding(false); setEditingId(null) }

  const save = async () => {
    const v = validateDependentRow(form)
    setErrors(v)
    if (dependentRowHasErrors(v)) { toast.error('กรุณาตรวจสอบข้อมูล'); return }

    setSaving(true)
    try {
      const url = editingId
        ? `/api/users/${employeeId}/dependents/${editingId}`
        : `/api/users/${employeeId}/dependents`
      const body: Record<string, unknown> = {
        name: form.name, relationType: form.relationType, birthDate: form.birthDate,
        isTaxAllowance: form.isTaxAllowance, note: form.note,
      }
      // Only ever sent when adding a new dependent, or when explicitly
      // revealed+edited on an existing one — see nationalIdTouched above.
      if (!editingId || nationalIdTouched) body.nationalId = form.nationalId

      const { ok, data, status } = await apiJson(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status)); return }
      toast.success(editingId ? 'แก้ไขข้อมูลผู้อยู่ในอุปการะแล้ว' : 'เพิ่มผู้อยู่ในอุปการะแล้ว')
      cancel()
      onReload()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setDeletingId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/users/${employeeId}/dependents/${id}`, { method: 'DELETE' })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'ลบไม่สำเร็จ', status)); return }
      toast.success('ลบผู้อยู่ในอุปการะแล้ว')
      onReload()
    } finally {
      setDeletingId(null)
    }
  }

  const formOpen = adding || editingId !== null

  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">ผู้อยู่ในอุปการะ</h3>
        {!formOpen && (
          <button type="button" onClick={startAdd} className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
            <Plus size={14} /> เพิ่มผู้อยู่ในอุปการะ
          </button>
        )}
      </div>

      {dependents.length === 0 && !formOpen && (
        <p className="text-sm text-slate-500">ยังไม่มีข้อมูลผู้อยู่ในอุปการะ</p>
      )}

      <ul className="space-y-2">
        {dependents.map((d) => (
          <li key={d.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white font-medium">
                {d.name} <span className="text-xs text-slate-500">({DEPENDENT_RELATION_LABELS[d.relationType]})</span>
              </p>
              <p className="text-xs text-slate-400">
                {d.birthDate ? formatThaiDate(d.birthDate) : 'ไม่ระบุวันเกิด'}
                {d.isTaxAllowance && <span className="ml-2 px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 text-[10px]">ใช้สิทธิ์ลดหย่อนภาษี</span>}
              </p>
              {d.note && <p className="text-xs text-slate-500 mt-0.5">{d.note}</p>}
              {canViewSensitive && (
                <div className="flex items-center gap-1.5 mt-1.5 font-mono text-xs text-slate-400">
                  {revealedIds[d.id] ?? formatLast4(d.nationalIdLast4)}
                  {!revealedIds[d.id] && d.nationalIdLast4 && (
                    <button type="button" onClick={() => reveal(d.id)} disabled={revealingId === d.id} className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 disabled:opacity-50">
                      {revealingId === d.id ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />} ดูเต็ม
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <button type="button" onClick={() => startEdit(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => remove(d.id)}
                disabled={deletingId === d.id}
                className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                {deletingId === d.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {formOpen && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="ชื่อ" required error={errors.name}>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={errors.name ? profileInputErrorClass : profileInputClass} />
            </FormField>
            <FormField label="ความสัมพันธ์" required error={errors.relationType}>
              <select value={form.relationType} onChange={(e) => setForm((f) => ({ ...f, relationType: e.target.value as DependentForm['relationType'] }))} className={errors.relationType ? profileInputErrorClass : profileInputClass}>
                <option value="" className="bg-slate-900">— เลือก —</option>
                {DEPENDENT_RELATION_TYPES.map((r) => <option key={r} value={r} className="bg-slate-900">{DEPENDENT_RELATION_LABELS[r]}</option>)}
              </select>
            </FormField>
            <FormField label="วันเกิด">
              <input type="date" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} className={profileInputClass} />
            </FormField>
            <FormField label="เลขบัตรประชาชน" hint={canViewSensitive ? undefined : 'เฉพาะ HR_ADMIN แก้ไขได้'}>
              {!canViewSensitive ? (
                <p className="py-2.5 text-sm text-white/40 font-mono">{editingId ? formatLast4(dependents.find((d) => d.id === editingId)?.nationalIdLast4) : 'ยังไม่ได้กรอก'}</p>
              ) : editingId && !nationalIdTouched ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 py-2.5 text-sm text-white/70 font-mono">
                    {revealedIds[editingId] ?? formatLast4(dependents.find((d) => d.id === editingId)?.nationalIdLast4)}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!revealedIds[editingId]) await reveal(editingId)
                      setForm((f) => ({ ...f, nationalId: revealedIds[editingId] ?? '' }))
                      setNationalIdTouched(true)
                    }}
                    className="shrink-0 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-medium hover:bg-white/10"
                  >
                    แก้เลขบัตร
                  </button>
                </div>
              ) : (
                <input
                  value={form.nationalId}
                  onChange={(e) => { setForm((f) => ({ ...f, nationalId: e.target.value.replace(/\D/g, '').slice(0, 13) })); setNationalIdTouched(true) }}
                  inputMode="numeric"
                  className={profileInputClass}
                />
              )}
            </FormField>
          </div>
          <FormField label="หมายเหตุ">
            <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={profileInputClass} />
          </FormField>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-white/70">
            <input type="checkbox" checked={form.isTaxAllowance} onChange={(e) => setForm((f) => ({ ...f, isTaxAllowance: e.target.checked }))} className="w-4 h-4 accent-green-500" />
            ใช้สิทธิ์ลดหย่อนภาษี
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} บันทึก
            </button>
            <button type="button" onClick={cancel} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 text-white/60 text-sm hover:bg-white/10">
              <X size={14} /> ยกเลิก
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
