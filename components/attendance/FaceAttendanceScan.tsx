'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, ScanFace, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useCameraStream } from '@/hooks/useCameraStream'
import { CameraPreviewVideoWithRef } from '@/components/attendance/CameraPreviewVideo'
import {
  loadFaceModels,
  scanFaceFromVideo,
  captureJpegFromVideo,
} from '@/lib/face-client'
import {
  scoreLivenessSamples,
  serializeSpoofFlags,
  type LivenessChallengeResult,
} from '@/lib/face-liveness'
import { sampleVideoLuminance } from '@/lib/face-liveness'
import { apiJson, apiErrorMessage } from '@/lib/client-api'

export type FaceVerifyPayload = {
  descriptor: number[]
  livenessScore: number
  detectionScore: number
  spoofFlags: string
  faceLogId: string
  captureImageDataUrl?: string
  faceMatchScore?: number
  faceConfidence?: number
}

type Props = {
  action: 'checkin' | 'checkout' | 'lunch-out' | 'lunch-in'
  onVerified: (payload: FaceVerifyPayload) => void
  onCancel?: () => void
}

// ใบหน้าต้องชัดพอ (detector score) และมองตรงกล้อง ต่อเนื่องเท่านี้ก่อน capture
const ALIGN_SCORE = 0.5   // ลดจาก 0.6 — ตรวจจับง่ายขึ้น ลด false-reject
const STABLE_MS = 900     // เพิ่มจาก 280 → 900 ms เพื่อเก็บ ~4 samples สำหรับ liveness

const PROMPT_DEFAULT = 'กรุณาหันหน้าตรงกล้องเพื่อสแกน'
const PROMPT_ALIGN = 'กรุณาหันหน้าตรงกล้อง'

