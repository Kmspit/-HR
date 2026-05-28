'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ScanFace,
  Loader2,
  ShieldCheck,
  RotateCcw,
  ChevronRight,
  ArrowLeft,
  Camera,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import {
  extractDescriptorFromVideo,
  loadFaceModels,
  runLivenessCheck,
  type LivenessResult,
} from '@/lib/face-client'
import FaceStepGuide, { VERIFY_GUIDE_STEPS } from '@/components/attendance/FaceStepGuide'

export type FaceVerifyResult = {
  descriptor: number[]
  livenessScore: number
  spoofFlags: string
  logId: string
}

type Props = {
  action: string
  onVerified: (result: FaceVerifyResult) => void
  onCancel: () => void
}

type VerifyPhase = 'intro' | 'prepare' | 'liveness' | 'scan' | 'done'

function phaseToGuideIndex(phase: VerifyPhase): number {
  switch (phase) {
    case 'intro':
      return 0
    case 'prepare':
      return 1
    case 'liveness':
      return 2
    case 'scan':
      return 3
    default:
      return 3
  }
}

export default function FaceVerifyStep({ action, onVerified, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<VerifyPhase>('intro')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const livenessRef = useRef<LivenessResult | null>(null)

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
      setCameraError('เปิดกล้องไม่สำเร็จ — อนุญาตการใช้กล้องแล้วลองใหม่')
      setReady(false)
      return false
    }
  }, [])

  const showCamera = phase === 'prepare' || phase === 'liveness' || phase === 'scan'

  useEffect(() => {
    if (!showCamera) return
    startCamera()
    return () => stopCamera()
  }, [showCamera, startCamera, stopCamera])

  const runLivenessStep = async () => {
    if (!videoRef.current) return
    setLoading(true)
    setPhase('liveness')
    try {
      const live = await runLivenessCheck(videoRef.current)
      livenessRef.current = live
      if (live.score < 0.35) {
        toast.error('ตรวจไม่พบการเคลื่อนไหว — ขยับศีรษะช้า ๆ แล้วลองอีกครั้ง')
        return
      }
      toast.success('ตรวจความมีชีวิตผ่าน — ไปขั้นสแกนยืนยัน')
      setPhase('scan')
    } finally {
      setLoading(false)
    }
  }

  const verifyNow = async () => {
    if (!videoRef.current) return
    setLoading(true)
    try {
      const descriptor = await extractDescriptorFromVideo(videoRef.current)
      if (!descriptor) {
        toast.error('ไม่พบใบหน้า — จัดให้อยู่กลางกรอบ')
        return
      }
      const live = livenessRef.current ?? { score: 0, flags: ['skipped'] }
      const { ok, data, status } = await apiJson<{
        success?: boolean
        logId?: string
      }>('/api/face/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descriptor,
          livenessScore: live.score,
          spoofFlags: live.flags.join(','),
          action,
          method: 'face',
        }),
      })
      if (!ok) {
        toast.error(apiErrorMessage(data, 'ยืนยันใบหน้าไม่ผ่าน', status))
        return
      }
      setPhase('done')
      stopCamera()
      onVerified({
        descriptor,
        livenessScore: live.score,
        spoofFlags: live.flags.join(','),
        logId: String(data.logId ?? ''),
      })
    } catch (err) {
      console.error('[face-verify]', err)
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const goBack = () => {
    if (phase === 'prepare') setPhase('intro')
    else if (phase === 'liveness') setPhase('prepare')
    else if (phase === 'scan') setPhase('liveness')
  }

  return (
    <div className="space-y-4 rounded-2xl border dark:border-cyan-500/20 light:border-cyan-200 p-4 dark:bg-cyan-500/[0.04] light:bg-cyan-50/50">
      <div className="flex items-center gap-2 text-cyan-400">
        <ShieldCheck className="w-4 h-4" />
        <p className="text-sm font-semibold dark:text-white light:text-slate-900">
          สอนสแกนยืนยันใบหน้า
        </p>
      </div>

      <FaceStepGuide steps={VERIFY_GUIDE_STEPS} currentIndex={phaseToGuideIndex(phase)} />

      {phase === 'intro' && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setPhase('prepare')}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            เริ่มขั้นตอนที่ 1
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-xs dark:text-slate-500 light:text-slate-500 py-1"
          >
            ยกเลิก — ใช้โหมดถ่ายรูปแทน
          </button>
        </div>
      )}

      {phase === 'prepare' && (
        <div className="space-y-3">
          <p className="text-xs text-center dark:text-slate-400 light:text-slate-600">
            {ready ? 'กล้องพร้อม — กดถัดไปเพื่อตรวจความมีชีวิต' : 'กำลังโหลดระบบและเปิดกล้อง...'}
          </p>
          {showCamera && (
            <CameraPreview
              videoRef={videoRef}
              ready={ready}
              loading={loading && !ready}
              overlayLabel="เตรียมตัว"
            />
          )}
          {cameraError && <ErrorLine message={cameraError} />}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPhase('intro')} className="btn-secondary flex-1 py-2.5">
              <ArrowLeft className="w-4 h-4 inline mr-1" />
              ย้อนกลับ
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => setPhase('liveness')}
              className="btn-primary flex-1 py-2.5"
            >
              ถัดไป — ตรวจมีชีวิต
            </button>
          </div>
        </div>
      )}

      {phase === 'liveness' && (
        <div className="space-y-3">
          <CameraPreview
            videoRef={videoRef}
            ready={ready}
            loading={loading}
            overlayLabel="ขยับศีรษะช้า ๆ"
          />
          {cameraError && <ErrorLine message={cameraError} />}
          <div className="flex gap-2">
            <button type="button" onClick={goBack} className="btn-secondary flex-1 py-2.5">
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={runLivenessStep}
              disabled={loading || !ready}
              className="btn-primary flex-1 py-2.5"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                'เริ่มตรวจความมีชีวิต'
              )}
            </button>
          </div>
        </div>
      )}

      {phase === 'scan' && (
        <div className="space-y-3">
          <CameraPreview
            videoRef={videoRef}
            ready={ready}
            loading={loading}
            overlayLabel="หน้าตรง — กดสแกน"
          />
          <button
            type="button"
            onClick={verifyNow}
            disabled={loading || !ready}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ScanFace className="w-4 h-4" />
                สแกนและยืนยัน
              </>
            )}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={goBack} className="btn-secondary flex-1 py-2.5 text-xs">
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={runLivenessStep}
              className="btn-secondary flex-1 py-2.5 text-xs"
            >
              <RotateCcw className="w-3 h-3 inline mr-1" />
              ตรวจมีชีวิตใหม่
            </button>
          </div>
          <button type="button" onClick={onCancel} className="w-full text-xs dark:text-slate-500 py-1">
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  )
}

function CameraPreview({
  videoRef,
  ready,
  loading,
  overlayLabel,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  ready: boolean
  loading: boolean
  overlayLabel: string
}) {
  return (
    <div className="relative mx-auto w-full max-w-[280px] aspect-[4/3] rounded-2xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover scale-x-[-1]"
      />
      <div className="absolute inset-6 border-2 border-cyan-400/50 rounded-2xl pointer-events-none" />
      <div className="absolute bottom-3 left-0 right-0 text-center">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-black/60 text-cyan-200">
          {overlayLabel}
        </span>
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      )}
      {!ready && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      )}
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return <p className="text-xs text-red-400 text-center">{message}</p>
}
