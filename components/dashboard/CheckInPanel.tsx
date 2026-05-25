'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, MapPin, CheckCircle, RotateCcw, Loader2, Building2, Navigation } from 'lucide-react'
import { toast } from 'sonner'

type LivenessStep = {
  id: string
  label: string
  instruction: string
  icon: string
}

const LIVENESS_STEPS: LivenessStep[] = [
  { id: 'center', label: 'มองตรง',   instruction: 'มองตรงไปที่กล้อง',       icon: '😐' },
  { id: 'left',   label: 'หันซ้าย',  instruction: 'หันหน้าไปทางซ้ายช้าๆ',   icon: '👈' },
  { id: 'right',  label: 'หันขวา',   instruction: 'หันหน้าไปทางขวาช้าๆ',    icon: '👉' },
  { id: 'nod',    label: 'พยักหน้า', instruction: 'พยักหน้าขึ้น-ลงช้าๆ',     icon: '🔼' },
]

type Props = {
  type: 'checkin' | 'checkout'
  locationType?: 'company' | 'outside'
  onSuccess?: () => void
}

export default function CheckInPanel({ type, locationType = 'company', onSuccess }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [step, setStep] = useState<'location' | 'liveness' | 'confirm' | 'done'>('location')
  const [livenessStep, setLivenessStep] = useState(0)
  const [livenessTimer, setLivenessTimer] = useState(3)
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string } | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const isOutsideType = locationType === 'outside'
  const accentColor = isOutsideType ? '#f97316' : '#06b6d4'
  const accentGradient = isOutsideType
    ? 'linear-gradient(135deg,#f97316,#ef4444)'
    : 'linear-gradient(135deg,#06b6d4,#3b82f6)'
  const accentBorder = isOutsideType ? 'rgba(249,115,22,0.3)' : 'rgba(6,182,212,0.3)'

  const getLocation = useCallback(() => {
    setIsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
          )
          const data = await res.json()
          address = data.display_name ?? address
        } catch {}
        setLocation({ lat, lng, address })
        setIsLoading(false)
        if (type === 'checkout') setStep('confirm')
        else setStep('liveness')
      },
      () => {
        setIsLoading(false)
        toast.error('ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด Location')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [type])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setCameraError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้งานกล้อง')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (step === 'liveness') startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [step, startCamera, stopCamera])

  // Liveness countdown
  useEffect(() => {
    if (step !== 'liveness') return
    if (livenessTimer <= 0) {
      if (livenessStep < LIVENESS_STEPS.length - 1) {
        setLivenessStep((s) => s + 1)
        setLivenessTimer(3)
      } else {
        capturePhoto()
      }
      return
    }
    const t = setTimeout(() => setLivenessTimer((v) => v - 1), 1000)
    return () => clearTimeout(t)
  }, [step, livenessTimer, livenessStep])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    setCapturedPhoto(dataUrl)
    setStep('confirm')
  }, [])

  const handleSubmit = async () => {
    if (!location) return
    setIsLoading(true)

    try {
      if (type === 'checkout') {
        const res = await fetch('/api/attendance/checkout', { method: 'POST' })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error); setIsLoading(false); return }
        toast.success('เช็คเอาท์สำเร็จ')
        setStep('done')
        onSuccess?.()
        return
      }

      const formData = new FormData()
      formData.append('lat', String(location.lat))
      formData.append('lng', String(location.lng))
      formData.append('address', location.address)
      formData.append('locationType', locationType)   // ← ส่ง locationType ไป API

      if (capturedPhoto) {
        const blob = await fetch(capturedPhoto).then((r) => r.blob())
        formData.append('photo', blob, 'face.jpg')
      }

      const res = await fetch('/api/attendance/checkin', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); setIsLoading(false); return }

      if (data.lateMinutes > 0) {
        toast.warning(`เช็คอินสำเร็จ — มาสาย ${data.lateMinutes} นาที`)
      } else {
        toast.success(`เช็คอินสำเร็จ — ${data.isOutside ? 'นอกสถานที่' : 'ในบริษัท'}`)
      }
      setStep('done')
      onSuccess?.()
    } catch {
      toast.error('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')
    } finally {
      setIsLoading(false)
    }
  }

  const reset = () => {
    setStep('location')
    setLivenessStep(0)
    setLivenessTimer(3)
    setLocation(null)
    setCapturedPhoto(null)
  }

  const title = type === 'checkin'
    ? (isOutsideType ? 'เช็คอิน นอกสถานที่' : 'เช็คอิน ในบริษัท')
    : 'เช็คเอาท์ออกงาน'

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: 'rgba(13,19,33,0.8)',
        border: `1px solid ${accentBorder}`,
      }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0"
          style={{ background: accentGradient }}>
          {type === 'checkout'
            ? <CheckCircle className="w-4.5 h-4.5 text-white" />
            : isOutsideType
              ? <Navigation className="w-4.5 h-4.5 text-white" />
              : <Building2 className="w-4.5 h-4.5 text-white" />
          }
        </div>
        <div>
          <p className="font-bold text-white text-sm">{title}</p>
          {type === 'checkin' && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {isOutsideType ? 'บันทึก GPS ตำแหน่งงานนอกสถานที่' : 'ยืนยันตัวตนและตำแหน่งในบริษัท'}
            </p>
          )}
        </div>
      </div>

      {/* ─── Step: Location ─── */}
      {step === 'location' && (
        <div className="flex flex-col items-center gap-4 py-2">
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: `${isOutsideType ? 'rgba(249,115,22,0.12)' : 'rgba(6,182,212,0.12)'}` }}>
            {isOutsideType
              ? <Navigation className="w-8 h-8 text-orange-400" />
              : <Building2 className="w-8 h-8 text-cyan-400" />
            }
          </div>

          {isOutsideType ? (
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-white">ระบุตำแหน่งงานนอกสถานที่</p>
              <p className="text-xs text-slate-500">ระบบจะบันทึก GPS ณ ตำแหน่งที่คุณอยู่ตอนนี้</p>
            </div>
          ) : (
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-white">ยืนยันตำแหน่ง</p>
              <p className="text-xs text-slate-500">ต้องอยู่ในรัศมีบริษัทเพื่อเช็คอินในบริษัท</p>
            </div>
          )}

          <button
            onClick={getLocation}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: accentGradient }}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {isLoading ? 'กำลังระบุตำแหน่ง...' : 'ระบุตำแหน่ง GPS'}
          </button>
        </div>
      )}

      {/* ─── Step: Liveness ─── */}
      {step === 'liveness' && (
        <div className="flex flex-col items-center gap-4">
          {/* Camera oval */}
          <div className="relative w-full max-w-[260px] mx-auto">
            <div className="relative overflow-hidden rounded-2xl" style={{ paddingBottom: '110%' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />
              {/* Oval overlay */}
              <div className="absolute inset-0"
                style={{
                  background: `radial-gradient(ellipse 60% 70% at 50% 50%, transparent 58%, rgba(10,13,20,0.88) 60%)`,
                }} />
              {/* Timer ring */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-52 rounded-full flex items-end justify-center pb-3"
                  style={{ border: `3px solid ${accentColor}99` }}>
                  <span className="text-white text-3xl font-bold drop-shadow-lg">{livenessTimer}</span>
                </div>
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Liveness steps */}
          <div className="grid grid-cols-4 gap-1.5 w-full">
            {LIVENESS_STEPS.map((s, i) => (
              <div key={s.id}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg transition-all text-center ${
                  i < livenessStep
                    ? 'bg-green-500/15 border border-green-500/30'
                    : i === livenessStep
                    ? 'border'
                    : 'bg-white/[0.03] border border-white/[0.07]'
                }`}
                style={i === livenessStep ? { background: `${accentColor}18`, borderColor: `${accentColor}60` } : {}}
              >
                <span className="text-base">{s.icon}</span>
                <span className="text-[9px] text-white/60">{s.label}</span>
                {i < livenessStep && <CheckCircle className="w-3 h-3 text-green-400" />}
              </div>
            ))}
          </div>

          <p className="text-sm font-semibold text-white text-center">
            {LIVENESS_STEPS[livenessStep].instruction}
          </p>

          {cameraError && <p className="text-red-400 text-xs text-center">{cameraError}</p>}
        </div>
      )}

      {/* ─── Step: Confirm ─── */}
      {step === 'confirm' && (
        <div className="flex flex-col gap-3">
          {/* Photo preview */}
          {capturedPhoto && (
            <div className="mx-auto" style={{ width: 140, height: 155 }}>
              <img
                src={capturedPhoto}
                alt="face"
                className="w-full h-full object-cover rounded-[50%] scale-x-[-1]"
                style={{ border: `3px solid ${accentColor}80` }}
              />
            </div>
          )}

          {/* Location info */}
          <div className="flex items-start gap-2.5 rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 mb-0.5">ตำแหน่งของคุณ</p>
              <p className="text-xs text-slate-300 line-clamp-2">{location?.address}</p>
            </div>
          </div>

          {/* Outside warning */}
          {isOutsideType && (
            <div className="flex items-center gap-2 rounded-xl p-2.5 text-xs text-orange-300"
              style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
              <Navigation className="w-3.5 h-3.5 flex-shrink-0" />
              บันทึกเป็น <strong>นอกสถานที่</strong> — ตำแหน่งจะถูกบันทึกเพื่อการตรวจสอบ
            </div>
          )}

          <div className="flex gap-2.5">
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-white/10 text-slate-400 hover:bg-white/[0.04] hover:text-white transition text-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" /> ถ่ายใหม่
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl font-semibold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: accentGradient }}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              ยืนยัน
            </button>
          </div>
        </div>
      )}

      {/* ─── Step: Done ─── */}
      {step === 'done' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'rgba(34,197,94,0.15)' }}>
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <p className="font-bold text-white">
            {type === 'checkin' ? 'เช็คอินสำเร็จ!' : 'เช็คเอาท์สำเร็จ!'}
          </p>
          <p className="text-slate-500 text-sm">
            {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
          </p>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isOutsideType ? 'bg-orange-500/15 text-orange-400' : 'bg-cyan-500/15 text-cyan-400'
          }`}>
            {isOutsideType ? '📍 นอกสถานที่' : '🏢 ในบริษัท'}
          </span>
        </div>
      )}
    </div>
  )
}
