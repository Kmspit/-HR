'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { attachStreamToVideo } from '@/hooks/useCameraStream'
import { cn } from '@/lib/utils'

type Props = {
  stream: MediaStream | null
  ready: boolean
  loading?: boolean
  overlayLabel?: string
  className?: string
  mirror?: boolean
  /** Fills the nearest positioned ancestor (absolute inset-0, no rounding/border) instead of
   *  the default small centered box — pair with a `fixed inset-0` wrapper for a true page takeover. */
  fullscreen?: boolean
}

export default function CameraPreviewVideo({
  stream,
  ready,
  loading = false,
  overlayLabel,
  className,
  mirror = true,
  fullscreen = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoLive, setVideoLive] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) {
      setVideoLive(false)
      return
    }

    let cancelled = false
    setVideoLive(false)

    attachStreamToVideo(video, stream).then(() => {
      if (!cancelled && video.videoWidth > 0) {
        setVideoLive(true)
      }
    })

    const onPlaying = () => {
      if (video.videoWidth > 0) setVideoLive(true)
    }
    video.addEventListener('playing', onPlaying)

    return () => {
      cancelled = true
      video.removeEventListener('playing', onPlaying)
      if (video.srcObject === stream) {
        video.srcObject = null
      }
    }
  }, [stream])

  const showSpinner = loading || (ready && stream && !videoLive)

  return (
    <div
      className={cn(
        fullscreen
          ? 'absolute inset-0 overflow-hidden bg-black'
          : 'relative mx-auto w-full max-w-[min(100%,320px)] aspect-[4/3] rounded-2xl overflow-hidden bg-black border dark:border-white/10 light:border-slate-200',
        className,
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        disablePictureInPicture
        className={cn(
          'w-full h-full object-cover min-h-[180px]',
          mirror && 'scale-x-[-1]',
          !videoLive && 'opacity-0',
        )}
      />
      {overlayLabel && (
        <div className={cn('absolute left-0 right-0 text-center pointer-events-none z-10', fullscreen ? 'bottom-[max(2rem,env(safe-area-inset-bottom))]' : 'bottom-3')}>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-black/70 text-cyan-200">
            {overlayLabel}
          </span>
        </div>
      )}
      <div className={cn('absolute border-2 border-dashed border-cyan-400/50 pointer-events-none z-10', fullscreen ? 'inset-10 sm:inset-20 rounded-3xl' : 'inset-6 rounded-2xl')} />
      {showSpinner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 z-20">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-[11px] text-slate-400">กำลังเปิดกล้อง...</p>
        </div>
      )}
      {!stream && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <p className="text-xs text-slate-500 px-4 text-center">รอกล้อง...</p>
        </div>
      )}
    </div>
  )
}

/** ส่ง video element ให้ parent ใช้สแกนใบหน้า / ถ่ายรูป */
export function useCameraVideoRef() {
  return useRef<HTMLVideoElement>(null)
}

export type CameraPreviewWithRefProps = Props & {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

/** แบบมี ref ภายนอกสำหรับ extractDescriptor / canvas */
export function CameraPreviewVideoWithRef({
  videoRef,
  stream,
  ready,
  loading,
  overlayLabel,
  className,
  mirror = true,
  fullscreen = false,
}: CameraPreviewWithRefProps) {
  const [videoLive, setVideoLive] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) {
      setVideoLive(false)
      return
    }

    let cancelled = false
    setVideoLive(false)

    attachStreamToVideo(video, stream).then(() => {
      if (!cancelled && video.videoWidth > 0) setVideoLive(true)
    })

    const onPlaying = () => {
      if (video.videoWidth > 0) setVideoLive(true)
    }
    video.addEventListener('playing', onPlaying)

    return () => {
      cancelled = true
      video.removeEventListener('playing', onPlaying)
    }
  }, [stream, videoRef])

  const showSpinner = loading || (ready && stream && !videoLive)

  return (
    <div
      className={cn(
        fullscreen
          ? 'absolute inset-0 overflow-hidden bg-black'
          : 'relative mx-auto w-full max-w-[min(100%,320px)] aspect-[4/3] rounded-2xl overflow-hidden bg-black border dark:border-white/10 light:border-slate-200',
        className,
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        disablePictureInPicture
        className={cn(
          'w-full h-full object-cover min-h-[180px]',
          mirror && 'scale-x-[-1]',
          !videoLive && 'opacity-0',
        )}
      />
      {overlayLabel && (
        <div className={cn('absolute left-0 right-0 text-center pointer-events-none z-10', fullscreen ? 'bottom-[max(2rem,env(safe-area-inset-bottom))]' : 'bottom-3')}>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-black/70 text-cyan-200">
            {overlayLabel}
          </span>
        </div>
      )}
      <div className={cn('absolute border-2 border-dashed border-cyan-400/50 pointer-events-none z-10', fullscreen ? 'inset-10 sm:inset-20 rounded-3xl' : 'inset-6 rounded-2xl')} />
      {showSpinner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 z-20">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-[11px] text-slate-400">กำลังเปิดกล้อง...</p>
        </div>
      )}
    </div>
  )
}
