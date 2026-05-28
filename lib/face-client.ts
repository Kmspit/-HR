'use client'

import type * as FaceApi from '@vladmandic/face-api'

let modelsLoaded = false
let faceapi: typeof FaceApi | null = null

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded && faceapi) return

  const tf = await import('@tensorflow/tfjs-core')
  await import('@tensorflow/tfjs-backend-webgl')
  if (tf.getBackend() !== 'webgl') {
    await tf.setBackend('webgl')
  }
  await tf.ready()

  faceapi = await import('@vladmandic/face-api')
  const MODEL_URL = '/models'
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ])
  modelsLoaded = true
}

function detectorOptions() {
  if (!faceapi) throw new Error('Face models not loaded')
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })
}

export type HeadPose = 'none' | 'center' | 'left' | 'right'

export type FaceScanResult = {
  descriptor: number[] | null
  pose: HeadPose
  score: number
}

/** ประมาณทิศทางศีรษะจาก landmark (กล้องหน้า) */
export async function scanFaceFromVideo(video: HTMLVideoElement): Promise<FaceScanResult> {
  await loadFaceModels()
  const det = await faceapi!
    .detectSingleFace(video, detectorOptions())
    .withFaceLandmarks(true)
    .withFaceDescriptor()

  if (!det?.landmarks || !det.descriptor) {
    return { descriptor: null, pose: 'none', score: 0 }
  }

  const lm = det.landmarks
  const leftEye = lm.getLeftEye()
  const rightEye = lm.getRightEye()
  const nose = lm.getNose()[3]

  const eyeMidX = (leftEye[0].x + rightEye[3].x) / 2
  const eyeDist = Math.abs(rightEye[3].x - leftEye[0].x) || 1
  const yaw = (nose.x - eyeMidX) / eyeDist

  let pose: HeadPose = 'center'
  if (yaw > 0.14) pose = 'left'
  else if (yaw < -0.14) pose = 'right'

  return {
    descriptor: Array.from(det.descriptor as Float32Array),
    pose,
    score: det.detection.score,
  }
}

export async function extractDescriptorFromVideo(
  video: HTMLVideoElement,
): Promise<number[] | null> {
  const r = await scanFaceFromVideo(video)
  return r.descriptor
}

export type LivenessResult = {
  score: number
  flags: string[]
}

/** Basic anti-spoof: motion between frames + luminance variance */
export async function runLivenessCheck(video: HTMLVideoElement): Promise<LivenessResult> {
  await loadFaceModels()
  const flags: string[] = []
  const nosePositions: { x: number; y: number }[] = []
  const luminanceSamples: number[] = []

  for (let i = 0; i < 4; i++) {
    await sleep(400)
    if (video.readyState < 2) {
      flags.push('camera_not_ready')
      continue
    }

    const lum = sampleLuminance(video)
    luminanceSamples.push(lum)

    const det = await faceapi!
      .detectSingleFace(video, detectorOptions())
      .withFaceLandmarks(true)
    if (!det) {
      flags.push('no_face')
      continue
    }
    const nose = det.landmarks.getNose()[3]
    nosePositions.push({ x: nose.x, y: nose.y })
  }

  if (nosePositions.length < 3) {
    return { score: 0, flags: [...flags, 'insufficient_samples'] }
  }

  const move = Math.hypot(
    nosePositions[nosePositions.length - 1].x - nosePositions[0].x,
    nosePositions[nosePositions.length - 1].y - nosePositions[0].y,
  )

  const lumRange =
    luminanceSamples.length > 1
      ? Math.max(...luminanceSamples) - Math.min(...luminanceSamples)
      : 0

  if (lumRange < 3) flags.push('static_frame')
  if (move < 5) flags.push('low_motion')

  let score = 0
  if (move >= 8) score += 0.45
  else if (move >= 5) score += 0.25
  if (lumRange >= 4) score += 0.25
  if (nosePositions.length >= 4) score += 0.2
  if (!flags.includes('no_face')) score += 0.1

  return { score: Math.min(1, score), flags }
}

function sampleLuminance(video: HTMLVideoElement): number {
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  ctx.drawImage(video, 0, 0, 48, 48)
  const data = ctx.getImageData(0, 0, 48, 48).data
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return sum / (48 * 48)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
