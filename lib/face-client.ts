'use client'

import type * as FaceApi from '@vladmandic/face-api'
import {
  computeEarFromLandmarks,
  sampleVideoLuminance,
  scoreLivenessSamples,
  serializeSpoofFlags,
  type LivenessChallengeResult,
} from '@/lib/face-liveness'

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
  // scoreThreshold 0.4: detect faces more easily in varied lighting / distance
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
}

export type HeadPose = 'none' | 'center' | 'left' | 'right'

export type FaceScanResult = {
  descriptor: number[] | null
  pose: HeadPose
  score: number
}

export async function scanFaceFromVideo(video: HTMLVideoElement): Promise<FaceScanResult> {
  await loadFaceModels()
  if (!faceapi) throw new Error('Face models not loaded')
  const det = await faceapi
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

  // ±0.25 allows natural head position variation (was ±0.14 — too strict)
  let pose: HeadPose = 'center'
  if (yaw > 0.25) pose = 'left'
  else if (yaw < -0.25) pose = 'right'

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

export type LivenessResult = LivenessChallengeResult

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Anti-spoof challenge: กระพริบตา + ขยับศีรษะ + ตรวจกล้องสด (~3.5 วินาที)
 */
export async function runLivenessCheck(video: HTMLVideoElement): Promise<LivenessResult> {
  await loadFaceModels()
  const flags: string[] = []
  const earSamples: number[] = []
  const nosePositions: { x: number; y: number }[] = []
  const luminanceSamples: number[] = []

  const samples = 6
  for (let i = 0; i < samples; i++) {
    await sleep(550)
    if (video.readyState < 2) {
      flags.push('camera_not_ready')
      continue
    }

    luminanceSamples.push(sampleVideoLuminance(video))

    if (!faceapi) throw new Error('Face models not loaded')
    const det = await faceapi
      .detectSingleFace(video, detectorOptions())
      .withFaceLandmarks(true)

    if (!det?.landmarks) {
      flags.push('no_face')
      continue
    }

    const ear = computeEarFromLandmarks(det.landmarks)
    if (ear.avg > 0) earSamples.push(ear.avg)

    const nose = det.landmarks.getNose()[3]
    nosePositions.push({ x: nose.x, y: nose.y })
  }

  if (nosePositions.length < 4) flags.push('insufficient_samples')

  return scoreLivenessSamples({
    earSamples,
    nosePositions,
    luminanceSamples,
    flags,
  })
}

export function livenessToFormFields(result: LivenessResult) {
  return {
    livenessScore: result.score,
    spoofFlags: serializeSpoofFlags(result.flags, {
      blink: result.blinkDetected,
      movementPx: result.movementPx,
      liveFrames: result.liveFrames,
    }),
  }
}

/** จับภาพ JPEG จากวิดีโอกล้องสำหรับบันทึกสแกนใบหน้า */
export function captureJpegFromVideo(video: HTMLVideoElement, quality = 0.82): string | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0)
  return canvas.toDataURL('image/jpeg', quality)
}
