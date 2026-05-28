'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { MapPin, CheckCircle, RotateCcw, Loader2, Building2, Navigation, BookmarkPlus, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { dataUrlToBlob } from '@/lib/utils'
import dynamic from 'next/dynamic'
import type { FaceVerifyResult } from '@/components/attendance/FaceVerifyStep'

const FaceVerifyStep = dynamic(() => import('@/components/attendance/FaceVerifyStep'), { ssr: false })

type SavedPlace = { id: string; name: string }

export type CompanyGeofence = {
  name: string
  address: string
  lat: number
  lng: number
  radiusM: number
}

type PanelType = 'checkin' | 'checkout' | 'lunch-out' | 'lunch-in'

type AttendanceMethod = 'face' | 'manual'

type Props = {
  type: PanelType
  locationType?: 'company' | 'outside'
  companyOffice?: { name: string; address: string } | null
  companyGeofence?: CompanyGeofence | null
  attendanceMethod?: AttendanceMethod
  faceRegistered?: boolean
  onSuccess?: () => void
}

function CompanyGeofenceCard({ geo }: { geo: CompanyGeofence }) {
  return (
    <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3.5 space-y-2">
      <div className="flex items-start gap-2">
        <Building2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-white">{geo.name}</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{geo.address}</p>
        </div>
      </div>
      <div className="rounded-lg bg-black/25 px-3 py-2 text-[11px] text-slate-300 font-mono space-y-0.5">
        <p>พิกัดสำนักงาน: {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}</p>
        <p className="text-slate-500">รัศมี Geofence: {geo.radiusM} ม.</p>
      </div>
    </div>
  )
}

