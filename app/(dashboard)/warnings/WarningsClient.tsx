'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, Plus, Zap, Search, User, FileUp, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

type Warning = {
  id: string
  userId: string
  userName: string
  userDept: string
  employeeId: string
  level: number
  reason: string
  description: string
  fileUrl: string | null
  isAuto: boolean
  month: number | null
  year: number | null
  createdAt: string
}

type Employee = {
  id: string
  name: string
  department: string
  employeeId: string
  warningCount: number
}

type Props = {
  isManager: boolean
  warnings: Warning[]
  employees: Employee[]
}

const LEVEL_STYLES = [
  '',
  'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
  'bg-orange-500/20 border-orange-500/30 text-orange-400',
  'bg-red-500/20 border-red-500/30 text-red-400',
]

const LEVEL_LABELS: Record<number, string> = {
  1: 'ระดับ 1 — ใบเตือนครั้งที่ 1',
  2: 'ระดับ 2 — ใบเตือนครั้งที่ 2',
  3: 'ระดับ 3 — ใบเตือนครั้งที่ 3 ขึ้นไป',
}

function suggestedLevelFromCount(count: number) {
  return Math.min(count + 1, 3)
}

function mapWarningsFromApi(raw: Array<Record<string, unknown>>): Warning[] {
  return raw.map((w) => ({
    id: String(w.id),
    userId: String(w.userId),
    userName: (w.user as { name?: string })?.name ?? '',
    userDept: (w.user as { department?: string })?.department ?? '',
    employeeId: (w.user as { employeeId?: string })?.employeeId ?? '',
    level: Number(w.level),
    reason: String(w.reason),
    description: String(w.description ?? ''),
    fileUrl: w.fileUrl != null ? String(w.fileUrl) : null,
    isAuto: Boolean(w.isAuto),
    month: w.month != null ? Number(w.month) : null,
    year: w.year != null ? Number(w.year) : null,
    createdAt: String(w.createdAt),
  }))
}

const MAX_PDF_MB = 10

