'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, ScanFace, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useCameraStream } from '@/hooks/useCameraStream'
import { CameraPreviewVideoWithRef } from '@/components/attendance/CameraPreviewVideo'
import { loadFaceModels, scanFaceFromVideo, captureJpegFromVideo } from '@/lib/face-client'
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

// ใบหน้าต้องชัด (detector score) และมองตรงกล้อง (pose center) ต่อเนื่องเท่านี้ก่อน capture
const ALIGN_SCORE = 0.6
const STABLE_MS = 350

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

  const { stream, ready, error: cameraError, retry } = useCameraStream({
    enabled: !done,
    preloadFaceModels: loadFaceModels,
  })

  const verifyNow = useCallback(
    async (descriptor: number[], score: number) => {
      if (verifyingRef.current || doneRef.current) return
      verifyingRef.current = true
      setBusy(true)
      setHint('กำลังยืนยันตัวตน...')

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
            action,
            method: 'face',
          }),
        })

        if (!ok) {
          toast.error(apiErrorMessage(data as Record<string, unknown>, 'ใบหน้าไม่ตรงกับที่ลงทะเบียน', status))
          setHint('ใบหน้าไม่ตรง — กรุณาหันหน้าตรงกล้องอีกครั้ง')
          alignedSinceRef.current = null
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
          livenessScore: 1,
          detectionScore: score,
          spoofFlags: '',
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
          if (alignedSinceRef.current === null) alignedSinceRef.current = Date.now()
          const held = Date.now() - alignedSinceRef.current
          if (held >= STABLE_MS) {
            void verifyNow(scan.descriptor as number[], scan.score)
            return
          }
          setHint('นิ่ง ๆ ไว้ กำลังสแกน...')
          timer = setTimeout(() => void tick(), 200)
        } else {
          alignedSinceRef.current = null
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

      <CameraPreviewVideoWithRef
        videoRef={videoRef}
        stream={stream}
        ready={ready}
        loading={!ready && !cameraError}
        overlayLabel="สแกนใบหน้า"
        className="max-w-[220px] aspect-square mx-auto"
      />

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

      {done && <p className="text-center text-xs text-green-400 font-medium">✓ ยืนยันใบหน้าผ่านแล้ว</p>}
    </div>
  )
}
