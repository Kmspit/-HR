'use client'

import { useEffect, useState } from 'react'
import { X, Building2, Navigation, AlertCircle, MapPin } from 'lucide-react'
import { formatTimeBangkok, formatDateBangkok } from '@/lib/datetime-bangkok'
import { formatLateMinutes } from '@/lib/utils'
import AttendancePhotos, { type AttendancePhotoItem } from '@/components/dashboard/AttendancePhotos'

type AttendanceDetail = {
  id: string
  date: string
  sessionIndex: number
  checkIn: string | null
  checkOut: string | null
  lunchOut: string | null
  lunchIn: string | null
  status: string
  lateMinutes: number
  earlyLeaveMinutes: number
  isOutside: boolean
  workPlaceName: string | null
  address: string | null
  checkInLat: number | null
  checkInLng: number | null
  checkInAddress: string | null
  checkOutLat: number | null
  checkOutLng: number | null
  checkOutAddress: string | null
  autoCheckout: boolean
  note: string | null
  gpsAccuracy: number | null
  photoUrl: string | null
  checkOutPhotoUrl: string | null
  lunchOutPhotoUrl: string | null
  lunchInPhotoUrl: string | null
  user: { name: string; department: string | null; employeeId: string | null }
  branch: { name: string; address: string | null } | null
  outsideWork: {
    place: string
    purpose: string
    client: string | null
    googleMapsUrl: string | null
    status: string
  } | null
}

const STATUS_LABEL: Record<string, string> = {
  NORMAL: 'ปกติ',
  LATE: 'มาสาย',
  ABSENT: 'ขาดงาน',
  LEAVE: 'ลา',
  OT: 'OT',
  HALF_DAY: 'ครึ่งวัน',
  EARLY_LEAVE: 'กลับก่อน',
}

const STATUS_COLOR: Record<string, string> = {
  NORMAL:      'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-500/10',
  LATE:        'text-amber-700 dark:text-yellow-400 bg-amber-100 dark:bg-yellow-500/10',
  ABSENT:      'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/10',
  LEAVE:       'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10',
  OT:          'text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10',
  HALF_DAY:    'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10',
  EARLY_LEAVE: 'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10',
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
      <span className="text-[12px] text-slate-500 dark:text-slate-400 flex-shrink-0 w-28 pt-0.5">{label}</span>
      <span className="text-[13px] text-slate-800 dark:text-slate-200 font-medium flex-1 min-w-0">{children}</span>
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-4 py-1">
      {children}
    </div>
  )
}

type Props = { recordId: string; onClose: () => void }

