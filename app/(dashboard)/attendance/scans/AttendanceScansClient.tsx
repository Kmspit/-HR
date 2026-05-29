'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, ScanFace, MapPin } from 'lucide-react'
import { apiJson } from '@/lib/client-api'

type Employee = { id: string; name: string; employeeId: string | null }

type ScanRow = {
  id: string
  scanType: string
  scanTypeLabel: string
  scanTime: string
  confidenceScore: number | null
  matchScore: number | null
  livenessScore: number | null
  matched: boolean
  locationName: string | null
  address: string | null
  deviceInfo: string | null
  imageApiUrl: string
  employee: Employee
}

export default function AttendanceScansClient({
  employees,
  defaultUserId,
}: {
  employees: Employee[]
  defaultUserId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [userId, setUserId] = useState(defaultUserId)
  const [scans, setScans] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ month: String(month), year: String(year), limit: '80' })
    if (userId) params.set('userId', userId)
    const branchId = searchParams.get('branchId')
    if (branchId) params.set('branchId', branchId)

    const { ok, data } = await apiJson<{ scans?: ScanRow[] }>(
      `/api/attendance/face-scans?${params}`,
    )
    setScans(ok ? (data.scans ?? []) : [])
    setLoading(false)
  }, [month, year, userId, searchParams])

  useEffect(() => {
    void load()
  }, [load])

  const onFilter = () => {
    const p = new URLSearchParams(searchParams.toString())
    if (userId) p.set('userId', userId)
    else p.delete('userId')
    router.replace(`/attendance/scans?${p}`)
    void load()
  }

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center gap-2">
        <ScanFace className="w-6 h-6 text-cyan-400" />
        <div>
          <h1 className="text-xl font-bold text-white">ประวัติสแกนใบหน้า</h1>
          <p className="text-xs text-slate-400">รูปจากการลงเวลา — เข้าถึงผ่านระบบเท่านั้น (ไม่ public)</p>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <label className="text-xs text-slate-400">
          เดือน
          <select
            className="input mt-1 block"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          ปี
          <input
            type="number"
            className="input mt-1 w-24"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
        <label className="text-xs text-slate-400 flex-1 min-w-[200px]">
          พนักงาน
          <select
            className="input mt-1 block w-full"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">ทั้งหมด (ในสาขา)</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.employeeId ? ` (${e.employeeId})` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onFilter} className="btn-primary px-4 py-2 text-sm">
          ค้นหา
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      ) : scans.length === 0 ? (
        <p className="text-center text-slate-500 py-8">ไม่พบข้อมูลสแกนในเดือนนี้</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scans.map((s) => (
            <div key={s.id} className="card p-3 space-y-2">
              <div className="aspect-square rounded-lg overflow-hidden bg-black/40 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.imageApiUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="text-sm font-medium text-white">
                {s.employee.name}
                {s.employee.employeeId ? (
                  <span className="text-slate-400 font-normal"> · {s.employee.employeeId}</span>
                ) : null}
              </div>
              <p className="text-xs text-cyan-300">{s.scanTypeLabel}</p>
              <p className="text-xs text-slate-400">
                {new Date(s.scanTime).toLocaleString('th-TH')}
              </p>
              {(s.locationName || s.address) && (
                <p className="text-xs text-slate-500 flex items-start gap-1">
                  <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {s.locationName ?? s.address}
                </p>
              )}
              <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                {s.confidenceScore != null && (
                  <p>confidence: {(s.confidenceScore * 100).toFixed(0)}%</p>
                )}
                {s.matchScore != null && <p>match dist: {s.matchScore.toFixed(3)}</p>}
                {s.livenessScore != null && (
                  <p>liveness: {(s.livenessScore * 100).toFixed(0)}%</p>
                )}
                {!s.matched && <p className="text-red-400">ไม่ตรง / ไม่ผ่าน</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
