'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Plus, Pencil, Trash2, Loader2, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { HOLIDAY_TYPE_LABELS, HOLIDAY_TYPE_OPTIONS } from '@/lib/holiday-types'
import type { HolidayType } from '@prisma/client'
import { formatThaiDate } from '@/lib/utils'

type Holiday = {
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

export default function HolidaysClient({
  initialHolidays,
  branches,
}: {
  initialHolidays: Holiday[]
  branches: BranchOpt[]
}) {
  const [list, setList] = useState(initialHolidays)
  const [filterBranch, setFilterBranch] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    const q = filterBranch !== 'all' ? `?branchId=${filterBranch}` : ''
    const { ok, data } = await apiJson<{ holidays?: Holiday[] }>(`/api/holidays${q}`)
    if (ok && data.holidays) setList(data.holidays)
  }

  const filtered = useMemo(() => {
    return list.filter((h) => {
      if (filterType !== 'all' && h.holidayType !== filterType) return false
      if (filterBranch === 'all') return true
      return h.branchId === null || h.branchId === filterBranch
    })
  }, [list, filterBranch, filterType])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm, branchId: filterBranch !== 'all' ? filterBranch : '' })
    setShowForm(true)
  }

  const openEdit = (h: Holiday) => {
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
      toast.success(editingId ? 'อัปเดตวันหยุดแล้ว' : 'เพิ่มวันหยุดแล้ว')
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
    setList((prev) => prev.filter((h) => h.id !== id))
  }

  const inputCls =
    'w-full rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-slate-800/60 light:bg-white px-3 py-2.5 text-sm dark:text-white light:text-slate-800 outline-none focus:border-blue-500/50'

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm dark:text-slate-400 light:text-slate-600 flex-1">
          ระบบลาจะปิดอัตโนมัติในวันหยุดตามสาขาของพนักงาน
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> เพิ่มวันหยุด
        </button>
      </div>

      <div className="glass-card rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs dark:text-slate-500 light:text-slate-500 block mb-1">กรองสาขา</label>
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className={inputCls}
          >
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs dark:text-slate-500 light:text-slate-500 block mb-1">ประเภท</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={inputCls}
          >
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
        <div className="glass-card rounded-2xl p-5 space-y-4 border dark:border-blue-500/30 light:border-blue-200">
          <h3 className="font-semibold dark:text-white light:text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-400" />
            {editingId ? 'แก้ไขวันหยุด' : 'เพิ่มวันหยุดใหม่'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs dark:text-slate-500 light:text-slate-500 block mb-1">
                ชื่อวันหยุด *
              </label>
              <input
                value={form.holidayName}
                onChange={(e) => setForm((f) => ({ ...f, holidayName: e.target.value }))}
                placeholder="เช่น วันสงกรานต์"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs dark:text-slate-500 light:text-slate-500 block mb-1">
                วันที่อ้างอิง *
              </label>
              <input
                type="date"
                value={form.holidayDate}
                onChange={(e) => setForm((f) => ({ ...f, holidayDate: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs dark:text-slate-500 light:text-slate-500 block mb-1">ประเภท *</label>
              <select
                value={form.holidayType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, holidayType: e.target.value as HolidayType }))
                }
                className={inputCls}
              >
                {HOLIDAY_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] mt-1 dark:text-slate-500 light:text-slate-500">
                {HOLIDAY_TYPE_OPTIONS.find((t) => t.value === form.holidayType)?.desc}
              </p>
            </div>
            <div>
              <label className="text-xs dark:text-slate-500 light:text-slate-500 block mb-1">สาขา</label>
              <select
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
            <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
              <input
                type="checkbox"
                checked={form.repeatEveryYear}
                onChange={(e) => setForm((f) => ({ ...f, repeatEveryYear: e.target.checked }))}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm dark:text-slate-300 light:text-slate-700 flex items-center gap-1">
                <Repeat className="w-3.5 h-3.5" /> ซ้ำทุกปี (เสาร์/อาทิตย์ = ทุกสัปดาห์)
              </span>
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm dark:text-slate-400 light:text-slate-600 hover:bg-white/5"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              บันทึก
            </button>
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-white/10 light:border-slate-200">
                {['ชื่อวันหยุด', 'วันที่', 'ประเภท', 'สาขา', 'ซ้ำทุกปี', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[10px] font-semibold uppercase dark:text-slate-500 light:text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-white/5 light:divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center dark:text-slate-500 light:text-slate-500">
                    ยังไม่มีวันหยุด — กดเพิ่มวันหยุดเพื่อเริ่มต้น
                  </td>
                </tr>
              ) : (
                filtered.map((h) => (
                  <tr key={h.id} className="dark:hover:bg-white/5 light:hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium dark:text-white light:text-slate-800">
                      {h.holidayName}
                    </td>
                    <td className="px-4 py-3 dark:text-slate-400 light:text-slate-600 whitespace-nowrap">
                      {formatThaiDate(h.holidayDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${TYPE_BADGE[h.holidayType]}`}
                      >
                        {HOLIDAY_TYPE_LABELS[h.holidayType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs dark:text-slate-400 light:text-slate-600">
                      {h.branchLabel}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {h.repeatEveryYear ? (
                        <Repeat className="w-4 h-4 inline text-blue-400" />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(h)}
                          className="p-2 rounded-lg dark:hover:bg-white/10 light:hover:bg-slate-100 dark:text-slate-400"
                          aria-label="แก้ไข"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(h.id, h.holidayName)}
                          className="p-2 rounded-lg dark:hover:bg-red-500/10 light:hover:bg-red-50 text-red-400"
                          aria-label="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
