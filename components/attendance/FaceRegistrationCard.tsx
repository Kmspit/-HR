'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ScanFace,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import {
  loadFaceModels,
  scanFaceFromVideo,
  captureJpegFromVideo,
} from '@/lib/face-client'
import { useCameraStream } from '@/hooks/useCameraStream'
import { CameraPreviewVideoWithRef } from '@/components/attendance/CameraPreviewVideo'
import FaceStepGuide, { REGISTER_GUIDE_STEPS } from '@/components/attendance/FaceStepGuide'

type Props = {
  onRegistered: () => void
  allowUpdate?: boolean
  onCancelUpdate?: () => void
}

type RegPhase = 'intro' | 'camera' | 'scan' | 'done'

// ถ่ายใบหน้าหลายมุมเพื่อทำ multi-angle average embedding
const SAMPLE_TARGET = 5
const STABLE_FRAMES = 1
const SCAN_INTERVAL_MS = 500

// ขั้นตอนมุมใบหน้า: center×2, ซ้าย, ขวา, center อีกครั้ง
type AngleStep = { pose: 'center' | 'left' | 'right'; label: string; instruction: string }
const ANGLE_STEPS: AngleStep[] = [
  { pose: 'center', label: 'หน้าตรง',   instruction: 'มองตรงกล้อง' },
  { pose: 'center', label: 'หน้าตรง',   instruction: 'มองตรงกล้อง นิ่งๆ' },
  { pose: 'left',   label: 'หันซ้าย',   instruction: 'หันหน้าซ้ายเล็กน้อย' },
  { pose: 'right',  label: 'หันขวา',    instruction: 'หันหน้าขวาเล็กน้อย' },
  { pose: 'center', label: 'หน้าตรง',   instruction: 'กลับมามองตรงกล้อง' },
]

function phaseToGuideIndex(phase: RegPhase): number {
  if (phase === 'intro') return 0
  if (phase === 'camera') return 1
  return 2
}

