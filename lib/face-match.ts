/** Euclidean distance between two face-api 128-d descriptors (lower = more similar) */
export function faceDescriptorDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

/** Stricter than default 0.6 — tune for HR attendance */
export const FACE_MATCH_THRESHOLD = 0.55

export function isFaceMatch(distance: number, threshold = FACE_MATCH_THRESHOLD): boolean {
  return distance <= threshold
}

/** Average multiple enrollment samples */
export function averageDescriptors(samples: number[][]): number[] {
  if (samples.length === 0) return []
  const dim = samples[0].length
  const out = new Array(dim).fill(0)
  for (const s of samples) {
    for (let i = 0; i < dim; i++) out[i] += s[i]
  }
  const n = samples.length
  for (let i = 0; i < dim; i++) out[i] /= n
  return out
}

export function parseDescriptorPayload(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  if (nums.length < 64 || nums.length > 256) return null
  return nums
}
