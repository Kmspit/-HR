'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { MapPin, CheckCircle, RotateCcw, Loader2, Building2, Navigation, BookmarkPlus, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { dataUrlToBlob } from '@/lib/utils'
import { useCameraStream } from '@/hooks/useCameraStream'
import { CameraPreviewVideoWithRef } from '@/components/attendance/CameraPreviewVideo'
import { RefreshCw, AlertCircle } from 'lucide-react'
import FaceAttendanceScan, { type FaceVerifyPayload } from '@/components/attendance/FaceAttendanceScan'
import {
  saveAttendanceToLocalDevice,
  type LocalAttendanceEvent,
} from '@/lib/attendance-local-log'

type SavedPlace = { id: string; name: string }

export type CompanyGeofence = {
  name: string
  address: string
  lat: number
  lng: number
  radiusM: number
}

type PanelType = 'checkin' | 'checkout' | 'lunch-out' | 'lunch-in'

type Props = {
  type: PanelType
  locationType?: 'company' | 'outside'
  companyOffice?: { name: string; address: string } | null
  companyGeofence?: CompanyGeofence | null
  /** เมื่อลงทะเบียนใบหน้าแล้ว — บังคับสแกนก่อนทุก event */
  faceRequired?: boolean
  userId?: string
  employeeName?: string
  employeeCode?: string | null
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

type Step = 'place' | 'gps' | 'face-scan' | 'camera' | 'confirm' | 'done'

export default function CheckInPanel({
  type,
  locationType = 'company',
  companyOffice,
  companyGeofence,
  faceRequired = false,
  userId = '',
  employeeName = '',
  employeeCode = null,
  onSuccess,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const submittingRef = useRef(false)

  const isLunch = type === 'lunch-out' || type === 'lunch-in'
  const isCheckout = type === 'checkout'
  const isOutsideType = !isLunch && locationType === 'outside'
  const isCompanyOffice = !isOutsideType && !!companyOffice

  const initialStep: Step = (() => {
    if (isLunch) return faceRequired ? 'face-scan' : 'camera'
    if (isCheckout) return faceRequired ? 'gps' : 'place'
    return 'place'
  })()
  const [step, setStep] = useState<Step>(initialStep)
  const [facePayload, setFacePayload] = useState<FaceVerifyPayload | null>(null)
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

  const cameraActive = step === 'camera'
  const { stream, ready: cameraReady, error: cameraStreamError, retry: retryCamera } =
    useCameraStream({ enabled: cameraActive })

  useEffect(() => {
    if (cameraStreamError) setCameraError(cameraStreamError)
    else if (cameraReady) setCameraError('')
  }, [cameraStreamError, cameraReady])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    if (videoRef.current.videoWidth === 0) {
      toast.error('กล้องยังไม่พร้อม — รอจนเห็นหน้าตัวเองในกรอบ')
      return
    }
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      toast.error('กล้องไม่รองรับการถ่ายภาพในเบราว์เซอร์นี้')
      return
    }
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.8))
    setStep('confirm')
  }, [])

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
        setStep(faceRequired ? 'face-scan' : 'camera')
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

  const toastLineNotifyResult = (lineNotify?: { sent?: number; failed?: number }) => {
    if (!lineNotify) {
      toast.info('บันทึกลงเวลาแล้ว — ยังไม่ส่ง LINE (HR ต้องผูก LINE OA ที่โปรไฟล์)', {
        duration: 5000,
        action: {
          label: 'ผูก LINE',
          onClick: () => { window.location.href = '/profile' },
        },
      })
      return
    }
    if ((lineNotify.sent ?? 0) > 0) {
      toast.success('บันทึกแล้ว · ส่งแจ้ง LINE HR แล้ว', { duration: 4500 })
    } else if ((lineNotify.failed ?? 0) > 0) {
      toast.warning('บันทึกลงเวลาแล้ว แต่ส่ง LINE HR ไม่สำเร็จ — ให้ HR ผูก LINE OA ที่โปรไฟล์', {
        duration: 5500,
        action: {
          label: 'โปรไฟล์',
          onClick: () => { window.location.href = '/profile' },
        },
      })
    } else {
      toast.info('บันทึกแล้ว — HR ยังไม่ได้รับ LINE (ให้ HR ผูก LINE OA ที่โปรไฟล์)', {
        duration: 5000,
        action: {
          label: 'ผูก LINE',
          onClick: () => { window.location.href = '/profile' },
        },
      })
    }
  }

  const persistLocalScan = async (opts: {
    photo: string
    lineNotify?: { sent?: number; failed?: number }
    attendanceId?: string | null
    faceScanId?: string | null
  }) => {
    if (!userId) return
    try {
      await saveAttendanceToLocalDevice({
        userId,
        employeeName: employeeName || 'พนักงาน',
        employeeCode,
        event: type as LocalAttendanceEvent,
        workPlaceName: workPlaceName.trim() || companyOffice?.name || null,
        address: location?.address ?? null,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        photoDataUrl: opts.photo,
        serverAttendanceId: opts.attendanceId ?? null,
        faceScanId: opts.faceScanId ?? null,
        lineNotify: opts.lineNotify,
      })
    } catch (err) {
      console.warn('[attendance-local]', err)
    }
  }

  const submitAttendance = useCallback(
    async (payloadOverride?: FaceVerifyPayload | null, photoOverride?: string | null) => {
      const activePayload = payloadOverride ?? facePayload
      const activePhoto = photoOverride ?? capturedPhoto
      if (!activePhoto) return
      if (!isLunch && !location) return
      if (faceRequired && !activePayload) {
        toast.error('ต้องสแกนใบหน้าก่อนลงเวลา')
        return
      }
      if (submittingRef.current) return
      submittingRef.current = true
      setIsLoading(true)

      try {
        const formData = new FormData()
        const blob = dataUrlToBlob(activePhoto)
        formData.append('photo', blob, 'face.jpg')
        if (faceRequired && activePayload) {
          formData.append('attendanceMethod', 'face')
          formData.append('faceDescriptor', JSON.stringify(activePayload.descriptor))
          formData.append('livenessScore', String(activePayload.livenessScore))
          formData.append('detectionScore', String(activePayload.detectionScore))
          formData.append('spoofFlags', activePayload.spoofFlags)
          formData.append('faceLogId', activePayload.faceLogId)
          if (activePayload.captureImageDataUrl) {
            formData.append('faceScanImageBase64', activePayload.captureImageDataUrl)
          }
          if (activePayload.faceMatchScore != null) {
            formData.append('faceMatchScore', String(activePayload.faceMatchScore))
          }
          if (activePayload.faceConfidence != null) {
            formData.append('faceConfidence', String(activePayload.faceConfidence))
          }
          if (userId) formData.append('sessionUserId', userId)
        } else {
          formData.append('attendanceMethod', 'manual')
        }

        if (isLunch) {
          formData.append('action', type)
          if (location) {
            formData.append('lat', String(location.lat))
            formData.append('lng', String(location.lng))
            formData.append('address', location.address)
          }
          const { ok, data, status } = await apiJson<{
            lineNotify?: { sent?: number; failed?: number }
            attendance?: { id: string }
            faceScanId?: string | null
          }>('/api/attendance/lunch', {
            method: 'POST',
            body: formData,
          })
          if (!ok) {
            toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
            return
          }
          await persistLocalScan({
            photo: activePhoto,
            lineNotify: data.lineNotify,
            attendanceId: data.attendance?.id,
            faceScanId: data.faceScanId,
          })
          toast.success(
            type === 'lunch-out' ? 'บันทึกเริ่มพักกลางวันสำเร็จ' : 'บันทึกกลับจากพักสำเร็จ',
          )
          toastLineNotifyResult(data.lineNotify)
        } else if (type === 'checkin') {
          if (!location) return
          formData.append('lat', String(location.lat))
          formData.append('lng', String(location.lng))
          formData.append('address', location.address)
          formData.append('workPlaceName', workPlaceName.trim())
          formData.append('locationType', locationType)
          const { ok, data, status } = await apiJson<{
            lateMinutes?: number
            isOutside?: boolean
            lineNotify?: { sent?: number; failed?: number }
            attendance?: { id: string }
            faceScanId?: string | null
          }>('/api/attendance/checkin', { method: 'POST', body: formData })
          if (!ok) {
            toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
            return
          }
          await persistLocalScan({
            photo: activePhoto,
            lineNotify: data.lineNotify,
            attendanceId: data.attendance?.id,
            faceScanId: data.faceScanId,
          })
          if ((data.lateMinutes ?? 0) > 0) {
            toast.warning(`เช็คอินสำเร็จ — มาสาย ${data.lateMinutes} นาที`)
          } else {
            toast.success(`เช็คอินสำเร็จ — ${data.isOutside ? 'นอกสถานที่' : 'ในบริษัท'}`)
          }
          toastLineNotifyResult(data.lineNotify)
        } else {
          if (!location) return
          formData.append('lat', String(location.lat))
          formData.append('lng', String(location.lng))
          formData.append('address', location.address)
          formData.append('workPlaceName', workPlaceName.trim())
          const { ok, data, status } = await apiJson<{
            lineNotify?: { sent?: number; failed?: number }
            attendance?: { id: string }
            faceScanId?: string | null
          }>('/api/attendance/checkout', {
            method: 'POST',
            body: formData,
          })
          if (!ok) {
            toast.error(apiErrorMessage(data, 'เกิดข้อผิดพลาด', status))
            return
          }
          await persistLocalScan({
            photo: activePhoto,
            lineNotify: data.lineNotify,
            attendanceId: data.attendance?.id,
            faceScanId: data.faceScanId,
          })
          toast.success('เช็คเอาท์สำเร็จ')
          toastLineNotifyResult(data.lineNotify)
        }
        setStep('done')
        onSuccess?.()
      } catch (err) {
        console.error('[attendance]', err)
        toast.error('เกิดข้อผิดพลาด')
      } finally {
        submittingRef.current = false
        setIsLoading(false)
      }
    },
    [
      capturedPhoto,
      facePayload,
      faceRequired,
      isLunch,
      location,
      locationType,
      onSuccess,
      type,
      userId,
      employeeName,
      employeeCode,
      companyOffice,
      workPlaceName,
    ],
  )

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

      {step === 'face-scan' && faceRequired && (
        <div className="space-y-2">
          <p className="text-center text-xs text-slate-400">
            สแกนสำเร็จ → บันทึกในเครื่อง + เซิร์ฟเวอร์ → ส่งเวลาและรูปเข้า LINE HR อัตโนมัติ
          </p>
          <FaceAttendanceScan
            action={type}
            onVerified={(payload) => {
              setFacePayload(payload)
              if (payload.captureImageDataUrl) {
                setCapturedPhoto(payload.captureImageDataUrl)
                toast.success('ยืนยันใบหน้าแล้ว — กำลังบันทึกลงเวลา...')
                void submitAttendance(payload, payload.captureImageDataUrl)
              } else {
                setStep('camera')
                toast.success('ยืนยันใบหน้าผ่าน — ถ่ายรูปประกอบการลงเวลา')
              }
            }}
          />
          {isLoading && (
            <p className="text-center text-xs text-cyan-300 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              กำลังบันทึกลงเวลาและส่งแจ้ง HR...
            </p>
          )}
        </div>
      )}

      {step === 'camera' && (
        <div className="flex flex-col items-center gap-3">
          <div className="text-center space-y-1">
            <p className="text-lg font-bold dark:text-white light:text-slate-900">ถ่ายรูปหน้าตรง</p>
            <p className="text-xs dark:text-slate-400 light:text-slate-600">
              {facePayload
                ? 'ถ่ายรูปหน้าตรงประกอบบันทึก (ยืนยันใบหน้าแล้ว)'
                : 'มองตรงกล้อง — ต้องเห็นหน้าตัวเองในกรอบก่อนกดถ่าย'}
            </p>
          </div>
          <CameraPreviewVideoWithRef
            videoRef={videoRef}
            stream={stream}
            ready={cameraReady}
            loading={!cameraReady && !cameraStreamError}
            overlayLabel="หน้าตรง"
            className="max-w-[240px] aspect-square"
          />
          <canvas ref={canvasRef} className="hidden" />
          {cameraStreamError && (
            <div className="w-full space-y-2">
              <p className="text-xs text-red-400 flex items-center justify-center gap-1 text-center">
                <AlertCircle className="w-3.5 h-3.5" /> {cameraStreamError}
              </p>
              <button
                type="button"
                onClick={retryCamera}
                className="btn-secondary w-full py-2 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
                ลองเปิดกล้องอีกครั้ง
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={capturePhoto}
            disabled={!!cameraError || !cameraReady}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: accentGradient }}
          >
            <Camera className="w-5 h-5" />
            ถ่ายรูป
          </button>
          <p className="text-[10px] dark:text-slate-500 light:text-slate-500 text-center">
            กดปุ่มเมื่อพร้อม — ไม่มีนับถอยหลังอัตโนมัติ
          </p>
        </div>
      )}

      {step === 'confirm' && !faceRequired && (
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
                setStep(faceRequired ? 'face-scan' : 'camera')
                setCapturedPhoto(null)
                if (faceRequired) setFacePayload(null)
              }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm"
            >
              <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> ถ่ายใหม่
            </button>
            <button
              type="button"
              onClick={() => void submitAttendance()}
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