export default function FaceRegistrationCard({ onRegistered, allowUpdate, onCancelUpdate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<RegPhase>('intro')
  const [samples, setSamples] = useState<number[][]>([])
  const [hint, setHint] = useState('')
  const [saving, setSaving] = useState(false)
  const samplesRef = useRef<number[][]>([])
  const stableRef = useRef(0)
  const savingRef = useRef(false)

  const showCamera = phase === 'camera' || phase === 'scan'
  const { stream, ready, error: cameraError, retry } = useCameraStream({
    enabled: showCamera,
    preloadFaceModels: loadFaceModels,
  })

  const allShotsDone = samples.length >= SAMPLE_TARGET

  useEffect(() => {
    samplesRef.current = samples
  }, [samples])

  useEffect(() => {
    if (phase !== 'scan' || !ready || cameraError || saving) return

    let cancelled = false

    const tick = async () => {
      if (cancelled || savingRef.current || !videoRef.current || videoRef.current.videoWidth === 0) return
      if (samplesRef.current.length >= SAMPLE_TARGET) return

      const currentStep = ANGLE_STEPS[samplesRef.current.length] ?? ANGLE_STEPS[SAMPLE_TARGET - 1]
      setHint(`${currentStep.instruction} — ถ่าย ${samplesRef.current.length + 1}/${SAMPLE_TARGET}`)

      const result = await scanFaceFromVideo(videoRef.current)
      if (cancelled) return

      if (!result.descriptor || result.score < 0.5) {
        stableRef.current = 0
        setHint(`จัดใบหน้าให้อยู่ในกรอบ — ${currentStep.instruction}`)
        return
      }

      // ยอมรับ pose ตามขั้นตอน: left/right step ยอมรับ center ด้วย (ไม่ strict เกิน)
      const expectedPose = currentStep.pose
      const poseOk =
        result.pose === expectedPose ||
        (expectedPose === 'left'  && result.pose === 'center') ||
        (expectedPose === 'right' && result.pose === 'center')
      if (!poseOk) {
        stableRef.current = 0
        setHint(currentStep.instruction)
        return
      }

      stableRef.current += 1
      if (stableRef.current < STABLE_FRAMES) {
        setHint(`ดีมาก! นิ่ง ๆ ไว้อีกนิด... (${samplesRef.current.length}/${SAMPLE_TARGET})`)
        return
      }

      stableRef.current = 0
      const updated = [...samplesRef.current, result.descriptor]
      samplesRef.current = updated
      setSamples(updated)
      toast.success(`✓ ถ่ายภาพแล้ว ${updated.length}/${SAMPLE_TARGET}`)

      if (updated.length >= SAMPLE_TARGET) void finishRegistration(updated)
    }

    const id = window.setInterval(() => void tick(), SCAN_INTERVAL_MS)
    void tick()

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [phase, ready, cameraError, saving])

  const finishRegistration = async (finalSamples: number[][]) => {
    if (finalSamples.length < SAMPLE_TARGET || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setHint('กำลังบันทึกลงระบบ...')
    try {
      const registrationImageDataUrl =
        videoRef.current && videoRef.current.videoWidth > 0
          ? captureJpegFromVideo(videoRef.current) ?? undefined
          : undefined
      const { ok, data, status } = await apiJson<{ success?: boolean }>('/api/face/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          samples: finalSamples,
          registrationImageBase64: registrationImageDataUrl,
        }),
      })
      if (!ok) {
        toast.error(apiErrorMessage(data, 'ลงทะเบียนไม่สำเร็จ', status))
        savingRef.current = false
        setSaving(false)
        return
      }
      toast.success('ลงทะเบียนใบหน้าเรียบร้อย')
      setPhase('done')
      onRegistered()
    } catch (err) {
      console.error('[face-register]', err)
      toast.error('เกิดข้อผิดพลาด')
      savingRef.current = false
      setSaving(false)
    }
  }

  const resetScan = () => {
    samplesRef.current = []
    stableRef.current = 0
    savingRef.current = false
    setSamples([])
    setHint('')
    setSaving(false)
  }

  if (phase === 'done' && !allowUpdate) {
    return (
      <div className="glass-card rounded-2xl p-4 border border-green-500/30 flex items-center gap-3">
        <CheckCircle className="w-8 h-8 text-green-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold dark:text-white light:text-slate-900">ลงทะเบียนใบหน้าแล้ว</p>
          <p className="text-xs dark:text-slate-400 light:text-slate-600">
            ลงเวลาทุกครั้งต้องสแกนใบหน้าให้ตรงกับที่ลงทะเบียน
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card rounded-2xl p-4 md:p-5 border dark:border-blue-500/25 light:border-blue-200 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
          <ScanFace className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dark:text-white light:text-slate-900">
            {allowUpdate ? 'อัปเดตใบหน้า (1 คนต่อบัญชี)' : 'สอนสแกนจดจำใบหน้า'}
          </h3>
          <p className="text-xs mt-1 dark:text-slate-400 light:text-slate-600 leading-relaxed">
            มองตรงกล้อง ระบบจะถ่ายใบหน้าหลายภาพให้อัตโนมัติเพื่อความแม่นยำ
          </p>
        </div>
      </div>

      <FaceStepGuide steps={REGISTER_GUIDE_STEPS} currentIndex={phaseToGuideIndex(phase)} />

      {phase === 'intro' && (
        <div className="flex gap-2">
          {allowUpdate && onCancelUpdate && (
            <button type="button" onClick={onCancelUpdate} className="btn-secondary flex-1 py-3">
              ยกเลิก
            </button>
          )}
          <button
            type="button"
            onClick={() => setPhase('camera')}
            className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
          >
            {allowUpdate ? 'เริ่มอัปเดตใบหน้า' : 'เริ่มสแกนจดจำใบหน้า'}
            <ChevronRight className="w-4 h-4" />
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
            overlayLabel={phase === 'scan' ? 'หน้าตรง' : 'เตรียมกล้อง'}
          />

          {phase === 'camera' && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setPhase('intro')} className="btn-secondary flex-1 py-2.5">
                <ArrowLeft className="w-4 h-4 inline mr-1" />
                ย้อนกลับ
              </button>
              <button
                type="button"
                disabled={!ready || !!cameraError}
                onClick={() => {
                  resetScan()
                  setPhase('scan')
                }}
                className="btn-primary flex-1 py-2.5"
              >
                เริ่มสแกนอัตโนมัติ
              </button>
            </div>
          )}

          {phase === 'scan' && (
            <>
              <div className="flex justify-center gap-1.5">
                {ANGLE_STEPS.map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span
                      className={`h-2.5 w-9 rounded-full transition-colors ${
                        i < samples.length
                          ? 'bg-green-500'
                          : i === samples.length
                            ? 'bg-cyan-500 animate-pulse'
                            : 'dark:bg-white/15 light:bg-slate-200'
                      }`}
                    />
                    <span className={`text-[8px] ${i < samples.length ? 'text-green-400' : i === samples.length ? 'text-cyan-400' : 'dark:text-white/30 light:text-slate-400'}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-center text-sm font-medium dark:text-cyan-300 light:text-blue-700 min-h-[2.5rem]">
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {hint || 'กำลังบันทึก...'}
                  </span>
                ) : (
                  hint || 'มองตรงกล้อง'
                )}
              </p>

              {!saving && !allShotsDone && (
                <p className="text-[10px] text-center dark:text-slate-500">
                  ไม่ต้องกดปุ่ม — มองตรงกล้อง ระบบจับให้เอง
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetScan()
                    setPhase('camera')
                  }}
                  disabled={saving}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  เริ่มใหม่
                </button>
              </div>
            </>
          )}

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
        </div>
      )}
    </div>
  )
}