export default function WarningsClient({ isManager, warnings, employees }: Props) {
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ userId: '', level: 1, reason: '', description: '' })
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [runningCron, setRunningCron] = useState(false)
  const [list, setList] = useState(warnings)
  const [employeeStats, setEmployeeStats] = useState<{
    total: number
    warningNumber: number
    nextLevel: number
    byLevel: Record<number, number>
  } | null>(null)

  const selectedEmployee = employees.find((e) => e.id === form.userId)

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q),
    )
  }, [employees, employeeSearch])

  useEffect(() => {
    if (!form.userId) {
      setEmployeeStats(null)
      return
    }
    const localCount = selectedEmployee?.warningCount ?? 0
    const next = suggestedLevelFromCount(localCount)
    setForm((f) => ({ ...f, level: next }))

    apiJson<{
      total: number
      warningNumber: number
      nextLevel: number
      byLevel: Record<number, number>
    }>(`/api/warnings/count?userId=${form.userId}`).then(({ ok, data }) => {
      if (ok && data) {
        setEmployeeStats({
          total: data.total,
          warningNumber: data.warningNumber,
          nextLevel: data.nextLevel,
          byLevel: data.byLevel,
        })
        setForm((f) => ({ ...f, level: data.nextLevel }))
      }
    })
  }, [form.userId, selectedEmployee?.warningCount])

  const refreshList = async () => {
    const { data } = await apiJson<{ warnings?: Array<Record<string, unknown>> }>('/api/warnings')
    if (data.warnings) setList(mapWarningsFromApi(data.warnings))
  }

  const submit = async () => {
    if (!form.userId || !form.reason) {
      toast.error('กรุณาเลือกพนักงานและระบุเหตุผล')
      return
    }
    if (pdfFile && pdfFile.size > MAX_PDF_MB * 1024 * 1024) {
      toast.error(`ไฟล์ PDF ต้องไม่เกิน ${MAX_PDF_MB} MB`)
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('userId', form.userId)
      formData.append('level', String(form.level))
      formData.append('reason', form.reason)
      formData.append('description', form.description)
      formData.append('useAutoLevel', 'true')
      if (pdfFile) formData.append('file', pdfFile, pdfFile.name)

      const { ok, data, status } = await apiJson<{
        warningNumber?: number
        levelUsed?: number
        priorCount?: number
      }>('/api/warnings', {
        method: 'POST',
        body: formData,
      })
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'เกิดข้อผิดพลาด', status))
        return
      }
      toast.success(
        `ออกใบเตือนสำเร็จ — ครั้งที่ ${data.warningNumber ?? '?'} (ระดับ ${data.levelUsed ?? form.level})`,
      )
      setShowForm(false)
      setForm({ userId: '', level: 1, reason: '', description: '' })
      setPdfFile(null)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
      setEmployeeSearch('')
      setEmployeeStats(null)
      await refreshList()
    } catch (err) {
      console.error('[warnings]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  const runCron = async () => {
    setRunningCron(true)
    try {
      const { ok, data, status } = await apiJson<{ warned?: number }>(
        '/api/cron/check-warnings?secret=hrflow-cron-secret',
      )
      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'เกิดข้อผิดพลาด', status))
        return
      }
      toast.success(`ตรวจสอบเสร็จ: ออกใบเตือน ${data.warned ?? 0} คน`)
      await refreshList()
    } catch (err) {
      console.error('[warnings-cron]', err)
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setRunningCron(false)
    }
  }

  const monthNames = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

  const warningNumber = employeeStats?.warningNumber ?? (selectedEmployee ? selectedEmployee.warningCount + 1 : 1)

  const warningOrdinalById = useMemo(() => {
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    const ordinalByWarningId = new Map<string, number>()
    const countByUser = new Map<string, number>()
    for (const w of sorted) {
      const n = (countByUser.get(w.userId) ?? 0) + 1
      countByUser.set(w.userId, n)
      ordinalByWarningId.set(w.id, n)
    }
    return ordinalByWarningId
  }, [list])

  const getMonthKey = (w: Warning) => {
    if (w.month && w.year) return `${w.year}-${String(w.month).padStart(2, '0')}`
    const d = new Date(w.createdAt)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const formatMonthLabel = (key: string) => {
    const [y, m] = key.split('-')
    const mi = parseInt(m, 10)
    return `${monthNames[mi] ?? m} ${parseInt(y, 10) + 543}`
  }

  const summaryByMonth = useMemo(() => {
    const map = new Map<
      string,
      { key: string; total: number; byLevel: Record<number, number>; employeeIds: Set<string> }
    >()
    for (const w of list) {
      const key = getMonthKey(w)
      const cur = map.get(key)
      if (!cur) {
        map.set(key, {
          key,
          total: 1,
          byLevel: { [w.level]: 1 },
          employeeIds: new Set([w.userId]),
        })
      } else {
        cur.total += 1
        cur.byLevel[w.level] = (cur.byLevel[w.level] ?? 0) + 1
        cur.employeeIds.add(w.userId)
      }
    }
    return [...map.values()]
      .map((row) => ({ ...row, employeeCount: row.employeeIds.size }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [list])

  const thCls = 'p-3 text-white/40 font-medium whitespace-nowrap'
  const tdCls = 'p-3 whitespace-nowrap align-middle'

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">ใบเตือน</h1>
        {isManager && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runCron}
              disabled={runningCron}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm transition"
            >
              <Zap className="w-4 h-4" />
              {runningCron ? 'กำลังตรวจ...' : 'รัน Auto-Check'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition"
            >
              <Plus className="w-4 h-4" /> ออกใบเตือน
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="glass-card card-hover rounded-2xl p-5 space-y-4 animate-fade-in-sm">
          <h3 className="font-semibold text-white">ออกใบเตือนด้วยตนเอง</h3>

          <div>
            <label className="text-sm text-white/50 block mb-1">ค้นหา / เลือกพนักงาน</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="พิมพ์ชื่อ รหัส หรือแผนก..."
                className="w-full pl-10 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <select
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              size={Math.min(6, Math.max(3, filteredEmployees.length))}
              className="w-full mt-2 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— เลือกพนักงานจากรายการ —</option>
              {filteredEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.employeeId ? ` (${e.employeeId})` : ''} — {e.department || 'ไม่ระบุแผนก'} · ใบเตือนแล้ว{' '}
                  {e.warningCount} ครั้ง
                </option>
              ))}
            </select>
            {filteredEmployees.length === 0 && (
              <p className="text-xs text-slate-500 mt-1">ไม่พบพนักงานที่ตรงกับคำค้นหา</p>
            )}
          </div>

          {form.userId && selectedEmployee && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-white">
                <User className="w-4 h-4 text-amber-400" />
                <span className="font-semibold">{selectedEmployee.name}</span>
                {selectedEmployee.employeeId && (
                  <span className="text-xs text-slate-400">({selectedEmployee.employeeId})</span>
                )}
              </div>
              <p className="text-sm text-amber-100/90 whitespace-nowrap overflow-x-auto">
                เคยได้รับใบเตือนแล้ว <strong className="text-white">{employeeStats?.total ?? selectedEmployee.warningCount}</strong> ครั้ง
                {employeeStats && (
                  <span className="text-slate-400 text-xs ml-2">
                    · ระดับ 1: {employeeStats.byLevel[1] ?? 0} · ระดับ 2: {employeeStats.byLevel[2] ?? 0} · ระดับ 3: {employeeStats.byLevel[3] ?? 0}
                  </span>
                )}
                {' · '}ครั้งนี้ครั้งที่ <strong className="text-white">{warningNumber}</strong> → ระดับ <strong className="text-white">{form.level}</strong>
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/50 block mb-1">ระดับใบเตือน (อัตโนมัติ)</label>
              <select
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: parseInt(e.target.value, 10) }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value={1}>{LEVEL_LABELS[1]}</option>
                <option value={2}>{LEVEL_LABELS[2]}</option>
                <option value={3}>{LEVEL_LABELS[3]}</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                ปรับเองได้หากจำเป็น — ค่าเริ่มต้นคำนวณจากจำนวนครั้งที่เคยโดน
              </p>
            </div>
            <div>
              <label className="text-sm text-white/50 block mb-1">เหตุผล</label>
              <input
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="ระบุเหตุผล..."
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-white/50 block mb-1">รายละเอียดเพิ่มเติม</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {isManager && (
            <div>
              <label className="text-sm text-white/50 block mb-1">ไฟล์ใบเตือน (PDF)</label>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) {
                    setPdfFile(null)
                    return
                  }
                  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                    toast.error('กรุณาเลือกไฟล์ PDF เท่านั้น')
                    e.target.value = ''
                    setPdfFile(null)
                    return
                  }
                  if (file.size > MAX_PDF_MB * 1024 * 1024) {
                    toast.error(`ไฟล์ต้องไม่เกิน ${MAX_PDF_MB} MB`)
                    e.target.value = ''
                    setPdfFile(null)
                    return
                  }
                  setPdfFile(file)
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm font-medium hover:bg-red-500/20 transition"
                >
                  <FileUp className="w-4 h-4" />
                  อัปโหลด PDF
                </button>
                {pdfFile && (
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                    <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="truncate max-w-[200px]">{pdfFile.name}</span>
                    <span className="text-xs text-slate-500">
                      ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPdfFile(null)
                        if (pdfInputRef.current) pdfInputRef.current.value = ''
                      }}
                      className="p-0.5 text-slate-500 hover:text-white"
                      aria-label="ลบไฟล์"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">ไม่บังคับ — สูงสุด {MAX_PDF_MB} MB</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setEmployeeSearch('')
                setEmployeeStats(null)
                setPdfFile(null)
                if (pdfInputRef.current) pdfInputRef.current.value = ''
              }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm hover:bg-white/5 transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !form.userId}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50"
            >
              {submitting ? 'กำลังส่ง...' : `ออกใบเตือน (ครั้งที่ ${warningNumber})`}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((lvl) => (
          <div key={lvl} className={`card-hover smooth-transition border rounded-2xl p-4 text-center ${LEVEL_STYLES[lvl]}`}>
            <p className="text-2xl font-bold">{list.filter((w) => w.level === lvl).length}</p>
            <p className="text-sm opacity-80">ระดับ {lvl}</p>
          </div>
        ))}
      </div>

      {summaryByMonth.length > 0 && (
        <div className="glass-card card-hover rounded-2xl overflow-hidden smooth-transition">
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">สรุปใบเตือนรายเดือน</h2>
          </div>
          <div className="table-scroll">
            <table className="warnings-table w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={`${thCls} text-left`}>เดือน / ปี</th>
                  <th className={`${thCls} text-center`}>จำนวนใบ</th>
                  <th className={`${thCls} text-center`}>ระดับ 1</th>
                  <th className={`${thCls} text-center`}>ระดับ 2</th>
                  <th className={`${thCls} text-center`}>ระดับ 3</th>
                  {isManager && <th className={`${thCls} text-center`}>พนักงานที่โดน</th>}
                </tr>
              </thead>
              <tbody>
                {summaryByMonth.map((row) => (
                  <tr key={row.key} className="table-row-hover border-b border-white/5">
                    <td className={`${tdCls} text-white font-medium`}>{formatMonthLabel(row.key)}</td>
                    <td className={`${tdCls} text-center`}>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${row.total >= 5 ? LEVEL_STYLES[3] : row.total >= 3 ? LEVEL_STYLES[2] : LEVEL_STYLES[1]}`}>
                        {row.total} ใบ
                      </span>
                    </td>
                    <td className={`${tdCls} text-center text-slate-400 tabular-nums`}>{row.byLevel[1] ?? 0}</td>
                    <td className={`${tdCls} text-center text-slate-400 tabular-nums`}>{row.byLevel[2] ?? 0}</td>
                    <td className={`${tdCls} text-center text-slate-400 tabular-nums`}>{row.byLevel[3] ?? 0}</td>
                    {isManager && (
                      <td className={`${tdCls} text-center text-slate-300 tabular-nums`}>{row.employeeCount} คน</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="glass-card card-hover rounded-2xl overflow-hidden smooth-transition">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">ประวัติใบเตือนทั้งหมด</h2>
        </div>
        <div className="table-scroll">
          <table className="warnings-table w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-white/10">
                {isManager && <th className={`${thCls} text-left`}>พนักงาน</th>}
                <th className={`${thCls} text-center`}>ระดับ</th>
                <th className={`${thCls} text-center`}>ครั้งที่</th>
                <th className={`${thCls} text-left`}>เหตุผล</th>
                <th className={`${thCls} text-center`}>ประเภท</th>
                <th className={`${thCls} text-center`}>PDF</th>
                <th className={`${thCls} text-center`}>เดือน</th>
                <th className={`${thCls} text-center`}>วันที่</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => {
                const userOrdinal = warningOrdinalById.get(w.id) ?? '?'
                return (
                  <tr key={w.id} className="table-row-hover border-b border-white/5">
                    {isManager && (
                      <td className={`${tdCls} text-white font-medium`}>
                        {w.userName}
                        {w.employeeId ? ` (${w.employeeId})` : ''}
                        {w.userDept ? ` · ${w.userDept}` : ''}
                      </td>
                    )}
                    <td className={`${tdCls} text-center`}>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${LEVEL_STYLES[w.level]}`}
                      >
                        ระดับ {w.level}
                      </span>
                    </td>
                    <td className={`${tdCls} text-center text-slate-400 text-xs tabular-nums`}>
                      ครั้งที่ {userOrdinal}
                    </td>
                    <td className={`${tdCls} text-white/70 max-w-[200px] truncate`} title={w.reason}>
                      {w.reason}
                    </td>
                    <td className={`${tdCls} text-center`}>
                      {w.isAuto ? (
                        <span className="text-purple-400 text-xs whitespace-nowrap">อัตโนมัติ</span>
                      ) : (
                        <span className="text-blue-400 text-xs whitespace-nowrap">ด้วยตนเอง</span>
                      )}
                    </td>
                    <td className={`${tdCls} text-center`}>
                      {w.fileUrl ? (
                        <a
                          href={w.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                          PDF
                        </a>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className={`${tdCls} text-center text-white/50 text-xs`}>
                      {w.month && w.year ? `${monthNames[w.month]} ${w.year}` : '-'}
                    </td>
                    <td className={`${tdCls} text-center text-white/50 text-xs`}>
                      {new Date(w.createdAt).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                  </tr>
                )
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 8 : 7} className="p-8 text-center text-white/30">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    ไม่มีใบเตือน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

