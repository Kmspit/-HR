'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Loader2,
  ScanFace,
  MapPin,
  User,
  Calendar,
  ImageOff,
  ChevronRight,
} from 'lucide-react'
import { apiJson } from '@/lib/client-api'
import { formatDateTimeBangkok } from '@/lib/datetime-bangkok'

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const

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
  imageDisplayUrl: string
  employee: Employee
}

function scanTypeStyle(scanType: string): { badge: string; ring: string } {
  switch (scanType) {
    case 'checkin':
      return {
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        ring: 'ring-emerald-500/30',
      }
    case 'checkout':
      return {
        badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        ring: 'ring-cyan-500/30',
      }
    case 'lunch-out':
      return {
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        ring: 'ring-amber-500/30',
      }
    case 'lunch-in':
      return {
        badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        ring: 'ring-indigo-500/30',
      }
    default:
      return {
        badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
        ring: 'ring-slate-500/30',
      }
  }
}

function ScanPhoto({ scan }: { scan: ScanRow }) {
  const [src, setSrc] = useState(scan.imageDisplayUrl || scan.imageApiUrl)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  const onError = () => {
    if (src !== scan.imageApiUrl) {
      setSrc(scan.imageApiUrl)
      setLoading(true)
      return
    }
    setFailed(true)
    setLoading(false)
  }

  const style = scanTypeStyle(scan.scanType)

  return (
    <div
      className={`relative aspect-[4/5] overflow-hidden rounded-xl bg-slate-900 ring-1 ${style.ring}`}
    >
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`สแกน ${scan.employee.name}`}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            loading ? 'opacity-0' : 'opacity-100'
          }`}
          loading="lazy"
          onLoad={() => setLoading(false)}
          onError={onError}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
          <ImageOff className="h-10 w-10 opacity-50" />
          <span className="text-xs">โหลดรูปไม่สำเร็จ</span>
        </div>
      )}
      {loading && !failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      )}
      <span
        className={`absolute left-2 top-2 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm ${style.badge}`}
      >
        {scan.scanTypeLabel}
      </span>
    </div>
  )
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
    const params = new URLSearchParams({ month: String(month), year: String(year), limit: '120' })
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

  const grouped = useMemo(() => {
    const groups: { employee: Employee; scans: ScanRow[] }[] = []
    let current: (typeof groups)[0] | null = null
    for (const s of scans) {
      if (!current || current.employee.id !== s.employee.id) {
        current = { employee: s.employee, scans: [s] }
        groups.push(current)
      } else {
        current.scans.push(s)
      }
    }
    return groups
  }, [scans])

  const onFilter = () => {
    const p = new URLSearchParams(searchParams.toString())
    if (userId) p.set('userId', userId)
    else p.delete('userId')
    router.replace(`/attendance/scans?${p}`)
    void load()
  }

  const periodLabel = `${THAI_MONTHS[month - 1] ?? month} ${year + 543}`

  return (
    <div className="page-container space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30">
            <ScanFace className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">ประวัติสแกนใบหน้า</h1>
            <p className="text-xs text-slate-400">
              เรียงตามชื่อ-นามสกุล · เดือน · ปี — รูปจาก Cloudinary (เข้าถึงผ่านระบบ)
            </p>
          </div>
        </div>
        {!loading && scans.length > 0 && (
          <div className="rounded-lg border border-slate-700/80 bg-slate-800/50 px-3 py-2 text-sm text-slate-300">
            <span className="font-semibold text-cyan-300">{scans.length}</span> รายการ ·{' '}
            <span className="font-semibold text-cyan-300">{grouped.length}</span> คน
          </div>
        )}
      </div>

      <div className="card border-slate-700/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-400">
          <Calendar className="h-3.5 w-3.5" />
          กรองข้อมูล
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">
            เดือน
            <select
              className="input mt-1 block min-w-[140px]"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {THAI_MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            ปี (ค.ศ.)
            <input
              type="number"
              className="input mt-1 w-28"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label className="min-w-[220px] flex-1 text-xs text-slate-400">
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
          <button type="button" onClick={onFilter} className="btn-primary px-5 py-2.5 text-sm">
            ค้นหา
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          แสดงผล: <span className="text-slate-300">{periodLabel}</span>
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-9 w-9 animate-spin text-cyan-400" />
        </div>
      ) : scans.length === 0 ? (
        <div className="card py-16 text-center text-slate-500">
          <ScanFace className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p>ไม่พบข้อมูลสแกนใน {periodLabel}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ employee, scans: empScans }) => (
            <section key={employee.id} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-700/60 pb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-cyan-400">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-white">{employee.name}</h2>
                  {employee.employeeId && (
                    <p className="text-xs text-slate-500">{employee.employeeId}</p>
                  )}
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
                  {empScans.length} ครั้ง
                </span>
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {empScans.map((s) => (
                  <article
                    key={s.id}
                    className="card overflow-hidden border-slate-700/50 p-0 transition hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5"
                  >
                    <ScanPhoto scan={s} />
                    <div className="space-y-2 p-3">
                      <p className="text-sm font-medium text-slate-200">
                        {formatDateTimeBangkok(s.scanTime)}
                      </p>
                      {(s.locationName || s.address) && (
                        <p className="flex items-start gap-1.5 text-xs text-slate-500">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
                          <span className="line-clamp-2">{s.locationName ?? s.address}</span>
                        </p>
                      )}
                      {(s.confidenceScore != null || !s.matched) && (
                        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
                          {s.confidenceScore != null && (
                            <span>
                              ความมั่นใจ {(s.confidenceScore * 100).toFixed(0)}%
                            </span>
                          )}
                          {!s.matched && (
                            <span className="text-red-400">ไม่ผ่านการจับคู่</span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
