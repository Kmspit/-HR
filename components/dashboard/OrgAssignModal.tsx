'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type Opt = { id: string; name: string; divisionId?: string; departmentId?: string }

type Props = {
  userId: string
  userName: string
  branchId: string | null
  onClose: () => void
}

export default function OrgAssignModal({ userId, userName, branchId, onClose }: Props) {
  const router = useRouter()
  const [divisions, setDivisions] = useState<Opt[]>([])
  const [departments, setDepartments] = useState<Opt[]>([])
  const [sections, setSections] = useState<Opt[]>([])
  const [divisionId, setDivisionId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!branchId) {
      setLoading(false)
      return
    }
    const q = `branchId=${branchId}`
    Promise.all([
      apiJson<{ divisions?: Opt[] }>(`/api/org/divisions?${q}`),
      apiJson<{ departments?: Opt[] }>(`/api/org/departments?${q}`),
      apiJson<{ sections?: Opt[] }>(`/api/org/sections?${q}`),
    ]).then(([d, dep, s]) => {
      if (d.ok && d.data.divisions) setDivisions(d.data.divisions)
      if (dep.ok && dep.data.departments) setDepartments(dep.data.departments)
      if (s.ok && s.data.sections) setSections(s.data.sections)
      setLoading(false)
    })
  }, [branchId])

  const filteredDepts = departments.filter((d) => !divisionId || d.divisionId === divisionId)
  const filteredSections = sections.filter((s) => !departmentId || s.departmentId === departmentId)

  const save = async () => {
    if (!divisionId || !departmentId || !sectionId) {
      toast.error('เลือกฝ่าย แผนก และส่วนงานให้ครบ')
      return
    }
    setSaving(true)
    const { ok, data, status } = await apiJson(`/api/users/${userId}/org`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ divisionId, departmentId, sectionId }),
    })
    setSaving(false)
    if (!ok) {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status))
      return
    }
    toast.success('กำหนดฝ่าย/แผนก/ส่วนงานแล้ว')
    onClose()
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white">กำหนดโครงสร้างองค์กร</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-400 mb-4">{userName}</p>
        {loading ? (
          <p className="text-sm text-slate-500 py-4 text-center">กำลังโหลด...</p>
        ) : !branchId ? (
          <p className="text-sm text-amber-400">พนักงานยังไม่มีสาขา — กำหนดสาขาก่อน</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">ฝ่าย *</label>
              <select value={divisionId} onChange={(e) => { setDivisionId(e.target.value); setDepartmentId(''); setSectionId('') }} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white">
                <option value="">— เลือกฝ่าย —</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">แผนก *</label>
              <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setSectionId('') }} disabled={!divisionId} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white disabled:opacity-50">
                <option value="">— เลือกแผนก —</option>
                {filteredDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">ส่วนงาน *</label>
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!departmentId} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white disabled:opacity-50">
                <option value="">— เลือกส่วนงาน —</option>
                {filteredSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !branchId}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'บันทึกการกำหนด'}
        </button>
      </div>
    </div>
  )
}
