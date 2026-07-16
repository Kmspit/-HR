'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Plus, Pencil, Trash2, Loader2, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { HOLIDAY_TYPE_LABELS, HOLIDAY_TYPE_OPTIONS } from '@/lib/holiday-types'
import type { HolidayType } from '@prisma/client'
import { formatThaiDate } from '@/lib/utils'

export type HolidayItem = {
  id: string
  holidayName: string
  holidayDate: string
  holidayType: HolidayType
  repeatEveryYear: boolean
  branchId: string | null
  branchLabel: string
}

type BranchOpt = { id: string; label: string }

const emptyForm = {
  holidayName: '',
  holidayDate: '',
  holidayType: 'PUBLIC_HOLIDAY' as HolidayType,
  repeatEveryYear: false,
  branchId: '' as string,
}

const TYPE_BADGE: Record<HolidayType, string> = {
  SATURDAY: 'dark:bg-indigo-500/15 light:bg-indigo-50 dark:text-indigo-300 light:text-indigo-700',
  SUNDAY: 'dark:bg-violet-500/15 light:bg-violet-50 dark:text-violet-300 light:text-violet-700',
  PUBLIC_HOLIDAY: 'dark:bg-amber-500/15 light:bg-amber-50 dark:text-amber-300 light:text-amber-700',
  COMPANY_HOLIDAY: 'dark:bg-emerald-500/15 light:bg-emerald-50 dark:text-emerald-300 light:text-emerald-700',
}

const inputCls =
  'dashboard-select w-full rounded-xl border dark:border-slate-600 light:border-slate-200 dark:bg-slate-800 light:bg-white px-3 py-2.5 text-sm dark:text-white light:text-slate-800 outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500'

type Props = {
  initialHolidays: HolidayItem[]
  branches: BranchOpt[]
  calendarYear: number
  calendarMonth: number
  onHolidaysChange: (holidays: HolidayItem[]) => void
  editHolidayId?: string | null
}

