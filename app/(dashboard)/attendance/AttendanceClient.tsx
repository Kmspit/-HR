'use client'

import { useState } from 'react'
import { Clock, MapPin, Users, Calendar, CheckCircle, Building2, Navigation } from 'lucide-react'
import dynamic from 'next/dynamic'
import CheckInPanel, { type CompanyGeofence } from '@/components/dashboard/CheckInPanel'
import RealtimeClock from '@/components/dashboard/RealtimeClock'
import AttendanceTimeline from '@/components/dashboard/AttendanceTimeline'
import AttendancePhotos from '@/components/dashboard/AttendancePhotos'
import { Coffee } from 'lucide-react'

const MapView = dynamic(() => import('@/components/dashboard/MapView'), { ssr: false })

type TodayRecord = {
  id: string
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
}

type RecentRecord = {
  id: string
  date: string
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
}

type Props = {
  role: string
  companyOffice: { name: string; address: string } | null
  companyGeofence: CompanyGeofence | null
  todayRecord: TodayRecord | null
  recentRecords: RecentRecord[]
  leaveBalance: { sick: number; vacation: number; personal: number } | null
  allToday: { id: string; name: string; status: string; checkIn: string | null; checkOut: string | null }[]
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  NORMAL:   { label: 'ปกติ',      color: 'text-green-400' },
  LATE:     { label: 'มาสาย',    color: 'text-yellow-400' },
  ABSENT:   { label: 'ขาดงาน',   color: 'text-red-400' },
  LEAVE:    { label: 'ลา',        color: 'text-blue-400' },
  OT:       { label: 'OT',        color: 'text-purple-400' },
  HALF_DAY: { label: 'ครึ่งวัน', color: 'text-orange-400' },
  EARLY_LEAVE: { label: 'กลับก่อน', color: 'text-orange-400' },
}

type LocationType = 'company' | 'outside'