export default function AttendanceDetailModal({ recordId, onClose }: Props) {
  const [detail, setDetail] = useState<AttendanceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setDetail(null)
    fetch(`/api/attendance/${recordId}`)
      .then((r) => r.json())
      .then((data: AttendanceDetail & { error?: string }) => {
        if (data.error) setError(data.error)
        else setDetail(data)
      })
      .catch(() => setError('ไม่สามารถโหลดข้อมูลได้'))
      .finally(() => setLoading(false))
  }, [recordId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const photos: AttendancePhotoItem[] = detail ? [
    { key: 'checkin',   label: 'เช็คอิน',   url: detail.photoUrl,         time: detail.checkIn   },
    { key: 'lunch-out', label: 'พักออก',    url: detail.lunchOutPhotoUrl, time: detail.lunchOut  },
    { key: 'lunch-in',  label: 'พักกลับ',   url: detail.lunchInPhotoUrl,  time: detail.lunchIn   },
    { key: 'checkout',  label: 'เช็คเอาท์', url: detail.checkOutPhotoUrl, time: detail.checkOut  },
  ] : []

  const hasPhotos = photos.some((p) => p.url)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel: bottom-sheet on mobile, centered modal on desktop */}
      <div
        role="dialog"
        aria-modal
        aria-label="รายละเอียดการลงเวลา"
        className="fixed z-50 inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center md:p-4"
      >
        <div
          className="relative w-full md:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[88vh] md:border md:border-slate-200 md:dark:border-white/[0.07]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile drag handle */}
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              {detail?.isOutside
                ? <Navigation className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                : <Building2 className="w-4 h-4 text-cyan-700 dark:text-cyan-400 flex-shrink-0" />
              }
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white leading-tight">
                  {loading ? 'รายละเอียดการลงเวลา' : detail?.isOutside ? 'ลงเวลานอกสถานที่' : 'ลงเวลาในสำนักงาน'}
                </h2>
                {detail && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">
                    {formatDateBangkok(detail.date)} · รอบที่ {detail.sessionIndex}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.07] transition-colors flex-shrink-0"
              aria-label="ปิด"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">

            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                <p className="text-sm text-slate-500">กำลังโหลดข้อมูล...</p>
              </div>
            )}

            {error && !loading && (
              <div className="flex items-center gap-2 rounded-xl p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {detail && !loading && (
              <>
                {/* ── พนักงาน ── */}
                <Section>
                  <InfoRow label="ชื่อ">{detail.user.name}</InfoRow>
                  {detail.user.employeeId && (
                    <InfoRow label="รหัสพนักงาน">{detail.user.employeeId}</InfoRow>
                  )}
                  <InfoRow label="แผนก">{detail.user.department ?? '—'}</InfoRow>
                </Section>

                {/* ── เวลา ── */}
                <Section>
                  <InfoRow label="เช็คอิน">
                    <span className="text-green-700 dark:text-green-400">
                      {detail.checkIn ? formatTimeBangkok(detail.checkIn) : '—'}
                    </span>
                  </InfoRow>
                  {detail.lunchOut && (
                    <InfoRow label="พักออก">
                      <span className="text-amber-700 dark:text-amber-400">{formatTimeBangkok(detail.lunchOut)}</span>
                    </InfoRow>
                  )}
                  {detail.lunchIn && (
                    <InfoRow label="พักกลับ">
                      <span className="text-amber-600 dark:text-amber-300">{formatTimeBangkok(detail.lunchIn)}</span>
                    </InfoRow>
                  )}
                  <InfoRow label="เช็คเอาท์">
                    <span className={detail.checkOut ? (detail.autoCheckout ? 'text-orange-700 dark:text-orange-400' : 'text-blue-700 dark:text-blue-400') : 'text-slate-400'}>
                      {detail.checkOut ? formatTimeBangkok(detail.checkOut) : '—'}
                    </span>
                    {detail.autoCheckout && detail.checkOut && (
                      <span className="ml-2 text-[10px] text-orange-600 dark:text-orange-400/70">(ระบบปิดอัตโนมัติ)</span>
                    )}
                  </InfoRow>
                </Section>

                {/* ── สถานะ / ประเภท ── */}
                <Section>
                  <InfoRow label="สถานะ">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[detail.status] ?? 'text-slate-600 bg-slate-100'}`}>
                      {STATUS_LABEL[detail.status] ?? detail.status}
                    </span>
                  </InfoRow>
                  {detail.lateMinutes > 0 && (
                    <InfoRow label="สาย">
                      <span className="text-amber-700 dark:text-yellow-400">{formatLateMinutes(detail.lateMinutes)}</span>
                    </InfoRow>
                  )}
                  {detail.earlyLeaveMinutes > 0 && (
                    <InfoRow label="กลับก่อน">
                      <span className="text-orange-700 dark:text-orange-400">{formatLateMinutes(detail.earlyLeaveMinutes)}</span>
                    </InfoRow>
                  )}
                  <InfoRow label="ประเภท">
                    {detail.isOutside
                      ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400">
                          <Navigation className="w-3 h-3" /> นอกสถานที่
                        </span>
                      : <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-400">
                          <Building2 className="w-3 h-3" /> ในสำนักงาน
                        </span>
                    }
                  </InfoRow>
                  {detail.workPlaceName && (
                    <InfoRow label="สถานที่ทำงาน">{detail.workPlaceName}</InfoRow>
                  )}
                  {detail.branch && (
                    <InfoRow label="สาขา">{detail.branch.name}</InfoRow>
                  )}
                  {detail.note && (
                    <InfoRow label="หมายเหตุ">{detail.note}</InfoRow>
                  )}
                </Section>

                {/* ── คำขอทำงานนอกสถานที่ ── */}
                {detail.isOutside && detail.outsideWork && (
                  <div className="rounded-xl bg-orange-50 dark:bg-orange-500/[0.06] border border-orange-100 dark:border-orange-500/15 px-4 py-1">
                    <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide pt-3 pb-2">
                      คำขอทำงานนอกสถานที่
                    </p>
                    <InfoRow label="สถานที่">{detail.outsideWork.place}</InfoRow>
                    <InfoRow label="วัตถุประสงค์">{detail.outsideWork.purpose}</InfoRow>
                    {detail.outsideWork.client && (
                      <InfoRow label="ลูกค้า">{detail.outsideWork.client}</InfoRow>
                    )}
                    {detail.outsideWork.googleMapsUrl && (
                      <InfoRow label="Google Maps">
                        <a
                          href={detail.outsideWork.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 underline underline-offset-2 break-all text-[12px]"
                        >
                          ดูแผนที่จากคำขอ →
                        </a>
                      </InfoRow>
                    )}
                  </div>
                )}

                {/* ── GPS ── */}
                {(detail.checkInLat != null || detail.checkOutLat != null) && (
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-4 py-1">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-3 pb-2 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> GPS
                    </p>
                    {detail.checkInLat != null && detail.checkInLng != null && (
                      <>
                        {detail.checkInAddress && (
                          <InfoRow label="ที่อยู่เช็คอิน">
                            <span className="text-[12px] leading-snug">{detail.checkInAddress}</span>
                          </InfoRow>
                        )}
                        <InfoRow label="พิกัดเช็คอิน">
                          <a
                            href={`https://maps.google.com/?q=${detail.checkInLat},${detail.checkInLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline underline-offset-2 text-[12px]"
                          >
                            {detail.checkInLat.toFixed(6)}, {detail.checkInLng.toFixed(6)} →
                          </a>
                        </InfoRow>
                      </>
                    )}
                    {detail.checkOutLat != null && detail.checkOutLng != null && (
                      <>
                        {detail.checkOutAddress && (
                          <InfoRow label="ที่อยู่เช็คเอาท์">
                            <span className="text-[12px] leading-snug">{detail.checkOutAddress}</span>
                          </InfoRow>
                        )}
                        <InfoRow label="พิกัดเช็คเอาท์">
                          <a
                            href={`https://maps.google.com/?q=${detail.checkOutLat},${detail.checkOutLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline underline-offset-2 text-[12px]"
                          >
                            {detail.checkOutLat.toFixed(6)}, {detail.checkOutLng.toFixed(6)} →
                          </a>
                        </InfoRow>
                      </>
                    )}
                    {detail.gpsAccuracy != null && (
                      <InfoRow label="ความแม่นยำ">±{detail.gpsAccuracy.toFixed(0)} ม.</InfoRow>
                    )}
                  </div>
                )}

                {/* ── ภาพถ่าย ── */}
                {hasPhotos && (
                  <AttendancePhotos items={photos} title="ภาพถ่ายการลงเวลา" />
                )}
              </>
            )}
          </div>

          {/* Footer close button */}
          <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl py-3 text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
