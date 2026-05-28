'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanFace, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, apiErrorMessage } from '@/lib/client-api'
import { extractDescriptorFromVideo, loadFaceModels, runLivenessCheck } from '@/lib/face-client'

type Props = {
  onRegistered: () => void
}

const SAMPLES_NEEDED = 3

export default function FaceRegistrationCard({ onRegistered }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [samples, setSamples] = useState<number[][]>([])
  const [step, setStep] = useState<'intro' | 'scan' | 'done'>('intro')
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
    } catch {
      setCameraError('ไม่สามารถเปิดกล้องได้ — อนุญาตการใช้กล้องในเบราว์เซอร์')
      setReady(false)
    }
  }, [])

  useEffect(() => {
    if (step !== 'scan') return
    startCamera()
    return () => stopCamera()
  }, [step, startCamera, stopCamera])

  const captureSample = async () => {
    if (!videoRef.current) return
    setLoading(true)
    try {
      const descriptor = await extractDescriptorFromVideo(videoRef.current)
      if (!descriptor) {
        toast.error('ไม่พบใบหน้า — จัดตำแหน่งให้อยู่กลางกรอบ')
        return
      }
      setSamples((prev) => [...prev, descriptor])
      toast.success(`บันทึกตัวอย่าง ${samples.length + 1}/${SAMPLES_NEEDED}`)
    } finally {
      setLoading(false)
    }
  }

  const finishRegistration = async () => {
    if (!videoRef.current || samples.length < 2) {
      toast.error('ต้องมีตัวอย่างใบหน้าอย่างน้อย 2 ครั้ง')
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
      setStep('done')
      stopCamera()
      onRegistered()
    } catch (err) {
      console.error('[face-register]', err)
      toast.error('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="glass-card rounded-2xl p-4 border border-green-500/30 flex items-center gap-3">
        <CheckCircle className="w-8 h-8 text-green-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold dark:text-white light:text-slate-900">ลงทะเบียนใบหน้าแล้ว</p>
          <p className="text-xs dark:text-slate-400 light:text-slate-600">พร้อมใช้ Face Recognition เช็กอิน</p>
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
            ลงทะเบียนใบหน้า (ครั้งเดียว)
          </h3>
          <p className="text-xs mt-1 dark:text-slate-400 light:text-slate-600 leading-relaxed">
            ระบบเก็บเฉพาะรหัสใบหน้าเข้ารหัส — ไม่เก็บรูปถาวร · ใช้สแกนแทนรหัสผ่านตอนเช็กอิน
          </p>
        </div>
      </div>

      {step === 'intro' && (
        <button
          type="button"
          onClick={() => setStep('scan')}
          className="btn-primary w-full py-3"
        >
          เริ่มลงทะเบียนใบหน้า
        </button>
      )}

      {step === 'scan' && (
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
          </div>
          <p className="text-center text-xs dark:text-slate-400 light:text-slate-600">
            ตัวอย่าง {samples.length}/{SAMPLES_NEEDED} — เลื่อนหน้าเบา ๆ ระหว่างถ่ายแต่ละครั้ง
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={captureSample}
              disabled={loading || !ready || samples.length >= SAMPLES_NEEDED}
              className="btn-secondary flex-1 py-2.5"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'จับภาพตัวอย่าง'}
            </button>
            <button
              type="button"
              onClick={finishRegistration}
              disabled={loading || samples.length < 2}
              className="btn-primary flex-1 py-2.5"
            >
              ยืนยันลงทะเบียน
            </button>
          </div>
          {cameraError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {cameraError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
