'use client'

import { useState, useEffect, useCallback } from 'react'
import { modalFieldInput } from '@/lib/theme-classes'
import PortalModal from '@/components/ui/PortalModal'

type SopStep  = { order: number; title: string; detail: string }
type CheckItem = { text: string; required: boolean }

type SopDocument = {
  id: string
  sopCode: string
  title: string
  department: string
  description: string | null
  steps: string
  checklist: string
  relatedDocs: string
  status: string
  version: number
  note: string | null
  createdBy: { name: string }
  approvedBy: { name: string } | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  versions: { id: string; version: number; changeNote: string | null; changedBy: { name: string }; createdAt: string }[]
  _count: { versions: number }
}

const DEPARTMENTS = [
  { value: 'ALL',     label: 'ทุกฝ่าย' },
  { value: 'DEBT',    label: 'ฝ่ายเร่งรัดหนี้' },
  { value: 'LAW',     label: 'ฝ่ายกฎหมาย' },
  { value: 'ASSET',   label: 'ฝ่ายสืบทรัพย์' },
  { value: 'ENFORCE', label: 'ฝ่ายบังคับคดี' },
  { value: 'HR',      label: 'ฝ่ายบุคคล' },
  { value: 'IT',      label: 'ไอที' },
  { value: 'GENERAL', label: 'ทั่วไป' },
]

const DEPT_COLORS: Record<string, string> = {
  DEBT:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  LAW:     'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  ASSET:   'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  ENFORCE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  HR:      'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  IT:      'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  GENERAL: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:    'bg-yellow-100 text-yellow-700',
  REVIEW:   'bg-green-100 text-green-700',
  APPROVED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
}

