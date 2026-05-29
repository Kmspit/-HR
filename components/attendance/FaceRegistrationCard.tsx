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
  runLivenessCheck,
  livenessToFormFields,
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
type PoseStep = 'center' | 'left' | 'right'

const POSE_ORDER: PoseStep[] = ['center', 'left', 'right']

const POSE_LABEL: Record<PoseStep, string> = {
  center: 'หน้าตรง',
  left: 'หันซ้าย',
  right: 'หันขวา',
}

const POSE_ARROW: Record<PoseStep, string> = {
  center: '👤',
  left: '👈 หันซ้ายช้า ๆ',
  right: '👉 หันขวาช้า ๆ',
}

const STABLE_FRAMES = 2
const SCAN_INTERVAL_MS = 700

function phaseToGuideIndex(poseStep: PoseStep | null, phase: RegPhase): number {
  if (phase === 'intro') return 0
  if (phase === 'camera') return 1
  if (!poseStep) return 2
  if (poseStep === 'center') return 2
  if (poseStep === 'left') return 3
  if (poseStep === 'right') return 4
  return 5
}

export default function FaceRegistrationCard({ onRegistered, allowUpdate, onCancelUpdate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<RegPhase>('intro')
  const [poseStep, setPoseStep] = useState<PoseStep>('center')
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

  const currentPoseIndex = POSE_ORDER.indexOf(poseStep)
  const allPosesDone = samples.length >= 3

  useEffect(() => {
    samplesRef.current = samples
  }, [samples])

  useEffect(() => {
    if (phase !== 'scan' || !ready || cameraError || saving) return

    let cancelled = false

    const tick = async () => {
      if (cancelled || savingRef.current || !videoRef.current || videoRef.current.videoWidth === 0) return
      if (samplesRef.current.length >= 3) return

      const target = POSE_ORDER[samplesRef.current.length]
      if (!target) return

      setPoseStep(target)
      setHint(`ทำตามคำสั่ง: ${POSE_LABEL[target]} — ระบบจะจับภาพให้อัตโนมัติ`)

      const result = await scanFaceFromVideo(videoRef.current)
      if (cancelled) return

      if (!result.descriptor || result.score < 0.5) {
        stableRef.current = 0
        setHint(`จัดใบหน้าให้อยู่ในกรอบ — ${POSE_ARROW[target]}`)
        return
      }

      if (result.pose !== target) {
        stableRef.current = 0
        if (target === 'center') setHint('มองตรงกล้อง ไม่ต้องหันซ้ายหรือขวา')
        else if (target === 'left') setHint('หันศีรษะไปทางซ้ายของคุณช้า ๆ')
        else setHint('หันศีรษะไปทางขวาของคุณช้า ๆ')
        return
      }

      stableRef.current += 1
      if (stableRef.current < STABLE_FRAMES) {
        setHint(`ดีมาก! คงท่า ${POSE_LABEL[target]} อีกนิด... (${stableRef.current}/${STABLE_FRAMES})`)
        return
      }

      stableRef.current = 0
      const updated = [...samplesRef.current, result.descriptor]
      samplesRef.current = updated
      setSamples(updated)
      toast.success(`✓ ${POSE_LABEL[target]} — ครบ ${updated.length}/3`)

      if (updated.length >= 3) void finishRegistration(updated)
    }

    const id = window.setInterval(() => void tick(), SCAN_INTERVAL_MS)
    void tick()

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [phase, ready, cameraError, saving])

  const finishRegistration = async (finalSamples: number[][]) => {
    if (finalSamples.length < 3 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setHint('ตรวจสอบความมีชีวิต...')
    try {
      let livenessScore = 0.85
      let spoofFlags = 'pose-guided'
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        const liveness = await runLivenessCheck(videoRef.current)
        if (liveness.score < 0.45) {
          toast.error('ตรวจ liveness ไม่ผ่าน — กระพริบตาและขยับศีรษะก่อนบันทึก')
          savingRef.current = false
          setSaving(false)
          return
        }
        const fields = livenessToFormFields(liveness)
        livenessScore = fields.livenessScore
        spoofFlags = fields.spoofFlags
      }
      setHint('กำลังบันทึกลงระบบ...')
      const registrationImageDataUrl =
        videoRef.current && videoRef.current.videoWidth > 0
          ? captureJpegFromVideo(videoRef.current) ?? undefined
          : undefined
      const { ok, data, status } = await apiJson<{ success?: boolean }>('/api/face/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          samples: finalSamples,
          livenessScore,
          spoofFlags,
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
    setPoseStep('center')
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
            หน้าตรง → หันซ้าย → หันขวา ระบบจับภาพให้อัตโนมัติเมื่อทำถูกท่า
          </p>
        </div>
      </div>

      <FaceStepGuide steps={REGISTER_GUIDE_STEPS} currentIndex={phaseToGuideIndex(poseStep, phase)} />

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
            overlayLabel={phase === 'scan' ? POSE_LABEL[poseStep] : 'เตรียมกล้อง'}
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
              <div className="flex justify-center gap-2">
                {POSE_ORDER.map((p, i) => (
                  <div key={p} className="flex flex-col items-center gap-1">
                    <span
                      className={`h-2.5 w-10 rounded-full transition-colors ${
                        i < samples.length
                          ? 'bg-green-500'
                          : i === samples.length
                            ? 'bg-cyan-500 animate-pulse'
                            : 'dark:bg-white/15 light:bg-slate-200'
                      }`}
                    />
                    <span className="text-[9px] dark:text-slate-500">{POSE_LABEL[p]}</span>
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
                  hint || POSE_ARROW[poseStep]
                )}
              </p>

              {!saving && !allPosesDone && (
                <p className="text-[10px] text-center dark:text-slate-500">
                  ไม่ต้องกดปุ่ม — ทำตามท่าที่บอก ระบบจับให้เอง
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
