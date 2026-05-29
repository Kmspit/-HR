/**
 * Anti-spoofing: blink (EAR), head movement, live camera frames
 */

export type LivenessChallengeResult = {
  score: number
  flags: string[]
  blinkDetected: boolean
  movementPx: number
  liveFrames: number
}

function eyeAspectRatio(
  eye: { x: number; y: number }[],
): number {
  if (eye.length < 6) return 0
  const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y)
  const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y)
  const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y)
  if (h === 0) return 0
  return (v1 + v2) / (2 * h)
}

export type FaceLandmarksLike = {
  getLeftEye: () => { x: number; y: number }[]
  getRightEye: () => { x: number; y: number }[]
  getNose: () => { x: number; y: number }[]
}

export function computeEarFromLandmarks(lm: FaceLandmarksLike): {
  left: number
  right: number
  avg: number
} {
  const left = eyeAspectRatio(lm.getLeftEye())
  const right = eyeAspectRatio(lm.getRightEye())
  return { left, right, avg: (left + right) / 2 }
}

const EAR_OPEN = 0.22
const EAR_CLOSED = 0.16

export function sampleVideoLuminance(video: HTMLVideoElement): number {
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const ctx = canvas.getContext('2d')
  if (!ctx || video.videoWidth === 0) return 0
  ctx.drawImage(video, 0, 0, 48, 48)
  const data = ctx.getImageData(0, 0, 48, 48).data
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return sum / (48 * 48)
}

export function scoreLivenessSamples(params: {
  earSamples: number[]
  nosePositions: { x: number; y: number }[]
  luminanceSamples: number[]
  flags: string[]
}): LivenessChallengeResult {
  const { earSamples, nosePositions, luminanceSamples, flags } = params

  let blinkDetected = false
  if (earSamples.length >= 3) {
    const hadOpen = earSamples.some((e) => e >= EAR_OPEN)
    const hadClosed = earSamples.some((e) => e > 0 && e <= EAR_CLOSED)
    blinkDetected = hadOpen && hadClosed
  }
  if (!blinkDetected) flags.push('no_blink')

  let movementPx = 0
  if (nosePositions.length >= 2) {
    const first = nosePositions[0]
    const last = nosePositions[nosePositions.length - 1]
    movementPx = Math.hypot(last.x - first.x, last.y - first.y)
  }
  if (movementPx < 6) flags.push('low_motion')

  const lumRange =
    luminanceSamples.length > 1
      ? Math.max(...luminanceSamples) - Math.min(...luminanceSamples)
      : 0
  if (lumRange < 3) flags.push('static_frame')

  const liveFrames = nosePositions.length

  let score = 0
  if (blinkDetected) score += 0.35
  if (movementPx >= 10) score += 0.3
  else if (movementPx >= 6) score += 0.18
  if (lumRange >= 4) score += 0.15
  if (liveFrames >= 5) score += 0.1
  if (!flags.includes('no_face')) score += 0.1

  return {
    score: Math.min(1, score),
    flags,
    blinkDetected,
    movementPx,
    liveFrames,
  }
}

export function hasCriticalSpoofFlags(flags: string[]): boolean {
  return flags.some((f) =>
    ['static_frame', 'no_blink', 'low_motion', 'camera_not_ready', 'insufficient_samples', 'no_face'].includes(
      f,
    ),
  )
}

export function serializeSpoofFlags(flags: string[], extra?: Record<string, unknown>): string {
  return JSON.stringify({ flags, ...extra })
}

export function parseSpoofFlags(raw: string | null): { flags: string[]; extra: Record<string, unknown> } {
  if (!raw) return { flags: [], extra: {} }
  try {
    const parsed = JSON.parse(raw) as { flags?: string[] }
    if (Array.isArray(parsed.flags)) {
      return { flags: parsed.flags, extra: parsed as Record<string, unknown> }
    }
  } catch {
    return { flags: raw.split(',').map((s) => s.trim()).filter(Boolean), extra: {} }
  }
  return { flags: [], extra: {} }
}
