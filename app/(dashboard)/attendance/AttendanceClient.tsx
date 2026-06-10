'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, MapPin, Users, Calendar, CheckCircle, Building2, Navigation, ScanFace } from 'lucide-react'
import dynamic from 'next/dynamic'
import CheckInPanel, { type CompanyGeofence } from '@/components/dashboard/CheckInPanel'
import FaceRegistrationCard from '@/components/attendance/FaceRegistrationCard'
import { apiJson } from '@/lib/client-api'
import RealtimeClock from '@/components/dashboard/RealtimeClock'
import AttendanceTimeline from '@/components/dashboard/AttendanceTimeline'
import AttendancePhotos from '@/components/dashboard/AttendancePhotos'
import AttendanceLocalHistory from '@/components/attendance/AttendanceLocalHistory'
import { formatLateMinutes, formatLateMinutesShort } from '@/lib/utils'
import {
  getAttendanceProgress,
  ACTION_LABELS,
  type AttendanceAction,
} from '@/lib/attendance-progress'

const MapView = dynamic(() => import('@/components/dashboard/MapView'), { ssr: false })

type TodayRecord = {
  id: string
  sessionIndex?: number
  checkIn: string | null
  checkOut: string | null
  lunchOut: string | null
  lunchIn: string | null
  status: string
  lateMinutes: number
  earlyLeaveMinutes: number
  isOutside: boolean
  address: string | null
  workPlaceName: string | null
  photoUrl: string | null
  checkOutPhotoUrl: string | null
  lunchOutPhotoUrl: string | null
  lunchInPhotoUrl: string | null
  lat: number | null
  lng: number | null
  autoCheckout: boolean
}

type RecentRecord = {
  id: string
  date: string
  sessionIndex?: number
  checkIn: string | null
  checkOut: string | null
  lunchOut: string | null
  lunchIn: string | null
  status: string
  lateMinutes: number
  isOutside: boolean
  workPlaceName: string | null
  lat: number | null
  lng: number | null
  autoCheckout: boolean
}

type Props = {
  role: string
  userId: string
  userName: string
  employeeCode: string | null
  companyOffice: { name: string; address: string } | null
  companyGeofence: CompanyGeofence | null
  todayRecord: TodayRecord | null
  dayComplete?: boolean
  recentRecords: RecentRecord[]
  leaveBalance: { sick: number; vacation: number; personal: number } | null
  allToday: {
    id: string
    name: string
    department: string | null
    status: string
    checkIn: string | null
    checkOut: string | null
    hasCheckedIn: boolean
  }[]
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  NORMAL:   { label: 'ปกติ',      color: 'text-green-700 dark:text-green-400' },
  LATE:     { label: 'มาสาย',    color: 'text-amber-700 dark:text-yellow-400' },
  ABSENT:   { label: 'ขาดงาน',   color: 'text-red-700 dark:text-red-400' },
  LEAVE:    { label: 'ลา',        color: 'text-blue-700 dark:text-blue-400' },
  OT:       { label: 'OT',        color: 'text-purple-700 dark:text-purple-400' },
  HALF_DAY: { label: 'ครึ่งวัน', color: 'text-orange-700 dark:text-orange-400' },
  EARLY_LEAVE: { label: 'กลับก่อน', color: 'text-orange-400' },
  NONE: { label: 'ยังไม่เช็คอิน', color: 'text-slate-500' },
}

type LocationType = 'company' | 'outside'

const ACTION_STEPS: { key: AttendanceAction; label: string; short: string }[] = [
  { key: 'checkin', label: ACTION_LABELS.checkin, short: '1' },
  { key: 'lunch-out', label: ACTION_LABELS['lunch-out'], short: '2' },
  { key: 'lunch-in', label: ACTION_LABELS['lunch-in'], short: '3' },
  { key: 'checkout', label: ACTION_LABELS.checkout, short: '4' },
]

const ACTION_STYLE: Record<AttendanceAction, { grad: string; icon: string }> = {
  checkin: { grad: 'linear-gradient(135deg,#06b6d4,#3b82f6)', icon: '🟢' },
  'lunch-out': { grad: 'linear-gradient(135deg,#f59e0b,#ea580c)', icon: '☕' },
  'lunch-in': { grad: 'linear-gradient(135deg,#eab308,#f59e0b)', icon: '🔔' },
  checkout: { grad: 'linear-gradient(135deg,#3b82f6,#6366f1)', icon: '🔵' },
}

