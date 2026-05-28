'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanFace, Loader2, ShieldCheck, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import {
  extractDescriptorFromVideo,
  loadFaceModels,
  runLivenessCheck,
  type LivenessResult,
} from '@/lib/face-client'

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

export default function FaceVerifyStep({ action, onVerified, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<'loading' | 'liveness' | 'capture' | 'done'>('loading')
  const [hint, setHint] = useState('กำลังโหลดโมเดล...')
  const [loading, setLoading] = useState(false)
  const livenessRef = useRef<LivenessResult | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadFaceModels()
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setPhase('liveness')
        setHint('มองกล้องแล้วขยับศีรษะเบา ๆ...')
        setLoading(true)
        const live = await runLivenessCheck(videoRef.current!)
        livenessRef.current = live
        setLoading(false)
        if (live.score < 0.35) {
          toast.error('ตรวจไม่พบการเคลื่อนไหว — อาจเป็นรูปถ่าย ลองใหม่')
          setPhase('liveness')
          setHint('ลองอีกครั้ง — ขยับศีรษะช้า ๆ')
          return
        }
        setPhase('capture')
        setHint('จัดใบหน้าให้อยู่กลางกรอบ')
      } catch {
        toast.error('เปิดกล้องไม่สำเร็จ')
        onCancel()
      }
    })()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [onCancel, stopCamera])

  const verifyNow = async () => {
    if (!videoRef.current) return
    setLoading(true)
    try {
      const descriptor = await extractDescriptorFromVideo(videoRef.current)
      if (!descriptor) {
        toast.error('ไม่พบใบหน้า')
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

  const retryLiveness = async () => {
    if (!videoRef.current) return
    setPhase('liveness')
    setHint('ขยับศีรษะช้า ๆ...')
    setLoading(true)
    const live = await runLivenessCheck(videoRef.current)
    livenessRef.current = live
    setLoading(false)
    if (live.score < 0.35) {
      toast.error('ตรวจสอบความมีชีวิตไม่ผ่าน')
      return
    }
    setPhase('capture')
    setHint('จัดใบหน้าให้อยู่กลางกรอบ')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-cyan-400">
        <ShieldCheck className="w-4 h-4" />
        <p className="text-sm font-semibold dark:text-white light:text-slate-900">ยืนยันใบหน้า</p>
      </div>
      <p className="text-xs dark:text-slate-400 light:text-slate-600">{hint}</p>
      <div className="relative mx-auto w-full max-w-[280px] aspect-[4/3] rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
        <div className="absolute inset-6 border-2 border-cyan-400/50 rounded-2xl pointer-events-none" />
        {phase === 'loading' || loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : null}
      </div>
      {phase === 'capture' && (
        <button type="button" onClick={verifyNow} disabled={loading} className="btn-primary w-full py-3">
          <ScanFace className="w-4 h-4 inline mr-2" />
          สแกนและยืนยัน
        </button>
      )}
      {phase === 'liveness' && !loading && (
        <button type="button" onClick={retryLiveness} className="btn-secondary w-full py-2.5">
          เริ่มตรวจสอบใหม่
        </button>
      )}
      <button type="button" onClick={onCancel} className="w-full text-xs dark:text-slate-500 light:text-slate-500 py-1">
        <RotateCcw className="w-3 h-3 inline mr-1" />
        ยกเลิก
      </button>
    </div>
  )
}
