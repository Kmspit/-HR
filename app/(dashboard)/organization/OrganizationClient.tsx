'use client'

import { useState, useEffect, useCallback } from 'react'
import { Layers, GitBranch, Grid3X3, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type Branch = { id: string; code: string; name: string }
type Tab = 'divisions' | 'departments' | 'sections'

const TABS: { id: Tab; label: string; icon: typeof Layers }[] = [
  { id: 'divisions', label: 'ฝ่าย', icon: Layers },
  { id: 'departments', label: 'แผนก', icon: GitBranch },
  { id: 'sections', label: 'ส่วนงาน', icon: Grid3X3 },
]

export default function OrganizationClient({ branches }: { branches: Branch[] }) {
  const [branchId, setBranchId] = useState(branches.find((b) => b.code === 'HQ')?.id ?? branches[0]?.id ?? '')
  const [tab, setTab] = useState<Tab>('divisions')
  const [divisions, setDivisions] = useState<Record<string, unknown>[]>([])
  const [departments, setDepartments] = useState<Record<string, unknown>[]>([])
  const [sections, setSections] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ code: '', name: '', nameEn: '', divisionId: '', departmentId: '', isActive: true })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    const [d, dep, s] = await Promise.all([
      apiJson<{ divisions?: Record<string, unknown>[] }>(`/api/org/divisions?branchId=${branchId}`),
      apiJson<{ departments?: Record<string, unknown>[] }>(`/api/org/departments?branchId=${branchId}`),
      apiJson<{ sections?: Record<string, unknown>[] }>(`/api/org/sections?branchId=${branchId}`),
    ])
    if (d.ok && d.data.divisions) setDivisions(d.data.divisions)
    if (dep.ok && dep.data.departments) setDepartments(dep.data.departments)
    if (s.ok && s.data.sections) setSections(s.data.sections)
    setLoading(false)
  }, [branchId])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm({ code: '', name: '', nameEn: '', divisionId: divisions[0]?.id as string ?? '', departmentId: departments[0]?.id as string ?? '', isActive: true })
    setShowForm(true)
  }

  const openEdit = (row: Record<string, unknown>) => {
    setEditingId(row.id as string)
    setForm({
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      nameEn: String(row.nameEn ?? ''),
      divisionId: String(row.divisionId ?? ''),
      departmentId: String(row.departmentId ?? ''),
      isActive: Boolean(row.isActive ?? true),
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('กรุณาระบุรหัสและชื่อ')
      return
    }
    setSaving(true)
    try {
      let url = ''
      let body: Record<string, unknown> = {
        code: form.code.trim(),
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || undefined,
        isActive: form.isActive,
      }
      if (tab === 'divisions') {
        url = editingId ? `/api/org/divisions/${editingId}` : '/api/org/divisions'
        body = { ...body, branchId }
      } else if (tab === 'departments') {
        if (!form.divisionId) { toast.error('เลือกฝ่าย'); setSaving(false); return }
        url = editingId ? `/api/org/departments/${editingId}` : '/api/org/departments'
        body = { ...body, divisionId: form.divisionId }
      } else {
        if (!form.departmentId) { toast.error('เลือกแผนก'); setSaving(false); return }
        url = editingId ? `/api/org/sections/${editingId}` : '/api/org/sections'
        body = { ...body, departmentId: form.departmentId }
      }
      const { ok, data, status } = await apiJson(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status))
        return
      }
      toast.success('บันทึกแล้ว')
      setShowForm(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return
    const base = tab === 'divisions' ? 'divisions' : tab === 'departments' ? 'departments' : 'sections'
    const { ok, data, status } = await apiJson(`/api/org/${base}/${id}`, { method: 'DELETE' })
    if (!ok) toast.error(apiErrorMessage(data as Record<string, unknown>, 'ลบไม่สำเร็จ', status))
    else { toast.success('ลบแล้ว'); load() }
  }

  const list = tab === 'divisions' ? divisions : tab === 'departments' ? departments : sections

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <label className="text-xs text-slate-500 block mb-1">สาขา</label>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id} className="bg-slate-900">{b.name}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-900 p-1 border border-white/5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500">{loading ? 'กำลังโหลด...' : `${list.length} รายการ`}</p>
        <button type="button" onClick={openCreate} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
          <Plus className="w-4 h-4" /> เพิ่ม{TABS.find((t) => t.id === tab)?.label}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-blue-500/30 bg-slate-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">{editingId ? 'แก้ไข' : 'เพิ่ม'}{TABS.find((t) => t.id === tab)?.label}</p>
          {tab === 'departments' && (
            <select value={form.divisionId} onChange={(e) => setForm((f) => ({ ...f, divisionId: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
              <option value="">— เลือกฝ่าย —</option>
              {divisions.map((d) => (
                <option key={String(d.id)} value={String(d.id)}>{String(d.name)}</option>
              ))}
            </select>
          )}
          {tab === 'sections' && (
            <select value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
              <option value="">— เลือกแผนก —</option>
              {departments.map((d) => (
                <option key={String(d.id)} value={String(d.id)}>{String(d.name)}</option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="รหัส" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            <input placeholder="ชื่อ" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="accent-blue-500" />
            เปิดใช้งาน
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="flex-1 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'บันทึก'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400">ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {list.map((row) => (
          <div key={String(row.id)} className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">
                <span className="text-blue-400 font-mono text-xs mr-2">{String(row.code)}</span>
                {String(row.name)}
              </p>
              {tab === 'departments' && (
                <p className="text-[10px] text-slate-500">ฝ่าย: {String(row.divisionName ?? '—')}</p>
              )}
              {tab === 'sections' && (
                <p className="text-[10px] text-slate-500">{String(row.divisionName)} · {String(row.departmentName)}</p>
              )}
              <p className="text-[10px] text-slate-600">
                พนักงาน {Number(row.userCount ?? 0)}
                {tab === 'divisions' && ` · แผนก ${Number(row.departmentCount ?? 0)}`}
                {tab === 'departments' && ` · ส่วนงาน ${Number(row.sectionCount ?? 0)}`}
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => openEdit(row)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"><Pencil className="w-4 h-4" /></button>
              <button type="button" onClick={() => remove(String(row.id))} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {!loading && list.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-8">ยังไม่มีข้อมูล — กดเพิ่มรายการ</p>
        )}
      </div>
    </div>
  )
}
