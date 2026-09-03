'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Plus, History } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { MotionModal, MotionButton } from '@/components/motion'
import {
  validateNewAssignment,
  newAssignmentHasErrors,
  ASSIGNMENT_CHANGE_TYPES,
  TERMINATION_TYPES,
  type NewAssignmentForm,
  type NewAssignmentErrors,
} from '@/lib/employment-assignment-validation'
import { EMPLOYMENT_TYPES, type EmploymentTypeValue } from '@/lib/approve-assignment-validation'
import { CHANGE_TYPE_LABELS, TERMINATION_TYPE_LABELS } from '@/lib/employment-assignment-labels'
import type { EmploymentAssignmentRow } from '@/lib/employment-assignments-load'

type OrgOpt = { id: string; name: string; divisionId?: string; departmentId?: string }
type JobPositionOpt = { id: string; name: string; code: string | null }

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentTypeValue, string> = {
  FULL_TIME: 'พนักงานประจำ',
  CONTRACT: 'พนักงานสัญญาจ้าง',
  PART_TIME: 'พนักงานพาร์ทไทม์',
  DAILY: 'พนักงานรายวัน',
  INTERN: 'นักศึกษาฝึกงาน',
}

// Only offer changeTypes this form actually creates — HIRE only ever
// happens via the approve flow (step 7), PROBATION_PASS isn't part of this
// step's brief.
const CREATABLE_CHANGE_TYPES = ASSIGNMENT_CHANGE_TYPES

const EMPTY_FORM = (): NewAssignmentForm => ({
  changeType: '', effectiveFrom: '', reason: '', note: '',
  jobPositionId: '', newPositionName: '', divisionId: '', departmentId: '', sectionId: '',
  employmentType: '', baseSalary: '', canEditSalary: false,
  terminationType: '', terminationReason: '', rehireEligible: null,
})

