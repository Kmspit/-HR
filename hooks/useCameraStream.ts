'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStreamOptions = {
  enabled: boolean
  /** โหลด face-api ก่อนเปิดกล้อง (ลงทะเบียน/สแกนใบหน้า) */
  preloadFaceModels?: () => Promise<void>
}

async function requestUserMedia(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('เบราว์เซอร์ไม่รองรับกล้อง — ใช้ Chrome/Safari/Edge บน HTTPS')
  }

  const videoConstraints: MediaTrackConstraints = {
    facingMode: 'user',
    width: { ideal: 640, max: 1280 },
    height: { ideal: 480, max: 720 },
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    })
  } catch {
    return await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    })
  }
}

export function useCameraStream({ enabled, preloadFaceModels }: CameraStreamOptions) {
  const streamRef = useRef<MediaStream | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
    setReady(false)
  }, [])

  const start = useCallback(async () => {
    setError('')
    setReady(false)
    try {
      if (preloadFaceModels) await preloadFaceModels()
      stop()
      const media = await requestUserMedia()
      streamRef.current = media
      setStream(media)
      setReady(true)
      return true
    } catch (err) {
      console.error('[camera]', err)
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'กรุณาอนุญาตกล้องในเบราว์เซอร์ (ไอคอนกุญแจที่แถบ URL)'
          : 'ไม่สามารถเปิดกล้องได้ — ตรวจสอบการอนุญาตและลองรีเฟรชหน้า'
      setError(msg)
      setReady(false)
      return false
    }
  }, [preloadFaceModels, stop])

  useEffect(() => {
    if (!enabled) {
      stop()
      return
    }
    start()
    return () => stop()
  }, [enabled, tick, start, stop])

  const retry = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  return { stream, ready, error, stop, retry, start }
}

/** ผูก MediaStream กับ <video> หลัง element mount (แก้จอดำบนมือถือ/PC) */
export async function attachStreamToVideo(
  video: HTMLVideoElement,
  media: MediaStream,
): Promise<void> {
  if (video.srcObject !== media) {
    video.srcObject = media
  }
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')

  const tryPlay = () => {
    video.play().catch((e) => {
      console.warn('[camera] play()', e)
    })
  }

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    tryPlay()
    return
  }

  await new Promise<void>((resolve) => {
    const onReady = () => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('canplay', onReady)
      tryPlay()
      resolve()
    }
    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('canplay', onReady)
    tryPlay()
    window.setTimeout(() => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('canplay', onReady)
      resolve()
    }, 3000)
  })
}
