'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ScanFace,
  Loader2,
  CheckCircle,
  AlertCircle,
  Camera,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { extractDescriptorFromVideo, loadFaceModels, runLivenessCheck } from '@/lib/face-client'
import FaceStepGuide, { REGISTER_GUIDE_STEPS } from '@/components/attendance/FaceStepGuide'

type Props = {
  onRegistered: () => void
}

/** 0=intro … 5=confirm, 6=done */
type RegPhase = 'intro' | 'camera' | 'sample1' | 'sample2' | 'sample3' | 'confirm' | 'done'

const SAMPLE_PHASES: RegPhase[] = ['sample1', 'sample2', 'sample3']

const POSE_HINT: Record<string, string> = {
  sample1: 'หน้าตรง',
  sample2: 'เอียงซ้ายเล็กน้อย',
  sample3: 'เอียงขวาเล็กน้อย',
}

function phaseToGuideIndex(phase: RegPhase): number {
  switch (phase) {
    case 'intro':
      return 0
    case 'camera':
      return 1
    case 'sample1':
      return 2
    case 'sample2':
      return 3
    case 'sample3':
      return 4
    case 'confirm':
      return 5
    default:
      return 5
  }
}

export default function FaceRegistrationCard({ onRegistered }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<RegPhase>('intro')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [samples, setSamples] = useState<number[][]>([])
  const [cameraError, setCameraError] = useState('')

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    try {
      setCameraError('')
      await loadFaceModels()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setReady(true)
      return true
    } catch {
      setCameraError('ไม่สามารถเปิดกล้องได้ — อนุญาตการใช้กล้องในเบราว์เซอร์')
      setReady(false)
      return false
    }
  }, [])

  const showCamera = phase !== 'intro' && phase !== 'done'

  useEffect(() => {
    if (!showCamera) return
    startCamera()
    return () => stopCamera()
  }, [showCamera, startCamera, stopCamera])

  const captureSample = async () => {
    if (!videoRef.current) return
    setLoading(true)
    try {
      const descriptor = await extractDescriptorFromVideo(videoRef.current)
      if (!descriptor) {
        toast.error('ไม่พบใบหน้า — จัดตำแหน่งให้อยู่กลางกรอบ')
        return
      }
      const nextCount = samples.length + 1
      setSamples((prev) => [...prev, descriptor])
      toast.success(`บันทึกตัวอย่าง ${nextCount}/3 แล้ว`)

      if (phase === 'sample1') setPhase('sample2')
      else if (phase === 'sample2') setPhase('sample3')
      else if (phase === 'sample3') setPhase('confirm')
    } finally {
      setLoading(false)
    }
  }

  const finishRegistration = async () => {
    if (!videoRef.current || samples.length < 3) {
      toast.error('ต้องสแกนครบ 3 ครั้งก่อนยืนยัน')
      return
    }
    setLoading(true)
    try {
      const liveness = await runLivenessCheck(videoRef.current)
      const { ok, data, status } = await apiJson<{ success?: boolean }>('/api/face/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          samples,
          livenessScore: liveness.score,
          spoofFlags: liveness.flags.join(','),
        }),
      })
      if (!ok) {
        toast.error(apiErrorMessage(data, 'ลงทะเบียนไม่สำเร็จ', status))
        return
      }
      toast.success('ลงทะเบียนใบหน้าเรียบร้อย')
      setPhase('done')
      stopCamera()
      onRegistered()
    } catch (err) {
      console.error('[face-register]', err)
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const goBack = () => {
    if (phase === 'camera') setPhase('intro')
    else if (phase === 'sample1') setPhase('camera')
    else if (phase === 'sample2') setPhase('sample1')
    else if (phase === 'sample3') setPhase('sample2')
    else if (phase === 'confirm') setPhase('sample3')
  }

  if (phase === 'done') {
    return (
      <div className="glass-card rounded-2xl p-4 border border-green-500/30 flex items-center gap-3">
        <CheckCircle className="w-8 h-8 text-green-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold dark:text-white light:text-slate-900">ลงทะเบียนใบหน้าแล้ว</p>
          <p className="text-xs dark:text-slate-400 light:text-slate-600">
            พร้อมใช้ Face Recognition เช็กอิน — เลือกโหมดสแกนใบหน้าตอนลงเวลา
          </p>
        </div>
      </div>
    )
  }

  const guideIndex = phaseToGuideIndex(phase)
  const sampleIndex = SAMPLE_PHASES.indexOf(phase as (typeof SAMPLE_PHASES)[number])

  return (
    <div className="glass-card rounded-2xl p-4 md:p-5 border dark:border-blue-500/25 light:border-blue-200 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
          <ScanFace className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dark:text-white light:text-slate-900">
            สอนลงทะเบียนใบหน้า (ครั้งเดียว)
          </h3>
          <p className="text-xs mt-1 dark:text-slate-400 light:text-slate-600 leading-relaxed">
            ทำตามทีละขั้นตอนด้านล่าง — ใช้เวลาประมาณ 1–2 นาที
          </p>
        </div>
      </div>

      <FaceStepGuide steps={REGISTER_GUIDE_STEPS} currentIndex={guideIndex} />

      {phase === 'intro' && (
        <button
          type="button"
          onClick={async () => {
            setPhase('camera')
          }}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          เริ่มขั้นตอนที่ 1
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {phase === 'camera' && (
        <div className="space-y-3">
          <p className="text-xs text-center dark:text-slate-400 light:text-slate-600">
            {ready ? 'กล้องพร้อมแล้ว — กดถัดไปเพื่อเริ่มสแกน' : 'กำลังเปิดกล้อง...'}
          </p>
          {cameraError && (
            <p className="text-xs text-red-400 flex items-center justify-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {cameraError}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={goBack} className="btn-secondary flex-1 py-2.5">
              <ArrowLeft className="w-4 h-4 inline mr-1" />
              ย้อนกลับ
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => setPhase('sample1')}
              className="btn-primary flex-1 py-2.5"
            >
              ถัดไป — สแกนครั้งที่ 1
            </button>
          </div>
        </div>
      )}

      {showCamera && phase !== 'camera' && (
        <div className="space-y-3">
          <div className="relative mx-auto w-full max-w-[280px] aspect-[4/3] rounded-2xl overflow-hidden bg-black border dark:border-white/10 light:border-slate-200">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <div className="absolute inset-6 border-2 border-dashed border-cyan-400/60 rounded-2xl pointer-events-none" />
            {SAMPLE_PHASES.includes(phase) && (
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-black/60 text-cyan-200">
                  {POSE_HINT[phase]}
                </span>
              </div>
            )}
          </div>

          {SAMPLE_PHASES.includes(phase) && (
            <>
              <div className="flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`h-2 w-8 rounded-full transition-colors ${
                      i < samples.length
                        ? 'bg-green-500'
                        : i === sampleIndex
                          ? 'bg-cyan-500 animate-pulse'
                          : 'dark:bg-white/15 light:bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={goBack} className="btn-secondary flex-1 py-2.5">
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={captureSample}
                  disabled={loading || !ready}
                  className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      จับภาพตัวอย่าง
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {phase === 'confirm' && (
            <div className="space-y-2">
              <p className="text-center text-xs text-green-400">
                ✓ สแกนครบ 3 ครั้งแล้ว
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={goBack} className="btn-secondary flex-1 py-2.5">
                  สแกนใหม่ (ขั้น 3)
                </button>
                <button
                  type="button"
                  onClick={finishRegistration}
                  disabled={loading}
                  className="btn-primary flex-1 py-2.5"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    'ยืนยันลงทะเบียน'
                  )}
                </button>
              </div>
            </div>
          )}

          {cameraError && (
            <p className="text-xs text-red-400 flex items-center justify-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {cameraError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