export default function HolidayManagePanel({
  initialHolidays,
  branches,
  calendarYear,
  calendarMonth,
  onHolidaysChange,
  editHolidayId,
}: Props) {
  const [list, setList] = useState(initialHolidays)
  const [filterBranch, setFilterBranch] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const syncList = (next: HolidayItem[]) => {
    setList(next)
    onHolidaysChange(next)
  }

  const refresh = async () => {
    const q = filterBranch !== 'all' ? `?branchId=${filterBranch}` : ''
    const { ok, data } = await apiJson<{ holidays?: HolidayItem[] }>(`/api/holidays${q}`)
    if (ok && data.holidays) syncList(data.holidays)
  }

  const filtered = useMemo(() => {
    return list.filter((h) => {
      if (filterType !== 'all' && h.holidayType !== filterType) return false
      if (filterBranch === 'all') return true
      return h.branchId === null || h.branchId === filterBranch
    })
  }, [list, filterBranch, filterType])

  const openCreate = (prefillDate?: string) => {
    setEditingId(null)
    setForm({
      ...emptyForm,
      holidayDate: prefillDate ?? `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`,
      branchId: filterBranch !== 'all' ? filterBranch : '',
    })
    setShowForm(true)
  }

  const openEdit = (h: HolidayItem) => {
    setEditingId(h.id)
    setForm({
      holidayName: h.holidayName,
      holidayDate: h.holidayDate,
      holidayType: h.holidayType,
      repeatEveryYear: h.repeatEveryYear,
      branchId: h.branchId ?? '',
    })
    setShowForm(true)
  }

  useEffect(() => {
    if (!editHolidayId) return
    const h = list.find((x) => x.id === editHolidayId)
    if (!h) return
    setEditingId(h.id)
    setForm({
      holidayName: h.holidayName,
      holidayDate: h.holidayDate,
      holidayType: h.holidayType,
      repeatEveryYear: h.repeatEveryYear,
      branchId: h.branchId ?? '',
    })
    setShowForm(true)
  }, [editHolidayId, list])

  const save = async () => {
    if (!form.holidayName.trim() || !form.holidayDate) {
      toast.error('กรุณากรอกชื่อและวันที่')
      return
    }
    setSaving(true)
    try {
      const payload = {
        holidayName: form.holidayName.trim(),
        holidayDate: form.holidayDate,
        holidayType: form.holidayType,
        repeatEveryYear: form.repeatEveryYear,
        branchId: form.branchId || null,
      }
      const { ok, data, status } = editingId
        ? await apiJson(`/api/holidays/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await apiJson('/api/holidays', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status))
        return
      }
      toast.success(editingId ? 'อัปเดตวันหยุดแล้ว — ปฏิทินอัปเดตแล้ว' : 'เพิ่มวันหยุดแล้ว — แสดงในปฏิทินแล้ว')
      setShowForm(false)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`ลบวันหยุด "${name}" ?`)) return
    const { ok, data, status } = await apiJson(`/api/holidays/${id}`, { method: 'DELETE' })
    if (!ok) {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'ลบไม่สำเร็จ', status))
      return
    }
    toast.success('ลบวันหยุดแล้ว')
    const next = list.filter((h) => h.id !== id)
    syncList(next)
  }

  return (
    <section className="glass-card rounded-2xl p-4 md:p-5 space-y-4 border dark:border-emerald-500/20 light:border-emerald-200">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold dark:text-white light:text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-emerald-400" />
            จัดการวันหยุดบริษัท
          </h3>
          <p className="text-xs mt-1 dark:text-slate-500 light:text-slate-500">
            เฉพาะ HR/Admin แก้ไขได้ — พนักงานทุกคนเห็นบนปฏิทินด้านบน
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> เพิ่มวันหยุด
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="field-1" className="text-xs dark:text-slate-500 light:text-slate-500 block mb-1">กรองสาขา</label>
          <select id="field-1" value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="field-2" className="text-xs dark:text-slate-500 light:text-slate-500 block mb-1">ประเภท</label>
          <select id="field-2" value={filterType} onChange={(e) => setFilterType(e.target.value)} className={inputCls}>
            <option value="all">ทุกประเภท</option>
            {HOLIDAY_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border dark:border-green-500/30 light:border-green-200 dark:bg-white/[0.02] light:bg-slate-50 p-4 space-y-3">
          <p className="text-sm font-medium dark:text-white light:text-slate-800">
            {editingId ? 'แก้ไขวันหยุด' : 'เพิ่มวันหยุดใหม่'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="field-3" className="text-xs dark:text-slate-500 block mb-1">ชื่อวันหยุด *</label>
              <input id="field-3"
                value={form.holidayName}
                onChange={(e) => setForm((f) => ({ ...f, holidayName: e.target.value }))}
                className={inputCls}
                placeholder="เช่น วันสงกรานต์"
              />
            </div>
            <div>
              <label htmlFor="field-4" className="text-xs dark:text-slate-500 block mb-1">วันที่อ้างอิง *</label>
              <input id="field-4"
                type="date"
                value={form.holidayDate}
                onChange={(e) => setForm((f) => ({ ...f, holidayDate: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="field-5" className="text-xs dark:text-slate-500 block mb-1">ประเภท *</label>
              <select id="field-5"
                value={form.holidayType}
                onChange={(e) => setForm((f) => ({ ...f, holidayType: e.target.value as HolidayType }))}
                className={inputCls}
              >
                {HOLIDAY_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="field-6" className="text-xs dark:text-slate-500 block mb-1">สาขา</label>
              <select id="field-6"
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                className={inputCls}
              >
                <option value="">ทุกสาขา</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 sm:col-span-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.repeatEveryYear}
                onChange={(e) => setForm((f) => ({ ...f, repeatEveryYear: e.target.checked }))}
                className="w-4 h-4 accent-emerald-500"
              />
              <span className="text-sm dark:text-slate-300 light:text-slate-700 flex items-center gap-1">
                <Repeat className="w-3.5 h-3.5" /> ซ้ำทุกปี
              </span>
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm dark:text-slate-400 hover:bg-white/5"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              บันทึก
            </button>
          </div>
        </div>
      )}

      <div className="max-h-56 overflow-y-auto overflow-x-auto rounded-xl border dark:border-white/10 light:border-slate-200">
        <table className="w-full text-sm min-w-[420px]">
          <thead className="sticky top-0 dark:bg-slate-900/95 light:bg-slate-50">
            <tr className="border-b dark:border-white/10 light:border-slate-200">
              {['ชื่อ', 'วันที่', 'ประเภท', 'สาขา', ''].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[12px] font-semibold uppercase dark:text-slate-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-white/5 light:divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-xs dark:text-slate-500">
                  ยังไม่มีรายการ — กดเพิ่มวันหยุด
                </td>
              </tr>
            ) : (
              filtered.map((h) => (
                <tr key={h.id} className="dark:hover:bg-white/5 light:hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium dark:text-white light:text-slate-800 text-xs">
                    {h.holidayName}
                  </td>
                  <td className="px-3 py-2 text-xs dark:text-slate-400 whitespace-nowrap">
                    {formatThaiDate(h.holidayDate)}
                    {h.repeatEveryYear ? ' ↻' : ''}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${TYPE_BADGE[h.holidayType]}`}>
                      {HOLIDAY_TYPE_LABELS[h.holidayType]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[12px] dark:text-slate-400">{h.branchLabel}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-0.5 justify-end">
                      <button type="button" onClick={() => openEdit(h)} className="p-1.5 rounded-lg hover:bg-white/10">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(h.id, h.holidayName)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