export default function NewAssignmentModal({
  userId, userName, branchId, canEditSalary, currentAssignment, onClose, onSaved,
}: {
  userId: string
  userName: string
  branchId: string | null
  /** HR_ADMIN only — same gate as ApproveAssignModal's own salary field. */
  canEditSalary: boolean
  /** Prefills position/org/salary when a PROMOTION/TRANSFER/CONTRACT_RENEW
   *  is picked — null for an employee with no current assignment yet
   *  (TERMINATION is disabled in that case, matching the API's own guard). */
  currentAssignment: EmploymentAssignmentRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [divisions, setDivisions] = useState<OrgOpt[]>([])
  const [departments, setDepartments] = useState<OrgOpt[]>([])
  const [sections, setSections] = useState<OrgOpt[]>([])
  const [positions, setPositions] = useState<JobPositionOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [addingNewPosition, setAddingNewPosition] = useState(false)

  const [form, setForm] = useState<NewAssignmentForm>({ ...EMPTY_FORM(), canEditSalary })
  const [errors, setErrors] = useState<NewAssignmentErrors>({})

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

  const filteredDepts = departments.filter((d) => !form.divisionId || d.divisionId === form.divisionId)
  const filteredSections = sections.filter((s) => !form.departmentId || s.departmentId === form.departmentId)

  const set = <K extends keyof NewAssignmentForm>(key: K, value: NewAssignmentForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  // Picking a non-TERMINATION changeType for the first time prefills the
  // position/org/salary pickers from the current assignment, so HR edits
  // forward from what's already true instead of starting blank.
  const selectChangeType = (changeType: NewAssignmentForm['changeType']) => {
    if (changeType !== 'TERMINATION' && currentAssignment && !form.jobPositionId && !form.divisionId) {
      setForm((f) => ({
        ...f,
        changeType,
        jobPositionId: currentAssignment.jobPositionId,
        divisionId: currentAssignment.divisionId ?? '',
        departmentId: currentAssignment.departmentId ?? '',
        sectionId: currentAssignment.sectionId ?? '',
        employmentType: currentAssignment.employmentType,
        baseSalary: currentAssignment.baseSalary != null ? String(currentAssignment.baseSalary) : '',
      }))
    } else {
      setForm((f) => ({ ...f, changeType }))
    }
    setErrors({})
  }

  const save = async () => {
    const errs = validateNewAssignment(form, {
      latestEffectiveFrom: currentAssignment ? new Date(currentAssignment.effectiveFrom) : null,
      today: new Date(),
    })
    setErrors(errs)
    if (newAssignmentHasErrors(errs)) {
      toast.error('กรุณาตรวจสอบข้อมูลให้ครบถ้วน')
      return
    }

    setSaving(true)
    const body: Record<string, unknown> = {
      changeType: form.changeType,
      effectiveFrom: form.effectiveFrom,
      reason: form.reason || undefined,
      note: form.note || undefined,
    }
    if (form.changeType === 'TERMINATION') {
      body.terminationType = form.terminationType
      body.terminationReason = form.terminationReason || undefined
      body.rehireEligible = form.rehireEligible
    } else {
      Object.assign(body, {
        ...(addingNewPosition ? { newPositionName: form.newPositionName } : { jobPositionId: form.jobPositionId }),
        divisionId: form.divisionId,
        departmentId: form.departmentId,
        ...(form.sectionId ? { sectionId: form.sectionId } : {}),
        employmentType: form.employmentType,
        baseSalary: Number(form.baseSalary),
      })
    }

    const { ok, data, status } = await apiJson(`/api/users/${userId}/employment-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!ok) {
      toast.error(apiErrorMessage(data as Record<string, unknown>, 'บันทึกไม่สำเร็จ', status))
      return
    }
    toast.success(form.changeType === 'TERMINATION' ? '✅ บันทึกการพ้นสภาพแล้ว' : '✅ บันทึกประวัติตำแหน่งแล้ว')
    onClose()
    onSaved()
  }

  const isTermination = form.changeType === 'TERMINATION'

  return (
    <MotionModal open={true} onClose={onClose} panelClassName="max-w-lg p-5 border-white/10" ariaLabel="สร้างประวัติตำแหน่งใหม่">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-green-400" />
          <h3 className="font-bold text-white">สร้างประวัติตำแหน่งใหม่</h3>
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
            <label htmlFor="change-type-field" className="text-xs text-slate-500">ประเภทการเปลี่ยนแปลง *</label>
            <select
              id="change-type-field"
              value={form.changeType}
              onChange={(e) => selectChangeType(e.target.value as NewAssignmentForm['changeType'])}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white"
            >
              <option value="">— เลือกประเภท —</option>
              {CREATABLE_CHANGE_TYPES.map((t) => <option key={t} value={t}>{CHANGE_TYPE_LABELS[t]}</option>)}
            </select>
            {errors.changeType && <p className="mt-1 text-[12px] text-red-400">{errors.changeType}</p>}
          </div>

          <div>
            <label htmlFor="effective-from-field" className="text-xs text-slate-500">วันที่มีผล *</label>
            <input
              id="effective-from-field" type="date" value={form.effectiveFrom}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set('effectiveFrom', e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white"
            />
            {errors.effectiveFrom && <p className="mt-1 text-[12px] text-red-400">{errors.effectiveFrom}</p>}
            <p className="mt-1 text-[11px] text-slate-500">ยังไม่รองรับวันที่ในอนาคต — ต้องเป็นวันนี้หรือย้อนหลัง (แต่ต้องหลังประวัติล่าสุด)</p>
          </div>

          {isTermination ? (
            <>
              <div>
                <label htmlFor="term-type-field" className="text-xs text-slate-500">สาเหตุการพ้นสภาพ *</label>
                <select
                  id="term-type-field" value={form.terminationType}
                  onChange={(e) => set('terminationType', e.target.value as NewAssignmentForm['terminationType'])}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white"
                >
                  <option value="">— เลือกสาเหตุ —</option>
                  {TERMINATION_TYPES.map((t) => <option key={t} value={t}>{TERMINATION_TYPE_LABELS[t]}</option>)}
                </select>
                {errors.terminationType && <p className="mt-1 text-[12px] text-red-400">{errors.terminationType}</p>}
              </div>
              <div>
                <label htmlFor="term-reason-field" className="text-xs text-slate-500">รายละเอียดเพิ่มเติม</label>
                <input id="term-reason-field" value={form.terminationReason} onChange={(e) => set('terminationReason', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">สิทธิ์การกลับเข้าทำงาน *</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => set('rehireEligible', true)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${form.rehireEligible === true ? 'bg-green-600 text-white' : 'bg-white/5 text-white/60 border border-white/10'}`}
                  >
                    มีสิทธิ์กลับมาทำงาน
                  </button>
                  <button
                    type="button"
                    onClick={() => set('rehireEligible', false)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${form.rehireEligible === false ? 'bg-red-600 text-white' : 'bg-white/5 text-white/60 border border-white/10'}`}
                  >
                    ไม่มีสิทธิ์กลับมาทำงาน
                  </button>
                </div>
                {errors.rehireEligible && <p className="mt-1 text-[12px] text-red-400">{errors.rehireEligible}</p>}
              </div>
              <p className="text-[11px] text-slate-500">ตำแหน่ง/แผนก/เงินเดือนจะยึดค่าล่าสุดของพนักงานไว้ ไม่ต้องกรอกใหม่ — สถานะบัญชีจะเปลี่ยนเป็น &ldquo;พ้นสภาพ&rdquo; ทันที</p>
            </>
          ) : form.changeType ? (
            <>
              <div>
                <label htmlFor="new-pos-field" className="text-xs text-slate-500">ตำแหน่ง *</label>
                {!addingNewPosition ? (
                  <>
                    <select id="new-pos-field" value={form.jobPositionId} onChange={(e) => set('jobPositionId', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white">
                      <option value="">— เลือกตำแหน่ง —</option>
                      {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button type="button" onClick={() => { setAddingNewPosition(true); set('jobPositionId', '') }} className="mt-1.5 flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
                      <Plus size={12} /> เพิ่มตำแหน่งใหม่
                    </button>
                  </>
                ) : (
                  <>
                    <input id="new-pos-field" type="text" value={form.newPositionName} onChange={(e) => set('newPositionName', e.target.value)} placeholder="ชื่อตำแหน่งใหม่" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
                    <button type="button" onClick={() => { setAddingNewPosition(false); set('newPositionName', '') }} className="mt-1.5 text-xs text-slate-400 hover:text-white">
                      ← เลือกจากรายการเดิม
                    </button>
                  </>
                )}
                {errors.position && <p className="mt-1 text-[12px] text-red-400">{errors.position}</p>}
              </div>

              <div>
                <label htmlFor="new-div-field" className="text-xs text-slate-500">ฝ่าย *</label>
                <select id="new-div-field" value={form.divisionId} onChange={(e) => { set('divisionId', e.target.value); set('departmentId', ''); set('sectionId', '') }} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white">
                  <option value="">— เลือกฝ่าย —</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {errors.divisionId && <p className="mt-1 text-[12px] text-red-400">{errors.divisionId}</p>}
              </div>
              <div>
                <label htmlFor="new-dept-field" className="text-xs text-slate-500">แผนก *</label>
                <select id="new-dept-field" value={form.departmentId} onChange={(e) => { set('departmentId', e.target.value); set('sectionId', '') }} disabled={!form.divisionId} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white disabled:opacity-50">
                  <option value="">— เลือกแผนก —</option>
                  {filteredDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {errors.departmentId && <p className="mt-1 text-[12px] text-red-400">{errors.departmentId}</p>}
              </div>
              <div>
                <label htmlFor="new-sec-field" className="text-xs text-slate-500">
                  ส่วนงาน <span className="text-slate-600">(ไม่บังคับ)</span>
                </label>
                <select id="new-sec-field" value={form.sectionId} onChange={(e) => set('sectionId', e.target.value)} disabled={!form.departmentId} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white disabled:opacity-50">
                  <option value="">— ไม่ระบุส่วนงาน —</option>
                  {filteredSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="new-emp-type-field" className="text-xs text-slate-500">ประเภทพนักงาน *</label>
                <select id="new-emp-type-field" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value as EmploymentTypeValue)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white">
                  <option value="">— เลือกประเภท —</option>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</option>)}
                </select>
                {errors.employmentType && <p className="mt-1 text-[12px] text-red-400">{errors.employmentType}</p>}
              </div>

              {canEditSalary && (
                <div>
                  <label htmlFor="new-salary-field" className="text-xs text-slate-500">เงินเดือน *</label>
                  <input id="new-salary-field" type="number" min="0" value={form.baseSalary} onChange={(e) => set('baseSalary', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
                  {errors.baseSalary && <p className="mt-1 text-[12px] text-red-400">{errors.baseSalary}</p>}
                </div>
              )}

              <div>
                <label htmlFor="new-reason-field" className="text-xs text-slate-500">เหตุผล/หมายเหตุ</label>
                <input id="new-reason-field" value={form.reason} onChange={(e) => set('reason', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white" />
              </div>
            </>
          ) : null}
        </div>
      )}

      <MotionButton type="button" onClick={save} disabled={saving || loading || !branchId || !form.changeType} variant="primary" className="mt-4 w-full">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'บันทึก'}
      </MotionButton>
    </MotionModal>
  )
}