export default function AttendanceClient({ role, companyOffice, companyGeofence, todayRecord, recentRecords, leaveBalance, allToday }: Props) {
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'team'>('today')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedType, setSelectedType] = useState<LocationType | null>(null)
  const [lunchPanel, setLunchPanel] = useState<'lunch-out' | 'lunch-in' | null>(null)

  const isManager = ['MANAGER_HR', 'ADMIN'].includes(role)
  const canCheckIn = !todayRecord?.checkIn
  const canCheckOut = !!todayRecord?.checkIn && !todayRecord?.checkOut
  const canLunchOut = !!todayRecord?.checkIn && !todayRecord?.lunchOut && !todayRecord?.checkOut
  const canLunchIn = !!todayRecord?.lunchOut && !todayRecord?.lunchIn && !todayRecord?.checkOut

  const formatTime = (iso: string | null) => {
    if (!iso) return '--:--'
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', weekday: 'short' })
  }

  const handleSuccess = () => {
    setSelectedType(null)
    setLunchPanel(null)
    setRefreshKey((k) => k + 1)
    setTimeout(() => window.location.reload(), 800)
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
        <h1 className="text-lg font-bold text-white">ลงเวลางาน</h1>
        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {[
            { id: 'today',   label: 'วันนี้',  icon: <Clock className="w-3.5 h-3.5" /> },
            { id: 'history', label: 'ประวัติ', icon: <Calendar className="w-3.5 h-3.5" /> },
            ...(isManager ? [{ id: 'team', label: 'ทีม', icon: <Users className="w-3.5 h-3.5" /> }] : []),
          ].map((tab) => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setSelectedType(null) }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-white/50 hover:text-white/80'
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
            <div className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] text-slate-500 mb-1">เช็คอิน</p>
              <p className="text-lg font-bold text-green-400">{formatTime(todayRecord?.checkIn ?? null)}</p>
              {(todayRecord?.lateMinutes ?? 0) > 0 && (
                <p className="text-[10px] text-yellow-400 mt-0.5">สาย {todayRecord!.lateMinutes} นาที</p>
              )}
            </div>
            <div className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] text-slate-500 mb-1">เช็คเอาท์</p>
              <p className="text-lg font-bold text-blue-400">{formatTime(todayRecord?.checkOut ?? null)}</p>
            </div>
            <div className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] text-slate-500 mb-1">สถานะ</p>
              {todayRecord ? (
                <p className={`text-sm font-bold ${STATUS_LABEL[todayRecord.status]?.color ?? 'text-white'}`}>
                  {STATUS_LABEL[todayRecord.status]?.label ?? todayRecord.status}
                </p>
              ) : (
                <p className="text-sm text-slate-500">—</p>
              )}
            </div>
            <div className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] text-slate-500 mb-1">ประเภท</p>
              {todayRecord ? (
                <p className={`text-sm font-bold ${todayRecord.isOutside ? 'text-orange-400' : 'text-cyan-400'}`}>
                  {todayRecord.isOutside ? 'นอกสถานที่' : 'ในบริษัท'}
                </p>
              ) : (
                <p className="text-sm text-slate-500">—</p>
              )}
            </div>
          </div>

          {companyGeofence && (
            <div className="rounded-xl px-3.5 py-2.5 space-y-1"
              style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <p className="text-[10px] text-cyan-400 font-semibold">พิกัดสำนักงาน (Geofence)</p>
              <p className="text-xs text-white font-mono">
                {companyGeofence.lat.toFixed(5)}, {companyGeofence.lng.toFixed(5)}
                <span className="text-slate-500 font-sans ml-2">รัศมี {companyGeofence.radiusM} ม.</span>
              </p>
              <p className="text-[10px] text-slate-500 line-clamp-2">{companyGeofence.address}</p>
            </div>
          )}

          {todayRecord?.address && (
            <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
              style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span className="text-xs text-slate-400 truncate">GPS ล่าสุด: {todayRecord.address}</span>
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
            />
          )}

          {(canLunchOut || canLunchIn) && !lunchPanel && (
            <div className="flex gap-2">
              {canLunchOut && (
                <button
                  type="button"
                  onClick={() => setLunchPanel('lunch-out')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600/90 text-white text-sm font-semibold"
                >
                  <Coffee className="w-4 h-4" />
                  เริ่มพักกลางวัน (ถ่ายรูป)
                </button>
              )}
              {canLunchIn && (
                <button
                  type="button"
                  onClick={() => setLunchPanel('lunch-in')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/80 text-white text-sm font-semibold"
                >
                  <Coffee className="w-4 h-4" />
                  สิ้นพักกลางวัน (ถ่ายรูป)
                </button>
              )}
            </div>
          )}

          {lunchPanel && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setLunchPanel(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ← ยกเลิก
              </button>
              <CheckInPanel
                type={lunchPanel}
                companyOffice={companyOffice}
                companyGeofence={companyGeofence}
                onSuccess={handleSuccess}
              />
            </div>
          )}

          {/* Leave balance */}
          {leaveBalance && (
            <div className="flex items-center gap-4 rounded-xl px-3.5 py-2.5"
              style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] text-slate-500 flex-shrink-0">วันลาคงเหลือ</p>
              <div className="flex gap-4 text-xs">
                <span className="text-slate-400">ป่วย <strong className="text-white">{leaveBalance.sick}</strong></span>
                <span className="text-slate-400">พักร้อน <strong className="text-white">{leaveBalance.vacation}</strong></span>
                <span className="text-slate-400">กิจ <strong className="text-white">{leaveBalance.personal}</strong></span>
              </div>
            </div>
          )}

          {/* ─── Check-in/out area ─── */}
          {canCheckIn && !selectedType && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">เลือกประเภทการเช็คอิน</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* In-company */}
                <button
                  onClick={() => setSelectedType('company')}
                  className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                  style={{
                    background: 'linear-gradient(135deg,rgba(6,182,212,0.12),rgba(59,130,246,0.08))',
                    border: '1px solid rgba(6,182,212,0.25)',
                    boxShadow: '0 4px 20px rgba(6,182,212,0.08)',
                  }}
                >
                  <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-20 blur-2xl"
                    style={{ background: 'radial-gradient(circle,#06b6d4,transparent)' }} />
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: 'linear-gradient(135deg,#06b6d4,#3b82f6)', boxShadow: '0 4px 12px rgba(6,182,212,0.35)' }}>
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-bold text-white">เช็คอิน ในบริษัท</p>
                  <p className="mt-1 text-xs text-slate-300 line-clamp-2">
                    {companyOffice?.name ?? 'สำนักงาน'}
                  </p>
                  {companyOffice?.address && (
                    <p className="mt-1 text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                      {companyOffice.address}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-cyan-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    ตรวจสอบ Geofence อัตโนมัติ
                  </div>
                </button>

                {/* Outside */}
                <button
                  onClick={() => setSelectedType('outside')}
                  className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                  style={{
                    background: 'linear-gradient(135deg,rgba(249,115,22,0.12),rgba(239,68,68,0.08))',
                    border: '1px solid rgba(249,115,22,0.25)',
                    boxShadow: '0 4px 20px rgba(249,115,22,0.08)',
                  }}
                >
                  <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-20 blur-2xl"
                    style={{ background: 'radial-gradient(circle,#f97316,transparent)' }} />
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)', boxShadow: '0 4px 12px rgba(249,115,22,0.35)' }}>
                    <Navigation className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-bold text-white">เช็คอิน นอกสถานที่</p>
                  <p className="mt-1 text-xs text-slate-400">สำหรับงานนอกบริษัท / ลูกค้า / Field</p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-orange-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    บันทึก GPS ตำแหน่งงาน
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Check-in panel after type selected */}
          {canCheckIn && selectedType && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedType(null)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  เปลี่ยนประเภท
                </button>
                <div className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  selectedType === 'company'
                    ? 'bg-cyan-500/15 text-cyan-400'
                    : 'bg-orange-500/15 text-orange-400'
                }`}>
                  {selectedType === 'company'
                    ? <><Building2 className="w-3 h-3" /> ในบริษัท</>
                    : <><Navigation className="w-3 h-3" /> นอกสถานที่</>
                  }
                </div>
              </div>
              <CheckInPanel
                type="checkin"
                locationType={selectedType}
                companyOffice={selectedType === 'company' ? companyOffice : null}
                companyGeofence={selectedType === 'company' ? companyGeofence : null}
                onSuccess={handleSuccess}
              />
            </div>
          )}

          {/* Checkout */}
          {canCheckOut && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${
                  todayRecord?.isOutside ? 'bg-orange-500/15 text-orange-400' : 'bg-cyan-500/15 text-cyan-400'
                }`}>
                  {todayRecord?.isOutside ? <><Navigation className="w-3 h-3" /> นอกสถานที่</> : <><Building2 className="w-3 h-3" /> ในบริษัท</>}
                </span>
                เช็คเอาท์
              </p>
              <CheckInPanel
                type="checkout"
                locationType={todayRecord?.isOutside ? 'outside' : 'company'}
                companyOffice={!todayRecord?.isOutside ? companyOffice : null}
                companyGeofence={!todayRecord?.isOutside ? companyGeofence : null}
                onSuccess={handleSuccess}
              />
            </div>
          )}

          {/* Done */}
          {!canCheckIn && !canCheckOut && todayRecord && (
            <div className="flex flex-col items-center gap-3 rounded-2xl py-8"
              style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)' }}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: 'rgba(34,197,94,0.12)' }}>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <p className="font-bold text-white">เช็คอิน-เช็คเอาท์ครบแล้ว</p>
              <p className="text-sm text-slate-500">
                {formatTime(todayRecord.checkIn)} — {formatTime(todayRecord.checkOut)} น.
              </p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                todayRecord.isOutside ? 'bg-orange-500/15 text-orange-400' : 'bg-cyan-500/15 text-cyan-400'
              }`}>
                {todayRecord.isOutside ? '📍 นอกสถานที่' : '🏢 ในบริษัท'}
              </span>
            </div>
          )}

          {/* Map */}
          {todayRecord?.lat && todayRecord?.lng && (
            <MapView lat={todayRecord.lat} lng={todayRecord.lng} label="ตำแหน่งเช็คอิน" />
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <th className="text-left p-3 text-[11px] text-slate-500 font-medium">วันที่</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">เข้า</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">พักออก</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">พักกลับ</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">ออก</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">แผนที่</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">สถานะ</th>
                  <th className="text-center p-3 text-[11px] text-slate-500 font-medium">ประเภท</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((r) => {
                  const s = STATUS_LABEL[r.status] ?? { label: r.status, color: 'text-white/60' }
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-slate-300 text-xs">{formatDate(r.date)}</td>
                      <td className="p-3 text-center text-green-400 font-medium text-xs">{formatTime(r.checkIn)}</td>
                      <td className="p-3 text-center text-amber-400/80 font-medium text-xs">{formatTime(r.lunchOut)}</td>
                      <td className="p-3 text-center text-amber-300/80 font-medium text-xs">{formatTime(r.lunchIn)}</td>
                      <td className="p-3 text-center text-blue-400 font-medium text-xs">{formatTime(r.checkOut)}</td>
                      <td className="p-3 text-center">
                        {r.lat != null && r.lng != null ? (
                          <a
                            href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-400 hover:underline"
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
                          <span className="ml-1 text-[10px] text-yellow-400">+{r.lateMinutes}น</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {r.isOutside ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
                            <Navigation className="w-2.5 h-2.5" /> นอก
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
                            <Building2 className="w-2.5 h-2.5" /> ใน
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {recentRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-600 text-sm">ยังไม่มีข้อมูล</td>
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
          <p className="text-slate-500 text-xs">พนักงานที่เช็คอินวันนี้ ({allToday.length} คน)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allToday.map((emp) => {
              const s = STATUS_LABEL[emp.status] ?? { label: emp.status, color: 'text-white/60' }
              return (
                <div key={emp.id} className="flex items-center gap-3 rounded-xl p-3.5"
                  style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                    {emp.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-sm truncate">{emp.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {formatTime(emp.checkIn)} — {formatTime(emp.checkOut)}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold flex-shrink-0 ${s.color}`}>{s.label}</span>
                </div>
              )
            })}
            {allToday.length === 0 && (
              <div className="col-span-3 text-center text-slate-600 py-10 text-sm">ยังไม่มีพนักงานเช็คอินวันนี้</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
