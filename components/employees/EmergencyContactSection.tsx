'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Star, Loader2, X, Save } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import FormField from '@/components/profile/FormField'
import { profileInputClass, profileInputErrorClass } from '@/lib/profile-validators-client'
import {
  validateEmergencyContactRow,
  emergencyContactRowHasErrors,
  type EmergencyContactForm,
  type EmergencyContactErrors,
} from '@/lib/employee-subrecords-validation'
import type { PersonalRecordsEmergencyContact } from '@/lib/personal-records-load'

const EMPTY_FORM: EmergencyContactForm = { name: '', relationship: '', phone: '', altPhone: '', address: '', isPrimary: false }

export default function EmergencyContactSection({
  employeeId,
  contacts,
  onReload,
}: {
  employeeId: string
  contacts: PersonalRecordsEmergencyContact[]
  onReload: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<EmergencyContactForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<EmergencyContactErrors>({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const startAdd = () => { setAdding(true); setEditingId(null); setForm(EMPTY_FORM); setErrors({}) }
  const startEdit = (c: PersonalRecordsEmergencyContact) => {
    setEditingId(c.id); setAdding(false)
    setForm({ name: c.name, relationship: c.relationship, phone: c.phone, altPhone: c.altPhone ?? '', address: c.address ?? '', isPrimary: c.isPrimary })
    setErrors({})
  }
  const cancel = () => { setAdding(false); setEditingId(null) }

  const save = async () => {
    const v = validateEmergencyContactRow(form)
    setErrors(v)
    if (emergencyContactRowHasErrors(v)) { toast.error('กรุณาตรวจสอบข้อมูล'); return }

    setSaving(true)
    try {
      const url = editingId
        ? `/api/users/${employeeId}/emergency-contacts/${editingId}`
        : `/api/users/${employeeId}/emergency-contacts`
      const { ok, data, status } = await apiJson(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status)); return }
      toast.success(editingId ? 'แก้ไขผู้ติดต่อฉุกเฉินแล้ว' : 'เพิ่มผู้ติดต่อฉุกเฉินแล้ว')
      cancel()
      onReload()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setDeletingId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/users/${employeeId}/emergency-contacts/${id}`, { method: 'DELETE' })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'ลบไม่สำเร็จ', status)); return }
      toast.success('ลบผู้ติดต่อฉุกเฉินแล้ว')
      onReload()
    } finally {
      setDeletingId(null)
    }
  }

  const formOpen = adding || editingId !== null

  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">ผู้ติดต่อฉุกเฉิน</h3>
        {!formOpen && (
          <button type="button" onClick={startAdd} className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
            <Plus size={14} /> เพิ่มผู้ติดต่อ
          </button>
        )}
      </div>

      {contacts.length === 0 && !formOpen && (
        <p className="text-sm text-slate-500">ยังไม่มีข้อมูลผู้ติดต่อฉุกเฉิน</p>
      )}

      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white font-medium flex items-center gap-1.5">
                {c.name}
                {c.isPrimary && <Star size={12} className="text-amber-400 fill-amber-400" />}
              </p>
              <p className="text-xs text-slate-400">{c.relationship} · {c.phone}{c.altPhone ? ` · สำรอง ${c.altPhone}` : ''}</p>
              {c.address && <p className="text-xs text-slate-500 mt-0.5">{c.address}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button type="button" onClick={() => startEdit(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => remove(c.id)}
                disabled={deletingId === c.id}
                className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                {deletingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
            <FormField label="ความสัมพันธ์" required error={errors.relationship}>
              <input value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))} className={errors.relationship ? profileInputErrorClass : profileInputClass} />
            </FormField>
            <FormField label="เบอร์โทร" required error={errors.phone}>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} inputMode="tel" className={errors.phone ? profileInputErrorClass : profileInputClass} />
            </FormField>
            <FormField label="เบอร์สำรอง">
              <input value={form.altPhone} onChange={(e) => setForm((f) => ({ ...f, altPhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} inputMode="tel" className={profileInputClass} />
            </FormField>
          </div>
          <FormField label="ที่อยู่">
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={profileInputClass} />
          </FormField>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-white/70">
            <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))} className="w-4 h-4 accent-green-500" />
            ผู้ติดต่อหลัก (เลือกได้คนเดียว)
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
