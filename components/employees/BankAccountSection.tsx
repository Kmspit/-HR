'use client'

import { useState } from 'react'
import { Plus, Pencil, Ban, Loader2, X, Save, Eye, Star } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import FormField from '@/components/profile/FormField'
import { profileInputClass, profileInputErrorClass } from '@/lib/profile-validators-client'
import { formatLast4 } from '@/lib/last4-mask'
import { THAI_BANKS } from '@/lib/thai-banks'
import {
  validateBankAccountRow,
  bankAccountRowHasErrors,
  type BankAccountForm,
  type BankAccountErrors,
} from '@/lib/employee-subrecords-validation'
import type { PersonalRecordsBankAccount } from '@/lib/personal-records-load'

const EMPTY_FORM: BankAccountForm = { bankCode: '', accountNumber: '', accountName: '', accountType: '', isPrimary: false }

export default function BankAccountSection({
  employeeId,
  accounts,
  canViewSensitive,
  onReload,
}: {
  employeeId: string
  accounts: PersonalRecordsBankAccount[]
  /** HR_ADMIN only — same gate as the employee's own nationalId reveal. */
  canViewSensitive: boolean
  onReload: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<BankAccountForm>(EMPTY_FORM)
  const [accountNumberTouched, setAccountNumberTouched] = useState(false)
  const [errors, setErrors] = useState<BankAccountErrors>({})
  const [saving, setSaving] = useState(false)
  const [disablingId, setDisablingId] = useState<string | null>(null)

  const [revealedIds, setRevealedIds] = useState<Record<string, string>>({})
  const [revealingId, setRevealingId] = useState<string | null>(null)

  const reveal = async (bankAccountId: string) => {
    setRevealingId(bankAccountId)
    try {
      const { ok, data, status } = await apiJson<{ accountNumber: string }>(
        `/api/users/${employeeId}/bank-accounts/${bankAccountId}/sensitive`,
      )
      if (!ok) { toast.error(apiErrorMessage(data, 'ดูเลขบัญชีไม่สำเร็จ', status)); return }
      setRevealedIds((r) => ({ ...r, [bankAccountId]: data.accountNumber }))
    } finally {
      setRevealingId(null)
    }
  }

  const startAdd = () => { setAdding(true); setEditingId(null); setForm(EMPTY_FORM); setAccountNumberTouched(false); setErrors({}) }
  const startEdit = (a: PersonalRecordsBankAccount) => {
    setEditingId(a.id); setAdding(false)
    setForm({ bankCode: a.bankCode, accountNumber: '', accountName: a.accountName, accountType: a.accountType ?? '', isPrimary: a.isPrimary })
    setAccountNumberTouched(false)
    setErrors({})
  }
  const cancel = () => { setAdding(false); setEditingId(null) }

  const save = async () => {
    // accountNumber is only required at creation, or when the HR admin has
    // explicitly revealed+edited it on an existing account — same
    // untouched-field contract as the dependent nationalId flow.
    const requireAccountNumber = !editingId || accountNumberTouched
    const v = validateBankAccountRow({ ...form, accountNumber: requireAccountNumber ? form.accountNumber : '9999999999' })
    if (!requireAccountNumber) delete v.accountNumber
    setErrors(v)
    if (bankAccountRowHasErrors(v)) { toast.error('กรุณาตรวจสอบข้อมูล'); return }

    setSaving(true)
    try {
      const url = editingId
        ? `/api/users/${employeeId}/bank-accounts/${editingId}`
        : `/api/users/${employeeId}/bank-accounts`
      const body: Record<string, unknown> = {
        bankCode: form.bankCode, accountName: form.accountName, accountType: form.accountType, isPrimary: form.isPrimary,
      }
      if (requireAccountNumber) body.accountNumber = form.accountNumber

      const { ok, data, status } = await apiJson(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status)); return }
      toast.success(editingId ? 'แก้ไขบัญชีธนาคารแล้ว' : 'เพิ่มบัญชีธนาคารแล้ว')
      cancel()
      onReload()
    } finally {
      setSaving(false)
    }
  }

  const disable = async (id: string) => {
    setDisablingId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/users/${employeeId}/bank-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'ปิดใช้งานไม่สำเร็จ', status)); return }
      toast.success('ปิดใช้งานบัญชีแล้ว')
      onReload()
    } finally {
      setDisablingId(null)
    }
  }

  const reactivate = async (id: string) => {
    setDisablingId(id)
    try {
      const { ok, data, status } = await apiJson(`/api/users/${employeeId}/bank-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (!ok) { toast.error(apiErrorMessage(data as Record<string, unknown>, 'เปิดใช้งานไม่สำเร็จ', status)); return }
      toast.success('เปิดใช้งานบัญชีอีกครั้งแล้ว')
      onReload()
    } finally {
      setDisablingId(null)
    }
  }

  const formOpen = adding || editingId !== null
  const activeAccounts = accounts.filter((a) => a.isActive)
  const disabledAccounts = accounts.filter((a) => !a.isActive)

  const renderAccount = (a: PersonalRecordsBankAccount) => (
    <li key={a.id} className={`rounded-xl border p-3.5 flex items-start justify-between gap-3 ${a.isActive ? 'border-white/8 bg-white/[0.02]' : 'border-white/5 bg-white/[0.01] opacity-60'}`}>
      <div className="min-w-0">
        <p className="text-sm text-white font-medium flex items-center gap-1.5">
          {THAI_BANKS.find((b) => b.code === a.bankCode)?.name ?? a.bankCode}
          {a.isPrimary && <Star size={12} className="text-amber-400 fill-amber-400" />}
          {!a.isActive && <span className="px-1.5 py-0.5 rounded bg-slate-600/30 text-slate-400 text-[10px]">ปิดใช้งาน</span>}
        </p>
        <p className="text-xs text-slate-400">{a.accountName}{a.accountType ? ` · ${a.accountType}` : ''}</p>
        {canViewSensitive && (
          <div className="flex items-center gap-1.5 mt-1.5 font-mono text-xs text-slate-400">
            {revealedIds[a.id] ?? formatLast4(a.accountNumberLast4)}
            {!revealedIds[a.id] && (
              <button type="button" onClick={() => reveal(a.id)} disabled={revealingId === a.id} className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 disabled:opacity-50">
                {revealingId === a.id ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />} ดูเต็ม
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button type="button" onClick={() => startEdit(a)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
          <Pencil size={14} />
        </button>
        {a.isActive ? (
          <button
            type="button"
            onClick={() => disable(a.id)}
            disabled={disablingId === a.id}
            title="ปิดใช้งาน (ไม่ลบ)"
            className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            {disablingId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => reactivate(a.id)}
            disabled={disablingId === a.id}
            className="px-2 py-1 rounded-lg text-[11px] text-green-400 hover:bg-green-500/10 disabled:opacity-50"
          >
            {disablingId === a.id ? <Loader2 size={12} className="animate-spin" /> : 'เปิดใช้งาน'}
          </button>
        )}
      </div>
    </li>
  )

  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">บัญชีธนาคาร</h3>
        {!formOpen && (
          <button type="button" onClick={startAdd} className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
            <Plus size={14} /> เพิ่มบัญชี
          </button>
        )}
      </div>

      {activeAccounts.length === 0 && disabledAccounts.length === 0 && !formOpen && (
        <p className="text-sm text-slate-500">ยังไม่มีข้อมูลบัญชีธนาคาร</p>
      )}

      {activeAccounts.length > 0 && <ul className="space-y-2">{activeAccounts.map(renderAccount)}</ul>}

      {disabledAccounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 pt-1">บัญชีที่ปิดใช้งาน</p>
          <ul className="space-y-2">{disabledAccounts.map(renderAccount)}</ul>
        </div>
      )}

      {formOpen && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="ธนาคาร" required error={errors.bankCode}>
              <select value={form.bankCode} onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value }))} className={errors.bankCode ? profileInputErrorClass : profileInputClass}>
                <option value="" className="bg-slate-900">— เลือกธนาคาร —</option>
                {THAI_BANKS.map((b) => <option key={b.code} value={b.code} className="bg-slate-900">{b.name}</option>)}
              </select>
            </FormField>
            <FormField label="ชื่อบัญชี" required error={errors.accountName}>
              <input value={form.accountName} onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))} className={errors.accountName ? profileInputErrorClass : profileInputClass} />
            </FormField>
            <FormField label="เลขบัญชี" required={!editingId} error={errors.accountNumber}>
              {editingId && !accountNumberTouched ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 py-2.5 text-sm text-white/70 font-mono">
                    {revealedIds[editingId] ?? formatLast4(accounts.find((a) => a.id === editingId)?.accountNumberLast4)}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!revealedIds[editingId]) await reveal(editingId)
                      setForm((f) => ({ ...f, accountNumber: revealedIds[editingId] ?? '' }))
                      setAccountNumberTouched(true)
                    }}
                    className="shrink-0 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-medium hover:bg-white/10"
                  >
                    แก้เลขบัญชี
                  </button>
                </div>
              ) : (
                <input
                  value={form.accountNumber}
                  onChange={(e) => { setForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 15) })); setAccountNumberTouched(true) }}
                  inputMode="numeric"
                  className={errors.accountNumber ? profileInputErrorClass : profileInputClass}
                />
              )}
            </FormField>
            <FormField label="ประเภทบัญชี">
              <input value={form.accountType} onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))} placeholder="ออมทรัพย์" className={profileInputClass} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-white/70">
            <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))} className="w-4 h-4 accent-green-500" />
            บัญชีหลัก (เลือกได้บัญชีเดียว)
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