const EDITOR_ROLES    = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']
const APPROVER_ROLES  = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ── Form defaults ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', department: 'LAW', description: '', note: '', status: 'DRAFT',
  steps: [] as SopStep[], checklist: [] as CheckItem[], relatedDocs: [] as string[],
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SopClient({
  userId, userRole,
}: { userId: string; userRole: string; userName: string }) {
  const [sops, setSops]             = useState<SopDocument[]>([])
  const [selected, setSelected]     = useState<SopDocument | null>(null)
  const [dept, setDept]             = useState('ALL')
  const [searchQ, setSearchQ]       = useState('')
  const [loading, setLoading]       = useState(true)
  const [showCreate, setCreate]     = useState(false)
  const [editing, setEditing]       = useState(false)
  const [activeTab, setActiveTab]   = useState<'detail' | 'versions'>('detail')
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)

  const isEditor   = EDITOR_ROLES.includes(userRole)
  const isApprover = APPROVER_ROLES.includes(userRole)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dept !== 'ALL') params.set('department', dept)
    if (searchQ) params.set('q', searchQ)
    const r = await fetch(`/api/sop?${params}`)
    if (r.ok) {
      const data = await r.json()
      setSops(data.items ?? [])
    }
    setLoading(false)
  }, [dept, searchQ])

  useEffect(() => { load() }, [load])

  async function loadDetail(id: string) {
    const r = await fetch(`/api/sop/${id}`)
    if (r.ok) setSelected(await r.json())
  }

  async function saveSop() {
    setSaving(true)
    const method = editing && selected ? 'PATCH' : 'POST'
    const url    = editing && selected ? `/api/sop/${selected.id}` : '/api/sop'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (r.ok) {
      setCreate(false); setEditing(false); setForm(EMPTY_FORM)
      await load()
      const data = await r.json()
      await loadDetail(data.id)
    }
  }

  async function changeSopStatus(id: string, status: string) {
    await fetch(`/api/sop/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
    await loadDetail(id)
  }

  function startEdit(sop: SopDocument) {
    setForm({
      title:      sop.title,
      department: sop.department,
      description: sop.description ?? '',
      note:       sop.note ?? '',
      status:     sop.status,
      steps:      JSON.parse(sop.steps) as SopStep[],
      checklist:  JSON.parse(sop.checklist) as CheckItem[],
      relatedDocs: JSON.parse(sop.relatedDocs) as string[],
    })
    setEditing(true)
    setCreate(true)
  }

  const displaySops = sops.filter((s) =>
    !searchQ || s.title.toLowerCase().includes(searchQ.toLowerCase()) ||
    s.sopCode.toLowerCase().includes(searchQ.toLowerCase())
  )

  // ── Step editor helpers ────────────────────────────────────────────────────
  function addStep() {
    setForm((f) => ({ ...f, steps: [...f.steps, { order: f.steps.length + 1, title: '', detail: '' }] }))
  }
  function updateStep(i: number, field: keyof SopStep, val: string | number) {
    setForm((f) => {
      const steps = [...f.steps]
      steps[i] = { ...steps[i], [field]: val }
      return { ...f, steps }
    })
  }
  function removeStep(i: number) {
    setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }))
  }

  function addCheckItem() {
    setForm((f) => ({ ...f, checklist: [...f.checklist, { text: '', required: true }] }))
  }
  function updateCheck(i: number, field: string, val: string | boolean) {
    setForm((f) => {
      const checklist = [...f.checklist]
      checklist[i] = { ...checklist[i], [field]: val }
      return { ...f, checklist }
    })
  }

  return (
    <div className="flex flex-col lg:flex-row md:h-[calc(100dvh-4rem)] md:overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-full lg:w-[360px] flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">

        {/* Search */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="ค้นหา SOP..."
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <span className="absolute left-2.5 top-2 text-gray-400 text-sm">🔍</span>
          </div>
        </div>

        {/* Dept filter */}
        <div className="flex gap-1 p-2 flex-wrap border-b border-gray-100 dark:border-gray-800">
          {DEPARTMENTS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDept(d.value)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                dept === d.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {isEditor && (
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <button
              onClick={() => { setCreate(true); setEditing(false); setForm(EMPTY_FORM) }}
              className="w-full py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
            >
              + สร้าง SOP ใหม่
            </button>
          </div>
        )}

        {/* SOP list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">กำลังโหลด…</div>
          ) : displaySops.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">ไม่พบ SOP</div>
          ) : displaySops.map((s) => (
            <button
              key={s.id}
              onClick={() => { loadDetail(s.id); setActiveTab('detail') }}
              className={`w-full text-left px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                selected?.id === s.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0">{s.sopCode}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded-md ${DEPT_COLORS[s.department] ?? DEPT_COLORS.GENERAL}`}>
                      {DEPARTMENTS.find((d) => d.value === s.department)?.label ?? s.department}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md ${STATUS_COLORS[s.status] ?? ''}`}>
                      {s.status === 'APPROVED' ? 'อนุมัติ' : s.status === 'DRAFT' ? 'ร่าง' : s.status === 'REVIEW' ? 'รอตรวจ' : 'เก็บถาวร'}
                    </span>
                    <span className="text-xs text-gray-400">v{s.version}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 gap-3">
            <span className="text-5xl">📋</span>
            <p className="text-sm">เลือก SOP เพื่อดูรายละเอียด</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-4 lg:p-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                      {selected.sopCode}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${DEPT_COLORS[selected.department] ?? ''}`}>
                      {DEPARTMENTS.find((d) => d.value === selected.department)?.label ?? selected.department}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[selected.status] ?? ''}`}>
                      {selected.status === 'APPROVED' ? '✅ อนุมัติแล้ว' : selected.status === 'DRAFT' ? '📝 ร่าง' : selected.status === 'REVIEW' ? '🔍 รอตรวจ' : '🗃 เก็บถาวร'}
                    </span>
                    <span className="text-xs text-gray-400">เวอร์ชัน {selected.version}</span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selected.title}</h2>
                  {selected.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selected.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    สร้างโดย {selected.createdBy.name} · อัปเดต {fmtDate(selected.updatedAt)}
                    {selected.approvedBy && ` · อนุมัติโดย ${selected.approvedBy.name}`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                  {isEditor && (
                    <button onClick={() => startEdit(selected)}
                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                      ✏️ แก้ไข
                    </button>
                  )}
                  {isApprover && selected.status === 'REVIEW' && (
                    <button onClick={() => changeSopStatus(selected.id, 'APPROVED')}
                      className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg">
                      ✅ อนุมัติ
                    </button>
                  )}
                  {isEditor && selected.status === 'DRAFT' && (
                    <button onClick={() => changeSopStatus(selected.id, 'REVIEW')}
                      className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg">
                      📤 ส่งตรวจ
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 bg-white dark:bg-gray-900 rounded-t-xl">
              {(['detail', 'versions'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === t
                      ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {t === 'detail' ? '📋 รายละเอียด' : `📜 ประวัติเวอร์ชัน (${selected.versions?.length ?? 0})`}
                </button>
              ))}
            </div>

            {activeTab === 'detail' && (
              <div className="space-y-4">
                {/* Steps */}
                {JSON.parse(selected.steps).length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">📝 ขั้นตอนการทำงาน</h3>
                    <div className="space-y-3">
                      {(JSON.parse(selected.steps) as SopStep[]).map((step, i) => (
                        <div key={step.order} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {step.order ?? i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{step.title}</p>
                            {step.detail && <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{step.detail}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Checklist */}
                {JSON.parse(selected.checklist).length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">✅ Checklist</h3>
                    <ul className="space-y-2">
                      {(JSON.parse(selected.checklist) as CheckItem[]).map((item) => (
                        <li key={item.text} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <span className={item.required ? 'text-red-500' : 'text-gray-400'}>
                            {item.required ? '☑' : '○'}
                          </span>
                          {item.text}
                          {item.required && <span className="text-xs text-red-400">(จำเป็น)</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Related docs */}
                {JSON.parse(selected.relatedDocs).length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">📎 เอกสารที่เกี่ยวข้อง</h3>
                    <ul className="space-y-1">
                      {(JSON.parse(selected.relatedDocs) as string[]).map((doc) => (
                        <li key={doc} className="text-sm text-indigo-600 dark:text-indigo-400">• {doc}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.note && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-800 p-4">
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">📝 {selected.note}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'versions' && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <div className="space-y-3">
                  {(selected.versions ?? []).map((v) => (
                    <div key={v.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        v{v.version}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{v.changeNote ?? 'ไม่มีหมายเหตุ'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{v.changedBy.name} · {fmtDate(v.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                  {(!selected.versions || selected.versions.length === 0) && (
                    <p className="text-sm text-gray-400">ยังไม่มีประวัติเวอร์ชัน</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create/Edit Modal ── */}
      {showCreate && (
        <PortalModal onClose={() => { setCreate(false); setEditing(false) }} ariaLabel={editing ? 'แก้ไข SOP' : 'สร้าง SOP ใหม่'} backdropClassName="bg-black/50" panelClassName="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editing ? '✏️ แก้ไข SOP' : '+ สร้าง SOP ใหม่'}
              </h2>
              <button type="button" onClick={() => { setCreate(false); setEditing(false) }} aria-label="ปิด" className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อ SOP *</label>
                  <input id="field-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className={modalFieldInput}
                    placeholder="ชื่อขั้นตอน" />
                </div>
                <div>
                  <label htmlFor="field-2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ฝ่าย *</label>
                  <select id="field-2" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    className={modalFieldInput}>
                    {DEPARTMENTS.filter((d) => d.value !== 'ALL').map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="field-3" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">คำอธิบาย</label>
                <textarea id="field-3" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2} className={`${modalFieldInput} resize-none`}
                  placeholder="อธิบายขั้นตอนโดยย่อ" />
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ขั้นตอน</span>
                  <button type="button" onClick={addStep} className="text-xs text-indigo-600 hover:text-indigo-700">+ เพิ่มขั้นตอน</button>
                </div>
                <div className="space-y-2">
                  {form.steps.map((s, i) => (
                    <div key={String(s.order) + '-' + s.title} className="flex gap-2 items-start">
                      <span className="text-xs text-gray-400 mt-2 w-5 flex-shrink-0">{i + 1}.</span>
                      <div className="flex-1 space-y-1">
                        <input value={s.title} onChange={(e) => updateStep(i, 'title', e.target.value)}
                          className={`${modalFieldInput} text-xs`}
                          placeholder="ชื่อขั้นตอน" />
                        <input value={s.detail} onChange={(e) => updateStep(i, 'detail', e.target.value)}
                          className={`${modalFieldInput} text-xs`}
                          placeholder="รายละเอียด (ถ้ามี)" />
                      </div>
                      <button type="button" onClick={() => removeStep(i)} aria-label="ลบขั้นตอน" className="text-red-400 text-xs mt-2">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Checklist</span>
                  <button type="button" onClick={addCheckItem} className="text-xs text-indigo-600 hover:text-indigo-700">+ เพิ่มรายการ</button>
                </div>
                <div className="space-y-1">
                  {form.checklist.map((c, i) => (
                    <div key={c.text || String(i)} className="flex gap-2 items-center">
                      <input value={c.text} onChange={(e) => updateCheck(i, 'text', e.target.value)}
                        className={`flex-1 ${modalFieldInput} text-xs`}
                        placeholder="รายการ checklist" />
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        <input type="checkbox" checked={c.required} onChange={(e) => updateCheck(i, 'required', e.target.checked)} />
                        จำเป็น
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => { setCreate(false); setEditing(false) }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">ยกเลิก</button>
              <button type="button" onClick={saveSop} disabled={saving || !form.title || !form.department}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
                {saving ? 'กำลังบันทึก…' : editing ? 'บันทึก' : 'สร้าง'}
              </button>
            </div>
        </PortalModal>
      )}
    </div>
  )
}