export default function AttendanceClient({
  role,
  userId,
  userName,
  employeeCode,
  companyOffice,
  companyGeofence,
  todayRecord,
  dayComplete: dayCompleteProp = false,
  recentRecords,
  leaveBalance,
  allToday,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'team'>('today')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedType, setSelectedType] = useState<LocationType | null>(null)
  const [checkinLocationType, setCheckinLocationType] = useState<LocationType>('company')
  const [lunchPanel, setLunchPanel] = useState<'lunch-out' | 'lunch-in' | 'checkout' | null>(null)
  const [faceRegistered, setFaceRegistered] = useState(false)
  const [showFaceUpdate, setShowFaceUpdate] = useState(false)
  // justCompleted: ป้องกัน double-tap ระหว่างรอ router.refresh() (isPending บาง edge case อาจไม่ครอบ)
  const [justCompleted, setJustCompleted] = useState(false)
  const blockCheckIn = isPending || justCompleted

  useEffect(() => {
    apiJson<{ registered?: boolean }>('/api/face/status').then(({ ok, data }) => {
      if (ok && data.registered) setFaceRegistered(true)
    })
  }, [refreshKey])

  useEffect(() => {
    if (!isPending) setJustCompleted(false)
  }, [todayRecord?.id, todayRecord?.checkIn, todayRecord?.lunchOut, todayRecord?.lunchIn, todayRecord?.checkOut, isPending])

  const isManager = ['MANAGER_HR', 'ADMIN'].includes(role)
  const progress = getAttendanceProgress(
    todayRecord
      ? {
          checkIn: todayRecord.checkIn,
          checkOut: todayRecord.checkOut,
          lunchOut: todayRecord.lunchOut,
          lunchIn: todayRecord.lunchIn,
        }
      : null,
  )
  const dayComplete = dayCompleteProp || progress.dayComplete
  const nextAction: AttendanceAction | null =
    dayComplete || blockCheckIn ? null : progress.nextAction
  const canCheckoutNow = !dayComplete && !blockCheckIn && progress.canCheckoutNow

  const stepDone = (key: AttendanceAction) => {
    if (!todayRecord) return false
    if (key === 'checkin') return !!todayRecord.checkIn
    if (key === 'lunch-out') return !!todayRecord.lunchOut
    if (key === 'lunch-in') return !!todayRecord.lunchIn
    if (key === 'checkout') return !!todayRecord.checkOut
    return false
  }

  const scanOpen = !!(selectedType || lunchPanel)

  const handleMainAction = () => {
    if (isPending || !nextAction || !faceRegistered) return
    if (nextAction === 'checkin') {
      setSelectedType(checkinLocationType)
      setLunchPanel(null)
    } else {
      setSelectedType(null)
      setLunchPanel(nextAction)
    }
  }

  const closeScan = () => {
    setSelectedType(null)
    setLunchPanel(null)
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '--:--'
    return new Date(iso).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok',
    })
  }
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      weekday: 'short',
      timeZone: 'Asia/Bangkok',
    })
  }

  const calcWorkMinutes = (
    checkIn: string | null,
    checkOut: string | null,
    lunchOut: string | null,
    lunchIn: string | null,
  ): number | null => {
    if (!checkIn || !checkOut) return null
    const spanMs = new Date(checkOut).getTime() - new Date(checkIn).getTime()
    const breakMs = lunchOut && lunchIn
      ? Math.max(0, new Date(lunchIn).getTime() - new Date(lunchOut).getTime())
      : 0
    return Math.max(0, Math.round((spanMs - breakMs) / 60000))
  }

  const fmtMins = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h === 0) return `${m} นาที`
    if (m === 0) return `${h} ชม.`
    return `${h} ชม. ${m} นาที`
  }

  const handleSuccess = () => {
    setSelectedType(null)
    setLunchPanel(null)
    setJustCompleted(true)   // ปิดปุ่ม checkin ทันที — ป้องกัน double-press บนมือถือ
    setRefreshKey((k) => k + 1)
    // router.refresh() re-fetches server component data (ทำงานได้บน mobile PWA ต่างจาก window.location.reload)
    startTransition(() => {
      router.refresh()
    })
  }

  const todayPhotos = todayRecord
    ? [
        { key: 'in', label: 'เช็คอิน', url: todayRecord.photoUrl, time: todayRecord.checkIn },
        { key: 'lunch-out', label: 'เริ่มพัก', url: todayRecord.lunchOutPhotoUrl, time: todayRecord.lunchOut },
        { key: 'lunch-in', label: 'กลับจากพัก', url: todayRecord.lunchInPhotoUrl, time: todayRecord.lunchIn },
        { key: 'out', label: 'เช็คเอาท์', url: todayRecord.checkOutPhotoUrl, time: todayRecord.checkOut },
      ]
    : []

  return (
    <div className="p-4 md:p-5 space-y-4">
      {/* Header + Tabs row */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">ลงเวลางาน</h1>
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
          {[
            { id: 'today',   label: 'วันนี้',  icon: <Clock className="w-3.5 h-3.5" /> },
            { id: 'history', label: 'ประวัติ', icon: <Calendar className="w-3.5 h-3.5" /> },
            ...(isManager ? [{ id: 'team', label: 'ทีม', icon: <Users className="w-3.5 h-3.5" /> }] : []),
          ].map((tab) => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setSelectedType(null) }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white/80'
              }`}>
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Realtime Clock */}
      <RealtimeClock />

      {/* Today Tab */}
      {activeTab === 'today' && (
        <div className="space-y-4">
          {/* Status summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl p-3 text-center bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm">
              <p className="text-[11px] text-slate-500 mb-1">เช็คอิน</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatTime(todayRecord?.checkIn ?? null)}</p>
              {(todayRecord?.lateMinutes ?? 0) > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-yellow-400 mt-0.5">สาย {formatLateMinutes(todayRecord!.lateMinutes)}</p>
              )}
            </div>
            <div className="rounded-xl p-3 text-center bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm">
              <p className="text-[11px] text-slate-500 mb-1">เช็คเอาท์</p>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{formatTime(todayRecord?.checkOut ?? null)}</p>
            </div>
            <div className="rounded-xl p-3 text-center bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm">
              <p className="text-[11px] text-slate-500 mb-1">สถานะ</p>
              {todayRecord ? (
                <p className={`text-sm font-bold ${STATUS_LABEL[todayRecord.status]?.color ?? 'text-slate-900 dark:text-white'}`}>
                  {STATUS_LABEL[todayRecord.status]?.label ?? todayRecord.status}
                </p>
              ) : (
                <p className="text-sm text-slate-500">—</p>
              )}
            </div>
            <div className="rounded-xl p-3 text-center bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm">
              <p className="text-[11px] text-slate-500 mb-1">ประเภท</p>
              {todayRecord ? (
                <p className={`text-sm font-bold ${todayRecord.isOutside ? 'text-orange-700 dark:text-orange-400' : 'text-cyan-700 dark:text-cyan-400'}`}>
                  {todayRecord.isOutside ? 'นอกสถานที่' : 'ในบริษัท'}
                </p>
              ) : (
                <p className="text-sm text-slate-500">—</p>
              )}
            </div>
          </div>

          {companyGeofence && (
            <div className="rounded-xl px-3.5 py-2.5 space-y-1 bg-cyan-50 dark:bg-cyan-500/[0.08] border border-cyan-200 dark:border-cyan-500/20">
              <p className="text-[10px] text-cyan-700 dark:text-cyan-400 font-semibold">พิกัดสำนักงาน (Geofence)</p>
              <p className="text-xs text-slate-800 dark:text-white font-mono">
                {companyGeofence.lat.toFixed(5)}, {companyGeofence.lng.toFixed(5)}
                <span className="text-slate-500 font-sans ml-2">รัศมี {companyGeofence.radiusM} ม.</span>
              </p>
              <p className="text-[10px] text-slate-500 line-clamp-2">{companyGeofence.address}</p>
            </div>
          )}

          {todayRecord?.address && (
            <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/[0.06]">
              <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">GPS ล่าสุด: {todayRecord.address}</span>
            </div>
          )}

          {todayRecord?.checkIn && <AttendancePhotos items={todayPhotos} />}

          {todayRecord?.checkIn && (
            <AttendanceTimeline
              checkIn={todayRecord.checkIn}
              lunchOut={todayRecord.lunchOut}
              lunchIn={todayRecord.lunchIn}
              checkOut={todayRecord.checkOut}
              workPlaceName={todayRecord.workPlaceName}
              autoCheckout={todayRecord.autoCheckout}
            />
          )}

          {/* Daily summary — แสดงหลังเช็คเอาท์ */}
          {dayComplete && todayRecord?.checkOut && (() => {
            const workMins = calcWorkMinutes(
              todayRecord.checkIn, todayRecord.checkOut,
              todayRecord.lunchOut, todayRecord.lunchIn,
            )
            const breakMins = todayRecord.lunchOut && todayRecord.lunchIn
              ? Math.max(0, Math.round((new Date(todayRecord.lunchIn).getTime() - new Date(todayRecord.lunchOut).getTime()) / 60000))
              : null
            const late = todayRecord.lateMinutes ?? 0
            return (
              <div className="rounded-xl p-4 space-y-3 bg-blue-50 dark:bg-slate-900/70 border border-blue-100 dark:border-blue-500/20">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">สรุปวันนี้</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">เข้างาน</span>
                    <span className="text-green-700 dark:text-green-400 font-medium">{formatTime(todayRecord.checkIn)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ออกงาน</span>
                    <span className="text-blue-700 dark:text-blue-400 font-medium">{formatTime(todayRecord.checkOut)}</span>
                  </div>
                  {todayRecord.lunchOut && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">พักออก</span>
                      <span className="text-amber-700 dark:text-amber-400 font-medium">{formatTime(todayRecord.lunchOut)}</span>
                    </div>
                  )}
                  {todayRecord.lunchIn && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">พักกลับ</span>
                      <span className="text-amber-600 dark:text-amber-300 font-medium">{formatTime(todayRecord.lunchIn)}</span>
                    </div>
                  )}
                  {workMins !== null && (
                    <div className="flex justify-between col-span-2 border-t border-slate-200 dark:border-white/5 pt-2 mt-1">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">ทำงานจริง</span>
                      <span className="text-slate-900 dark:text-white font-semibold">{fmtMins(workMins)}</span>
                    </div>
                  )}
                  {breakMins !== null && (
                    <div className="flex justify-between col-span-2">
                      <span className="text-slate-500 dark:text-slate-400">พักรวม</span>
                      <span className="text-slate-700 dark:text-slate-300">{fmtMins(breakMins)}</span>
                    </div>
                  )}
                  {late > 0 && (
                    <div className="flex justify-between col-span-2">
                      <span className="text-slate-500 dark:text-slate-400">มาสาย</span>
                      <span className="text-amber-700 dark:text-yellow-400 font-medium">{fmtMins(late)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── ปุ่มเดียว — เปลี่ยนตามลำดับ 1→2→3→4 ── */}
          {!scanOpen && dayComplete && faceRegistered && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-1 px-1">
                {ACTION_STEPS.map((step) => (
                  <div key={step.key} className="flex flex-1 flex-col items-center gap-1 min-w-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold bg-green-500/20 text-green-400 ring-1 ring-green-500/40">
                      ✓
                    </div>
                    <span className="text-[9px] text-center text-green-400/80 truncate w-full">{step.label}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled
                className="w-full flex flex-col items-center justify-center gap-1 rounded-2xl py-5 px-4 text-slate-500 dark:text-slate-400 font-bold cursor-not-allowed opacity-70 bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10"
              >
                <span className="text-2xl">✅</span>
                <span className="text-base">ลงเวลาครบแล้ว</span>
                <span className="text-[11px] font-normal text-slate-500">
                  {todayRecord?.checkIn && todayRecord?.checkOut
                    ? `${formatTime(todayRecord.checkIn)} — ${formatTime(todayRecord.checkOut)} น.`
                    : 'พรุ่งนี้จึงจะลงเวลาใหม่ได้'}
                </span>
              </button>
            </div>
          )}

          {!scanOpen && nextAction && faceRegistered && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-1 px-1">
                {ACTION_STEPS.map((step, i) => {
                  const done = stepDone(step.key)
                  const current = step.key === nextAction
                  return (
                    <div key={step.key} className="flex flex-1 flex-col items-center gap-1 min-w-0">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                          done ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                          : current ? 'bg-blue-600 text-white ring-2 ring-blue-400/50 scale-110'
                          : 'bg-white/5 text-slate-600'
                        }`}
                      >
                        {done ? '✓' : step.short}
                      </div>
                      <span className={`text-[9px] text-center leading-tight truncate w-full ${
                        current ? 'text-white font-semibold' : done ? 'text-green-400/80' : 'text-slate-600'
                      }`}>
                        {step.label}
                      </span>
                      {i < ACTION_STEPS.length - 1 && (
                        <div className="absolute hidden" aria-hidden />
                      )}
                    </div>
                  )
                })}
              </div>

              {nextAction === 'checkin' && (
                <div className="flex gap-2">
                  {(['company', 'outside'] as LocationType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCheckinLocationType(t)}
                      className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                        checkinLocationType === t
                          ? t === 'company'
                            ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40'
                            : 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
                          : 'bg-white/5 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {t === 'company' ? '🏢 ในบริษัท' : '📍 นอกสถานที่'}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={isPending}
                onClick={handleMainAction}
                className="w-full flex flex-col items-center justify-center gap-1 rounded-2xl py-5 px-4 text-white font-bold transition-all active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                style={{ background: ACTION_STYLE[nextAction].grad }}
              >
                <span className="text-2xl">{ACTION_STYLE[nextAction].icon}</span>
                <span className="text-base">{ACTION_STEPS.find((s) => s.key === nextAction)?.label}</span>
                <span className="text-[11px] font-normal text-white/70">กดเพื่อสแกนใบหน้า</span>
              </button>

              {/* เช็คเอาท์โดยไม่พักกลางวัน — แสดงเฉพาะเมื่ออยู่ใน working state */}
              {canCheckoutNow && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => { setSelectedType(null); setLunchPanel('checkout') }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-semibold text-blue-700 dark:text-slate-300 bg-blue-100 dark:bg-blue-500/12 border border-blue-300 dark:border-blue-500/30 transition-all active:scale-[0.98] hover:bg-blue-200 dark:hover:text-white disabled:opacity-50"
                >
                  <span>🔵</span>
                  <span>เช็คเอาท์ (ไม่พักกลางวัน)</span>
                </button>
              )}
            </div>
          )}

          {/* Scan panel */}
          {scanOpen && (
            <div className="space-y-2">
              <button type="button" onClick={closeScan}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
                ยกเลิก
              </button>
              {selectedType && (
                <CheckInPanel
                  type="checkin"
                  locationType={selectedType}
                  companyOffice={selectedType === 'company' ? companyOffice : null}
                  companyGeofence={selectedType === 'company' ? companyGeofence : null}
                  faceRequired={faceRegistered}
                  quickStart
                  userId={userId}
                  employeeName={userName}
                  employeeCode={employeeCode}
                  onSuccess={handleSuccess}
                />
              )}
              {lunchPanel && (
                <CheckInPanel
                  type={lunchPanel === 'checkout' ? 'checkout' : lunchPanel}
                  locationType={lunchPanel === 'checkout' ? (todayRecord?.isOutside ? 'outside' : 'company') : undefined}
                  companyOffice={companyOffice}
                  companyGeofence={companyGeofence}
                  faceRequired={faceRegistered}
                  quickStart
                  userId={userId}
                  employeeName={userName}
                  employeeCode={employeeCode}
                  onSuccess={handleSuccess}
                />
              )}
            </div>
          )}


          {(!faceRegistered || showFaceUpdate) && (
            <FaceRegistrationCard
              allowUpdate={faceRegistered}
              onRegistered={() => {
                setFaceRegistered(true)
                setShowFaceUpdate(false)
                setRefreshKey((k) => k + 1)
              }}
              onCancelUpdate={() => setShowFaceUpdate(false)}
            />
          )}

          {faceRegistered && !showFaceUpdate && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ScanFace className="w-3.5 h-3.5 text-blue-400" />
                ลงทะเบียนใบหน้าแล้ว — สแกนใบหน้าตรงกล้องเพื่อลงเวลา
              </p>
              <button type="button" onClick={() => setShowFaceUpdate(true)}
                className="text-[10px] text-blue-400 hover:text-blue-300 underline">
                อัปเดตใบหน้า
              </button>
            </div>
          )}

          {/* Leave balance */}
          {leaveBalance && (
            <div className="flex items-center gap-4 rounded-xl px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/[0.06]">
              <p className="text-[10px] text-slate-500 flex-shrink-0">วันลาคงเหลือ</p>
              <div className="flex gap-4 text-xs">
                <span className="text-slate-500 dark:text-slate-400">ป่วย <strong className="text-slate-900 dark:text-white">{leaveBalance.sick}</strong></span>
                <span className="text-slate-500 dark:text-slate-400">พักร้อน <strong className="text-slate-900 dark:text-white">{leaveBalance.vacation}</strong></span>
                <span className="text-slate-500 dark:text-slate-400">กิจ <strong className="text-slate-900 dark:text-white">{leaveBalance.personal}</strong></span>
              </div>
            </div>
          )}

          <AttendanceLocalHistory userId={userId} refreshKey={refreshKey} />

          {/* Map */}
          {todayRecord?.lat && todayRecord?.lng && (
            <MapView lat={todayRecord.lat} lng={todayRecord.lng} label="ตำแหน่งเช็คอิน" />
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="rounded-2xl overflow-hidden bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.07]">
                  <th className="text-left p-3 text-[11px] text-slate-500 font-medium">วันที่</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">รอบ</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">เข้า</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">พักออก</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">พักกลับ</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">ออก</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">ชม.ทำงาน</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">แผนที่</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">สถานะ</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">ประเภท</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((r) => {
                  const s = STATUS_LABEL[r.status] ?? { label: r.status, color: 'text-white/60' }
                  return (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">{formatDate(r.date)}</td>
                      <td className="p-3 text-center text-slate-500 dark:text-slate-400 text-xs">{r.sessionIndex ?? 1}</td>
                      <td className="p-3 text-center text-green-700 dark:text-green-400 font-medium text-xs">{formatTime(r.checkIn)}</td>
                      <td className="p-3 text-center text-amber-700 dark:text-amber-400 font-medium text-xs">{formatTime(r.lunchOut)}</td>
                      <td className="p-3 text-center text-amber-600 dark:text-amber-300 font-medium text-xs">{formatTime(r.lunchIn)}</td>
                      <td className="p-3 text-center text-xs">
                        <span className={r.checkOut ? (r.autoCheckout ? 'text-orange-700 dark:text-orange-400' : 'text-blue-700 dark:text-blue-400') : 'text-slate-400'}>
                          {formatTime(r.checkOut)}
                        </span>
                        {r.autoCheckout && r.checkOut && (
                          <span className="block text-[9px] text-orange-600 dark:text-orange-400/70 mt-0.5">ระบบปิดอัตโนมัติ</span>
                        )}
                      </td>
                      <td className="p-3 text-center text-slate-700 dark:text-slate-300 text-xs">
                        {(() => {
                          const m = calcWorkMinutes(r.checkIn, r.checkOut, r.lunchOut, r.lunchIn)
                          if (m === null) return <span className="text-slate-600">—</span>
                          const h = Math.floor(m / 60)
                          const min = m % 60
                          return `${h}:${String(min).padStart(2, '0')}`
                        })()}
                      </td>
                      <td className="p-3 text-center">
                        {r.lat != null && r.lng != null ? (
                          <a
                            href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            ดูแผนที่
                          </a>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
                        {r.lateMinutes > 0 && (
                          <span className="ml-1 text-[10px] text-amber-600 dark:text-yellow-400">+{formatLateMinutesShort(r.lateMinutes)}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {r.isOutside ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:text-orange-400">
                            <Navigation className="w-2.5 h-2.5" /> นอก
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 dark:bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:text-cyan-400">
                            <Building2 className="w-2.5 h-2.5" /> ใน
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {recentRecords.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-600 text-sm">ยังไม่มีข้อมูล</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team Tab (Manager only) */}
      {activeTab === 'team' && isManager && (
        <div className="space-y-3">
          <p className="text-slate-500 text-xs">
            พนักงานทั้งหมด {allToday.length} คน · เช็คอินแล้ว {allToday.filter((e) => e.hasCheckedIn).length} คน
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allToday.map((emp) => {
              const s = STATUS_LABEL[emp.status] ?? { label: emp.status, color: 'text-white/60' }
              return (
                <div key={emp.id} className="flex items-center gap-3 rounded-xl p-3.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] shadow-sm">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                    {emp.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-900 dark:text-white font-semibold text-sm truncate">{emp.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {emp.department ?? '—'} ·{' '}
                      {emp.hasCheckedIn
                        ? `${formatTime(emp.checkIn)} — ${formatTime(emp.checkOut)}`
                        : 'ยังไม่ลงเวลาวันนี้'}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold flex-shrink-0 ${s.color}`}>{s.label}</span>
                </div>
              )
            })}
            {allToday.length === 0 && (
              <div className="col-span-3 text-center text-slate-600 py-10 text-sm">ไม่พบพนักงานในระบบ</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