export default function CheckInPanel({
  type,
  locationType = 'company',
  companyOffice,
  companyGeofence,
  attendanceMethod = 'manual',
  faceRegistered = false,
  onSuccess,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const isLunch = type === 'lunch-out' || type === 'lunch-in'
  const isOutsideType = !isLunch && locationType === 'outside'
  const isCompanyOffice = !isOutsideType && !!companyOffice

  const useFaceScan =
    attendanceMethod === 'face' && faceRegistered

  const [step, setStep] = useState<'place' | 'gps' | 'face-verify' | 'camera' | 'confirm' | 'done'>(
    isLunch ? (useFaceScan ? 'face-verify' : 'camera') : 'place',
  )
  const [faceVerify, setFaceVerify] = useState<FaceVerifyResult | null>(null)
  const [workPlaceName, setWorkPlaceName] = useState('')
  const [savePlace, setSavePlace] = useState(false)
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([])
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string } | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const accentGradient = isOutsideType
    ? 'linear-gradient(135deg,#f97316,#ef4444)'
    : isLunch
      ? 'linear-gradient(135deg,#f59e0b,#d97706)'
      : 'linear-gradient(135deg,#06b6d4,#3b82f6)'
  const accentBorder = isOutsideType
    ? 'rgba(249,115,22,0.3)'
    : isLunch
      ? 'rgba(245,158,11,0.3)'
      : 'rgba(6,182,212,0.3)'

  useEffect(() => {
    if (isCompanyOffice && companyOffice) {
      setWorkPlaceName(companyOffice.name)
    }
  }, [isCompanyOffice, companyOffice])

  useEffect(() => {
    if (!isCompanyOffice) {
      apiJson<{ places?: SavedPlace[] }>('/api/work-places').then(({ data }) => {
        setSavedPlaces(data.places ?? [])
      })
    }
  }, [isCompanyOffice])

  const captureGpsQuiet = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          )
          const data = await res.json()
          address = data.display_name ?? address
        } catch {}
        setLocation({ lat, lng, address })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  useEffect(() => {
    if (isLunch) captureGpsQuiet()
  }, [isLunch, captureGpsQuiet])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraError('')
    } catch {
      setCameraError('ไม่สามารถเปิดกล้องได้ — ต้องถ่ายสดจากกล้องเท่านั้น')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (step === 'camera') startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [step, startCamera, stopCamera])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.8))
    stopCamera()
    setStep('confirm')
  }, [stopCamera])

  const getGps = () => {
    setIsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          )
          const data = await res.json()
          address = data.display_name ?? address
        } catch {}
        setLocation({ lat, lng, address })
        setIsLoading(false)
        setStep(useFaceScan ? 'face-verify' : 'camera')
      },
      () => {
        setIsLoading(false)
        toast.error('เปิด GPS ไม่ได้')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const goPlaceNext = async () => {
    const name = isCompanyOffice && companyOffice ? companyOffice.name : workPlaceName.trim()
    if (!name) {
      toast.error('กรุณาพิมพ์ชื่อสถานที่ทำงาน')
      return
    }
    if (!isCompanyOffice && savePlace) {
      await apiJson('/api/work-places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    }
    setStep('gps')
  }

  const handleSubmit = async () => {
    if (!capturedPhoto) return
    if (!isLunch && !location) return

    setIsLoading(true)
    try {
      const formData = new FormData()
      const blob = dataUrlToBlob(capturedPhoto)
      formData.append('photo', blob, 'face.jpg')
      formData.append('attendanceMethod', attendanceMethod)
      if (faceVerify) {
        formData.append('faceDescriptor', JSON.stringify(faceVerify.descriptor))
        formData.append('livenessScore', String(faceVerify.livenessScore))
        formData.append('spoofFlags', faceVerify.spoofFlags)
        if (faceVerify.logId) formData.append('faceLogId', faceVerify.logId)
      }

      if (isLunch) {
        formData.append('action', type)
        if (location) {
          formData.append('lat', String(location.lat))
          formData.append('lng', String(location.lng))
          formData.append('address', location.address)
        }
        const { ok, data, status } = await apiJson('/api/attendance/lunch', {
          method: 'POST',
          body: formData,
        })
        if (!ok) {
          toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
          return
        }
        toast.success(type === 'lunch-out' ? 'บันทึกเริ่มพักกลางวัน (ถ่ายรูปแล้ว)' : 'บันทึกกลับจากพัก (ถ่ายรูปแล้ว)')
      } else if (type === 'checkin') {
        if (!location) return
        formData.append('lat', String(location.lat))
        formData.append('lng', String(location.lng))
        formData.append('address', location.address)
        formData.append('workPlaceName', workPlaceName.trim())
        formData.append('locationType', locationType)
        const { ok, data, status } = await apiJson<{ lateMinutes?: number; isOutside?: boolean }>(
          '/api/attendance/checkin',
          { method: 'POST', body: formData },
        )
        if (!ok) {
          toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
          return
        }
        if ((data.lateMinutes ?? 0) > 0) {
          toast.warning(`เช็คอินสำเร็จ — มาสาย ${data.lateMinutes} นาที`)
        } else {
          toast.success(`เช็คอินสำเร็จ — ${data.isOutside ? 'นอกสถานที่' : 'ในบริษัท'}`)
        }
      } else {
        if (!location) return
        formData.append('lat', String(location.lat))
        formData.append('lng', String(location.lng))
        formData.append('address', location.address)
        formData.append('workPlaceName', workPlaceName.trim())
        const { ok, data, status } = await apiJson('/api/attendance/checkout', {
          method: 'POST',
          body: formData,
        })
        if (!ok) {
          toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
          return
        }
        toast.success('เช็คเอาท์สำเร็จ (ถ่ายรูปแล้ว)')
      }
      setStep('done')
      onSuccess?.()
    } catch (err) {
      console.error('[attendance]', err)
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setIsLoading(false)
    }
  }

  const title =
    type === 'checkin'
      ? isOutsideType
        ? 'เช็คอิน นอกสถานที่'
        : 'เช็คอิน ในบริษัท'
      : type === 'checkout'
        ? 'เช็คเอาท์'
        : type === 'lunch-out'
          ? 'เริ่มพักกลางวัน'
          : 'กลับจากพักกลางวัน'

  const showCompanyGeo = companyGeofence && (isCompanyOffice || isLunch || (!isOutsideType && type === 'checkout'))

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: 'rgba(13,19,33,0.8)', border: `1px solid ${accentBorder}` }}
    >
      <p className="font-bold text-white text-sm">{title}</p>

      {showCompanyGeo && <CompanyGeofenceCard geo={companyGeofence!} />}

      {step === 'place' && (
        <div className="space-y-3">
          {isCompanyOffice && companyOffice ? (
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3.5">
              <p className="text-sm font-semibold text-white">{companyOffice.name}</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{companyOffice.address}</p>
            </div>
          ) : (
            <>
              <label className="text-xs text-slate-400">ชื่อสถานที่ทำงาน</label>
              <input
                value={workPlaceName}
                onChange={(e) => setWorkPlaceName(e.target.value)}
                placeholder="ชื่อสถานที่"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white"
              />
              {savedPlaces.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {savedPlaces.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setWorkPlaceName(p.name)}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={savePlace}
                  onChange={(e) => setSavePlace(e.target.checked)}
                  className="accent-blue-500"
                />
                <BookmarkPlus className="w-3.5 h-3.5" /> บันทึกเป็นสถานที่ใช้ประจำ
              </label>
            </>
          )}
          <button
            type="button"
            onClick={goPlaceNext}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: accentGradient }}
          >
            ถัดไป — ระบุ GPS
          </button>
        </div>
      )}

      {step === 'face-verify' && useFaceScan && (
        <FaceVerifyStep
          action={isLunch ? type : type}
          onVerified={(result) => {
            setFaceVerify(result)
            setStep('camera')
          }}
          onCancel={() => {
            setFaceVerify(null)
            setStep(isLunch ? 'camera' : 'gps')
          }}
        />
      )}

      {step === 'gps' && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-xs text-slate-400 text-center">บันทึกพิกัด GPS จริง ณ ขณะลงเวลา</p>
          <button
            type="button"
            onClick={getGps}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: accentGradient }}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            ระบุตำแหน่ง GPS
          </button>
        </div>
      )}

      {step === 'camera' && (
        <div className="flex flex-col items-center gap-3">
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-white">ถ่ายรูปหน้าตรง</p>
            <p className="text-xs text-slate-400">มองตรงกล้อง — ไม่ต้องหันซ้าย หันขวา หรือพยักหน้า</p>
          </div>
          <div className="relative w-full max-w-[240px] aspect-square rounded-2xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-sm font-semibold text-white/90 bg-black/40 px-3 py-1 rounded-full">
                หน้าตรง
              </span>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <button
            type="button"
            onClick={capturePhoto}
            disabled={!!cameraError}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: accentGradient }}
          >
            <Camera className="w-5 h-5" />
            ถ่ายรูป
          </button>
          <p className="text-[10px] text-slate-500 text-center">กดปุ่มเมื่อพร้อม — ไม่มีนับถอยหลังอัตโนมัติ</p>
          {cameraError && <p className="text-xs text-red-400 text-center">{cameraError}</p>}
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-3">
          {capturedPhoto && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={capturedPhoto}
              alt="face"
              className="w-24 h-24 rounded-full mx-auto object-cover scale-x-[-1] border-2 border-cyan-500/50"
            />
          )}
          {!isLunch && workPlaceName && (
            <p className="text-xs text-white">
              <strong>สถานที่:</strong> {workPlaceName}
            </p>
          )}
          {location && (
            <p className="text-xs text-slate-400 line-clamp-2">
              GPS ณ ขณะถ่าย: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              <br />
              {location.address}
            </p>
          )}
          {!location && isLunch && companyGeofence && (
            <p className="text-xs text-slate-400">
              พิกัดอ้างอิงสำนักงาน: {companyGeofence.lat.toFixed(5)}, {companyGeofence.lng.toFixed(5)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStep('camera')
                setCapturedPhoto(null)
              }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm"
            >
              <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> ถ่ายใหม่
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: accentGradient }}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'ยืนยัน'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-4">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-2" />
          <p className="font-bold text-white">สำเร็จ!</p>
        </div>
      )}
    </div>
  )
}
