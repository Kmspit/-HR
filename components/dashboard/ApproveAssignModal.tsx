'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { MotionModal, MotionButton } from '@/components/motion'
import {
  validateApproveAssignment,
  approveAssignmentHasErrors,
  EMPLOYMENT_TYPES,
  type EmploymentTypeValue,
  type ApproveAssignmentErrors,
} from '@/lib/approve-assignment-validation'

type OrgOpt = { id: string; name: string; divisionId?: string; departmentId?: string }
type JobPositionOpt = { id: string; name: string; code: string | null }

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentTypeValue, string> = {
  FULL_TIME: 'พนักงานประจำ',
  CONTRACT: 'พนักงานสัญญาจ้าง',
  PART_TIME: 'พนักงานพาร์ทไทม์',
  DAILY: 'พนักงานรายวัน',
  INTERN: 'นักศึกษาฝึกงาน',
}

type Props = {
  userId: string
  userName: string
  branchId: string | null
  /** HR_ADMIN only (same gate as the standalone edit-page field, Phase 1
   *  step 0) — computed server-side from the viewer's own role, not the
   *  employee being approved. When false, the salary field is fully hidden
   *  (not disabled) and approval still succeeds without it. */
  canEditSalary: boolean
  onClose: () => void
}

export default function ApproveAssignModal({ userId, userName, branchId, canEditSalary, onClose }: Props) {
  const router = useRouter()
  const [divisions, setDivisions] = useState<OrgOpt[]>([])
  const [departments, setDepartments] = useState<OrgOpt[]>([])
  const [sections, setSections] = useState<OrgOpt[]>([])
  const [positions, setPositions] = useState<JobPositionOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [divisionId, setDivisionId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [jobPositionId, setJobPositionId] = useState('')
  const [newPositionName, setNewPositionName] = useState('')
  const [addingNewPosition, setAddingNewPosition] = useState(false)
  const [employmentType, setEmploymentType] = useState<EmploymentTypeValue | ''>('')
  const [startDate, setStartDate] = useState('')
  const [baseSalary, setBaseSalary] = useState('')
  const [errors, setErrors] = useState<ApproveAssignmentErrors>({})

  useEffect(() => {
    if (!branchId) { setLoading(false); return }
    const q = `branchId=${branchId}`
    Promise.all([
      apiJson<{ divisions?: OrgOpt[] }>(`/api/org/divisions?${q}`),
      apiJson<{ departments?: OrgOpt[] }>(`/api/org/departments?${q}`),
      apiJson<{ sections?: OrgOpt[] }>(`/api/org/sections?${q}`),
      apiJson<{ positions?: JobPositionOpt[] }>('/api/job-positions'),
    ]).then(([d, dep, s, p]) => {
      if (d.ok && d.data.divisions) setDivisions(d.data.divisions)
      if (dep.ok && dep.data.departments) setDepartments(dep.data.departments)
      if (s.ok && s.data.sections) setSections(s.data.sections)
      if (p.ok && p.data.positions) setPositions(p.data.positions)
      setLoading(false)
    })
  }, [branchId])

  const filteredDepts = departments.filter((d) => !divisionId || d.divisionId === divisionId)
  const filteredSections = sections.filter((s) => !departmentId || s.departmentId === departmentId)

  const save = async () => {
    const form = {
      jobPositionId: addingNewPosition ? '' : jobPositionId,
      newPositionName: addingNewPosition ? newPositionName : '',
      divisionId, departmentId, sectionId,
      employmentType, startDate, baseSalary, canEditSalary,
    }
    const errs = validateApproveAssignment(form)
    setErrors(errs)
    if (approveAssignmentHasErrors(errs)) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน')
      return
    }

    setSaving(true)
    const { ok, data, status } = await apiJson(`/api/users/${userId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'APPROVE',
        ...(addingNewPosition ? { newPositionName } : { jobPositionId }),
        divisionId,
        departmentId,
        ...(sectionId ? { sectionId } : {}),
        employmentType,
        startDate,
        ...(canEditSalary ? { baseSalary: Number(baseSalary) } : {}),
      }),
    })
    setSaving(false)
    if (!ok) {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'อนุมัติไม่สำเร็จ', status))
      return
    }
    toast.success('✅ อนุมัติบัญชีแล้ว')
    onClose()
    router.refresh()
  }

  return (
    <MotionModal open={true} onClose={onClose} panelClassName="max-w-lg p-5 border-white/10" ariaLabel="อนุมัติและกำหนดข้อมูลพนักงาน">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <h3 className="font-bold text-white">อนุมัติและกำหนดข้อมูลพนักงาน</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="ปิด" className="p-1 text-slate-400 hover:text-white btn-press"><X className="w-5 h-5" /></button>
      </div>
      <p className="text-sm text-slate-400 mb-4">{userName}</p>

      {loading ? (
        <p className="text-sm text-slate-500 py-4 text-center">กำลังโหลด...</p>
      ) : !branchId ? (
        <p className="text-sm text-amber-400">พนักงานยังไม่มีสาขา — กำหนดสาขาก่อน</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <label htmlFor="pos-field" className="text-xs text-slate-500">ตำแหน่ง *</label>
            {!addingNewPosition ? (
              <>
                <select id="pos-field" value={jobPositionId} onChange={(e) => setJobPositionId(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white">
                  <option value="">— เลือกตำแหน่ง —</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" onClick={() => { setAddingNewPosition(true); setJobPositionId('') }} className="mt-1.5 flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
                  <Plus size={12} /> เพิ่มตำแหน่งใหม่
                </button>
              </>
            ) : (
              <>
                <input id="pos-field" type="text" value={newPositionName} onChange={(e) => setNewPositionName(e.target.value)} placeholder="ชื่อตำแหน่งใหม่" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
                <button type="button" onClick={() => { setAddingNewPosition(false); setNewPositionName('') }} className="mt-1.5 text-xs text-slate-400 hover:text-white">
                  ← เลือกจากรายการเดิม
                </button>
              </>
            )}
            {errors.position && <p className="mt-1 text-[12px] text-red-400">{errors.position}</p>}
          </div>

          <div>
            <label htmlFor="div-field" className="text-xs text-slate-500">ฝ่าย *</label>
            <select id="div-field" value={divisionId} onChange={(e) => { setDivisionId(e.target.value); setDepartmentId(''); setSectionId('') }} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white">
              <option value="">— เลือกฝ่าย —</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {errors.divisionId && <p className="mt-1 text-[12px] text-red-400">{errors.divisionId}</p>}
          </div>
          <div>
            <label htmlFor="dept-field" className="text-xs text-slate-500">แผนก *</label>
            <select id="dept-field" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setSectionId('') }} disabled={!divisionId} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white disabled:opacity-50">
              <option value="">— เลือกแผนก —</option>
              {filteredDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {errors.departmentId && <p className="mt-1 text-[12px] text-red-400">{errors.departmentId}</p>}
          </div>
          <div>
            <label htmlFor="sec-field" className="text-xs text-slate-500">
              ส่วนงาน <span className="text-slate-600">(ไม่บังคับ)</span>
            </label>
            <select id="sec-field" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!departmentId} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white disabled:opacity-50">
              <option value="">— ไม่ระบุส่วนงาน —</option>
              {filteredSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="emp-type-field" className="text-xs text-slate-500">ประเภทพนักงาน *</label>
            <select id="emp-type-field" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentTypeValue)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white">
              <option value="">— เลือกประเภท —</option>
              {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</option>)}
            </select>
            {errors.employmentType && <p className="mt-1 text-[12px] text-red-400">{errors.employmentType}</p>}
          </div>

          <div>
            <label htmlFor="start-date-field" className="text-xs text-slate-500">วันเริ่มงาน *</label>
            <input id="start-date-field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
            {errors.startDate && <p className="mt-1 text-[12px] text-red-400">{errors.startDate}</p>}
          </div>

          {canEditSalary ? (
            <div>
              <label htmlFor="salary-field" className="text-xs text-slate-500">เงินเดือน *</label>
              <input id="salary-field" type="number" min="0" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} placeholder="25000" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
              {errors.baseSalary && <p className="mt-1 text-[12px] text-red-400">{errors.baseSalary}</p>}
            </div>
          ) : (
            <p className="text-[12px] text-slate-500">เงินเดือน: HR จะเป็นผู้กำหนดภายหลัง</p>
          )}
        </div>
      )}

      <MotionButton type="button" onClick={save} disabled={saving || loading || !branchId} variant="primary" className="mt-4 w-full">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'อนุมัติ'}
      </MotionButton>
    </MotionModal>
  )
}