export default function FaceAttendanceScan({ action, onVerified, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hint, setHint] = useState(PROMPT_DEFAULT)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const doneRef = useRef(false)
  const verifyingRef = useRef(false)
  const alignedSinceRef = useRef<number | null>(null)

  // Liveness data accumulators — filled during stable alignment window
  const earSamplesRef = useRef<number[]>([])
  const nosePosRef = useRef<{ x: number; y: number }[]>([])
  const lumSamplesRef = useRef<number[]>([])

  const { stream, ready, error: cameraError, retry } = useCameraStream({
    enabled: !done,
    preloadFaceModels: loadFaceModels,
  })

  const verifyNow = useCallback(
    async (descriptor: number[], score: number, liveness: LivenessChallengeResult) => {
      if (verifyingRef.current || doneRef.current) return
      verifyingRef.current = true
      setBusy(true)
      setHint('กำลังยืนยันตัวตน...')

      const spoofFlagsStr = serializeSpoofFlags(liveness.flags, {
        blink: liveness.blinkDetected,
        movementPx: liveness.movementPx,
        liveFrames: liveness.liveFrames,
      })

      try {
        const { ok, data, status } = await apiJson<{
          success?: boolean
          logId?: string
          distance?: number
          confidence?: number
        }>('/api/face/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descriptor,
            detectionScore: score,
            livenessScore: liveness.score,
            spoofFlags: spoofFlagsStr,
            action,
            method: 'face',
          }),
        })

        if (!ok) {
          toast.error(apiErrorMessage(data as Record<string, unknown>, 'ใบหน้าไม่ตรงกับที่ลงทะเบียน', status))
          setHint('ใบหน้าไม่ตรง — กรุณาหันหน้าตรงกล้องอีกครั้ง')
          alignedSinceRef.current = null
          earSamplesRef.current = []
          nosePosRef.current = []
          lumSamplesRef.current = []
          verifyingRef.current = false
          setBusy(false)
          return
        }

        const logId = (data as { logId?: string }).logId
        if (!logId) {
          toast.error('ไม่ได้รับ log การยืนยัน')
          alignedSinceRef.current = null
          verifyingRef.current = false
          setBusy(false)
          return
        }

        const captureImageDataUrl = videoRef.current
          ? captureJpegFromVideo(videoRef.current) ?? undefined
          : undefined
        const distance = (data as { distance?: number }).distance
        const confidence = (data as { confidence?: number }).confidence

        verifyingRef.current = false
        setBusy(false)
        setHint('✓ ยืนยันสำเร็จ — กำลังบันทึกลงเวลา...')
        doneRef.current = true
        setDone(true)
        onVerified({
          descriptor,
          livenessScore: liveness.score,
          detectionScore: score,
          spoofFlags: spoofFlagsStr,
          faceLogId: logId,
          captureImageDataUrl,
          faceMatchScore: typeof distance === 'number' ? distance : undefined,
          faceConfidence: typeof confidence === 'number' ? confidence : undefined,
        })
      } catch (err) {
        console.error('[face-scan]', err)
        toast.error('สแกนใบหน้าไม่สำเร็จ')
        setHint(PROMPT_DEFAULT)
        alignedSinceRef.current = null
        verifyingRef.current = false
        setBusy(false)
      }
    },
    [action, onVerified],
  )

  // ลูปอัตโนมัติ: เปิดกล้อง → ตรวจจับใบหน้า → ตรงกล้อง+ชัด → capture อัตโนมัติ → เปรียบเทียบ
  useEffect(() => {
    if (!ready || done || cameraError) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      if (cancelled || doneRef.current || verifyingRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        timer = setTimeout(() => void tick(), 400)
        return
      }

      try {
        const scan = await scanFaceFromVideo(video)
        if (cancelled || doneRef.current || verifyingRef.current) return

        const aligned = !!scan.descriptor && scan.score >= ALIGN_SCORE && scan.pose === 'center'

        if (aligned) {
          if (alignedSinceRef.current === null) {
            // Reset liveness accumulators when stable alignment starts
            alignedSinceRef.current = Date.now()
            earSamplesRef.current = []
            nosePosRef.current = []
            lumSamplesRef.current = []
          }

          // Accumulate liveness data on every tick during stable window
          if (scan.earAvg > 0) earSamplesRef.current.push(scan.earAvg)
          if (scan.nosePt) nosePosRef.current.push(scan.nosePt)
          if (video.videoWidth > 0) lumSamplesRef.current.push(sampleVideoLuminance(video))

          const held = Date.now() - alignedSinceRef.current
          if (held >= STABLE_MS) {
            const liveness = scoreLivenessSamples({
              earSamples: earSamplesRef.current,
              nosePositions: nosePosRef.current,
              luminanceSamples: lumSamplesRef.current,
              flags: [],
            })
            void verifyNow(scan.descriptor as number[], scan.score, liveness)
            return
          }
          const pct = Math.min(100, Math.round((held / STABLE_MS) * 100))
          setHint(`นิ่ง ๆ ไว้ กำลังสแกน... ${pct}%`)
          timer = setTimeout(() => void tick(), 200)
        } else {
          alignedSinceRef.current = null
          earSamplesRef.current = []
          nosePosRef.current = []
          lumSamplesRef.current = []
          setHint(scan.descriptor ? PROMPT_ALIGN : PROMPT_DEFAULT)
          timer = setTimeout(() => void tick(), 400)
        }
      } catch {
        timer = setTimeout(() => void tick(), 600)
      }
    }

    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [ready, done, cameraError, verifyNow])

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
      <p className="text-xs text-blue-300 flex items-center gap-1.5 font-medium">
        <ScanFace className="w-4 h-4" />
        ยืนยันตัวตนด้วยใบหน้า (ต้องเป็นคนเดียวกับที่ลงทะเบียน)
      </p>

      {done ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
            <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-green-400">ยืนยันใบหน้าสำเร็จ</p>
          <p className="text-xs text-slate-500">กำลังบันทึกลงเวลา...</p>
        </div>
      ) : (
        <CameraPreviewVideoWithRef
          videoRef={videoRef}
          stream={stream}
          ready={ready}
          loading={!ready && !cameraError}
          overlayLabel="สแกนใบหน้า"
          className="max-w-[220px] aspect-square mx-auto"
        />
      )}

      {!done && (
        <p className="text-center text-xs text-slate-400 min-h-[2rem]">
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {hint}
            </span>
          ) : (
            hint
          )}
        </p>
      )}

      {cameraError && (
        <div className="space-y-2">
          <p className="text-xs text-red-400 text-center flex items-center justify-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> {cameraError}
          </p>
          <button type="button" onClick={retry} className="btn-secondary w-full py-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
            ลองเปิดกล้องอีกครั้ง
          </button>
        </div>
      )}

      {!done && onCancel && (
        <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary w-full py-2 text-xs">
          ยกเลิก
        </button>
      )}

    </div>
  )
}
