'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, ScanFace, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useCameraStream } from '@/hooks/useCameraStream'
import { CameraPreviewVideoWithRef } from '@/components/attendance/CameraPreviewVideo'
import {
  loadFaceModels,
  runLivenessCheck,
  scanFaceFromVideo,
  livenessToFormFields,
  captureJpegFromVideo,
} from '@/lib/face-client'
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

type Phase = 'camera' | 'liveness' | 'verify' | 'done'

export default function FaceAttendanceScan({ action, onVerified, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('camera')
  const [hint, setHint] = useState('เตรียมกล้อง — มองตรงกล้อง')
  const [busy, setBusy] = useState(false)

  const { stream, ready, error: cameraError, retry } = useCameraStream({
    enabled: phase !== 'done',
    preloadFaceModels: loadFaceModels,
  })

  const runChallenge = useCallback(async () => {
    if (!videoRef.current || !ready) return
    setBusy(true)
    setPhase('liveness')
    setHint('กระพริบตาช้า ๆ และขยับศีรษะเล็กน้อย...')

    try {
      const liveness = await runLivenessCheck(videoRef.current)
      if (liveness.score < 0.45) {
        toast.error('ตรวจสอบความมีชีวิตไม่ผ่าน — กระพริบตาและขยับหน้าเล็กน้อย ห้ามใช้รูปจอ')
        setPhase('camera')
        setHint('ลองใหม่: กระพริบตา + ขยับศีรษะ')
        setBusy(false)
        return
      }

      setPhase('verify')
      setHint('กำลังจับใบหน้าและยืนยันตัวตน...')

      const scan = await scanFaceFromVideo(videoRef.current)
      if (!scan.descriptor || scan.score < 0.5) {
        toast.error('ไม่พบใบหน้าที่ชัด — จัดหน้าให้อยู่ในกรอบ')
        setPhase('camera')
        setBusy(false)
        return
      }

      const { livenessScore, spoofFlags } = livenessToFormFields(liveness)

      const { ok, data, status } = await apiJson<{
        success?: boolean
        logId?: string
        distance?: number
        confidence?: number
      }>('/api/face/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descriptor: scan.descriptor,
          livenessScore,
          detectionScore: scan.score,
          spoofFlags,
          action,
          method: 'face',
        }),
      })

      if (!ok) {
        toast.error(apiErrorMessage(data as Record<string, unknown>, 'ยืนยันใบหน้าไม่ผ่าน', status))
        setPhase('camera')
        setHint('ใบหน้าไม่ตรงหรือตรวจพบความผิดปกติ')
        setBusy(false)
        return
      }

      const logId = (data as { logId?: string }).logId
      if (!logId) {
        toast.error('ไม่ได้รับ log การยืนยัน')
        setBusy(false)
        return
      }

      const captureImageDataUrl = captureJpegFromVideo(videoRef.current) ?? undefined
      const distance = (data as { distance?: number }).distance
      const confidence = (data as { confidence?: number }).confidence

      setPhase('done')
      onVerified({
        descriptor: scan.descriptor,
        livenessScore,
        detectionScore: scan.score,
        spoofFlags,
        faceLogId: logId,
        captureImageDataUrl,
        faceMatchScore: typeof distance === 'number' ? distance : undefined,
        faceConfidence: typeof confidence === 'number' ? confidence : undefined,
      })
    } catch (err) {
      console.error('[face-scan]', err)
      toast.error('สแกนใบหน้าไม่สำเร็จ')
      setPhase('camera')
    } finally {
      setBusy(false)
    }
  }, [ready, action, onVerified])

  useEffect(() => {
    if (phase !== 'camera' || !ready || busy) return
    setHint('พร้อมแล้ว — กดปุ่มเพื่อสแกนใบหน้า (กระพริบตา + ขยับศีรษะ)')
  }, [phase, ready, busy])

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
        overlayLabel={phase === 'liveness' ? 'กระพริบตา' : 'สแกนใบหน้า'}
        className="max-w-[220px] aspect-square mx-auto"
      />

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

      {phase !== 'done' && (
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary flex-1 py-2 text-xs">
              ยกเลิก
            </button>
          )}
          <button
            type="button"
            disabled={!ready || !!cameraError || busy}
            onClick={() => void runChallenge()}
            className="btn-primary flex-1 py-2.5 text-sm"
          >
            {busy ? 'กำลังตรวจสอบ...' : 'เริ่มสแกนใบหน้า'}
          </button>
        </div>
      )}

      {phase === 'done' && (
        <p className="text-center text-xs text-green-400 font-medium">✓ ยืนยันใบหน้าผ่านแล้ว</p>
      )}
    </div>
  )
}
