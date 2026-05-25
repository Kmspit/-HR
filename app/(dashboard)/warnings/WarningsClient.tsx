'use client'

import { useState } from 'react'
import { AlertTriangle, Plus, Zap, User, Calendar } from 'lucide-react'
import { toast } from 'sonner'

type Warning = {
  id: string; userId: string; userName: string; userDept: string; employeeId: string
  level: number; reason: string; description: string; isAuto: boolean
  month: number | null; year: number | null; createdAt: string
}

type Employee = { id: string; name: string; department: string }

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

export default function WarningsClient({ isManager, warnings, employees }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ userId: '', level: 1, reason: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [runningCron, setRunningCron] = useState(false)
  const [list, setList] = useState(warnings)

  const submit = async () => {
    if (!form.userId || !form.reason) { toast.error('กรุณากรอกข้อมูลให้ครบ'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/warnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('ออกใบเตือนสำเร็จ')
      setShowForm(false)
      setForm({ userId: '', level: 1, reason: '', description: '' })
      // Refresh list
      const r2 = await fetch('/api/warnings')
      const d2 = await r2.json()
      setList(d2.warnings?.map((w: any) => ({
        ...w, userName: w.user?.name ?? '', userDept: w.user?.department ?? '',
        employeeId: w.user?.employeeId ?? '', createdAt: w.createdAt,
      })) ?? [])
    } finally {
      setSubmitting(false)
    }
  }

  const runCron = async () => {
    setRunningCron(true)
    try {
      const res = await fetch('/api/cron/check-warnings?secret=hrflow-cron-secret')
      const data = await res.json()
      toast.success(`ตรวจสอบเสร็จ: ออกใบเตือน ${data.warned ?? 0} คน`)
      const r2 = await fetch('/api/warnings')
      const d2 = await r2.json()
      setList(d2.warnings?.map((w: any) => ({
        ...w, userName: w.user?.name ?? '', userDept: w.user?.department ?? '',
        employeeId: w.user?.employeeId ?? '', createdAt: w.createdAt,
      })) ?? [])
    } finally {
      setRunningCron(false)
    }
  }

  const monthNames = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">ใบเตือน</h1>
        {isManager && (
          <div className="flex gap-2">
            <button
              onClick={runCron}
              disabled={runningCron}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm transition"
            >
              <Zap className="w-4 h-4" />
              {runningCron ? 'กำลังตรวจ...' : 'รัน Auto-Check'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition"
            >
              <Plus className="w-4 h-4" /> ออกใบเตือน
            </button>
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-white">ออกใบเตือนด้วยตนเอง</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/50 block mb-1">พนักงาน</label>
              <select
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">เลือกพนักงาน...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.department})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-white/50 block mb-1">ระดับใบเตือน</label>
              <select
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: parseInt(e.target.value) }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value={1}>ระดับ 1 (เตือน)</option>
                <option value={2}>ระดับ 2 (เตือนครั้งที่ 2)</option>
                <option value={3}>ระดับ 3 (หนัก)</option>
              </select>
            </div>
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
          <div>
            <label className="text-sm text-white/50 block mb-1">รายละเอียดเพิ่มเติม</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm hover:bg-white/5 transition">ยกเลิก</button>
            <button onClick={submit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50">
              {submitting ? 'กำลังส่ง...' : 'ออกใบเตือน'}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((lvl) => (
          <div key={lvl} className={`border rounded-2xl p-4 text-center ${LEVEL_STYLES[lvl]}`}>
            <p className="text-2xl font-bold">{list.filter((w) => w.level === lvl).length}</p>
            <p className="text-sm opacity-80">ระดับ {lvl}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {isManager && <th className="text-left p-3 text-white/40 font-medium">พนักงาน</th>}
                <th className="text-center p-3 text-white/40 font-medium">ระดับ</th>
                <th className="text-left p-3 text-white/40 font-medium">เหตุผล</th>
                <th className="text-center p-3 text-white/40 font-medium">ประเภท</th>
                <th className="text-center p-3 text-white/40 font-medium">เดือน</th>
                <th className="text-center p-3 text-white/40 font-medium">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  {isManager && (
                    <td className="p-3">
                      <p className="text-white font-medium">{w.userName}</p>
                      <p className="text-white/40 text-xs">{w.userDept}</p>
                    </td>
                  )}
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${LEVEL_STYLES[w.level]}`}>
                      ระดับ {w.level}
                    </span>
                  </td>
                  <td className="p-3 text-white/70 max-w-xs">
                    <p className="line-clamp-2">{w.reason}</p>
                  </td>
                  <td className="p-3 text-center">
                    {w.isAuto
                      ? <span className="text-purple-400 text-xs">อัตโนมัติ</span>
                      : <span className="text-blue-400 text-xs">ด้วยตนเอง</span>}
                  </td>
                  <td className="p-3 text-center text-white/50 text-xs">
                    {w.month && w.year ? `${monthNames[w.month]} ${w.year}` : '-'}
                  </td>
                  <td className="p-3 text-center text-white/50 text-xs">
                    {new Date(w.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 6 : 5} className="p-8 text-center text-white/30">
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
