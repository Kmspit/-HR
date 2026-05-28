'use client'

import { useRef, useState } from 'react'
import {
  ScanFace,
  Loader2,
  ShieldCheck,
  RotateCcw,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import {
  extractDescriptorFromVideo,
  loadFaceModels,
  runLivenessCheck,
  type LivenessResult,
} from '@/lib/face-client'
import { useCameraStream } from '@/hooks/useCameraStream'
import { CameraPreviewVideoWithRef } from '@/components/attendance/CameraPreviewVideo'
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

const OVERLAY: Record<string, string> = {
  prepare: 'เตรียมตัว — เห็นหน้าตัวเอง',
  liveness: 'ขยับศีรษะช้า ๆ',
  scan: 'หน้าตรง — กดสแกน',
}

export default function FaceVerifyStep({ action, onVerified, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<VerifyPhase>('intro')
  const [loading, setLoading] = useState(false)
  const livenessRef = useRef<LivenessResult | null>(null)

  const showCamera = phase === 'prepare' || phase === 'liveness' || phase === 'scan'
  const { stream, ready, error: cameraError, retry } = useCameraStream({
    enabled: showCamera,
    preloadFaceModels: loadFaceModels,
  })

  const runLivenessStep = async () => {
    if (!videoRef.current || videoRef.current.videoWidth === 0) {
      toast.error('กล้องยังไม่พร้อม — รอจนเห็นหน้าตัวเองในกรอบ')
      return
    }
    setLoading(true)
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
    if (!videoRef.current || videoRef.current.videoWidth === 0) {
      toast.error('กล้องยังไม่พร้อม — รอจนเห็นหน้าตัวเอง')
      return
    }
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

      {showCamera && (
        <div className="space-y-3">
          <CameraPreviewVideoWithRef
            videoRef={videoRef}
            stream={stream}
            ready={ready}
            loading={!ready && !cameraError}
            overlayLabel={OVERLAY[phase]}
          />

          {cameraError && (
            <div className="space-y-2">
              <p className="text-xs text-red-400 flex items-center justify-center gap-1 text-center">
                <AlertCircle className="w-3.5 h-3.5" /> {cameraError}
              </p>
              <button type="button" onClick={retry} className="btn-secondary w-full py-2 text-xs">
                <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
                ลองเปิดกล้องอีกครั้ง
              </button>
            </div>
          )}

          {phase === 'prepare' && (
            <>
              <p className="text-xs text-center dark:text-slate-400 light:text-slate-600">
                {ready ? 'เห็นหน้าตัวเองชัดแล้ว — กดถัดไป' : 'กำลังเปิดกล้อง...'}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPhase('intro')} className="btn-secondary flex-1 py-2.5">
                  <ArrowLeft className="w-4 h-4 inline mr-1" />
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  disabled={!ready || !!cameraError}
                  onClick={() => setPhase('liveness')}
                  className="btn-primary flex-1 py-2.5"
                >
                  ถัดไป — ตรวจมีชีวิต
                </button>
              </div>
            </>
          )}

          {phase === 'liveness' && (
            <>
              <div className="flex gap-2">
                <button type="button" onClick={goBack} className="btn-secondary flex-1 py-2.5">
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={runLivenessStep}
                  disabled={loading || !ready || !!cameraError}
                  className="btn-primary flex-1 py-2.5"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    'เริ่มตรวจความมีชีวิต'
                  )}
                </button>
              </div>
            </>
          )}

          {phase === 'scan' && (
            <>
              <button
                type="button"
                onClick={verifyNow}
                disabled={loading || !ready || !!cameraError}
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
