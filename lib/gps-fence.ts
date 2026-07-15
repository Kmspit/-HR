/** Haversine formula — distance between two GPS coordinates in meters */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type GpsSpoofFlag =
  | 'ZERO_ACCURACY'            // accuracy === 0 (impossible on real GPS)
  | 'SUSPICIOUS_HIGH_ACCURACY' // accuracy < 1m (real GPS can't achieve this)
  | 'VERY_LOW_ACCURACY'        // accuracy > 2000m (network/mocked location)
  | 'LOW_ACCURACY'             // accuracy > 500m (unreliable signal)
  | 'EXACT_MATCH'              // distance < 0.5m from target (copied coords)
  | 'ROUND_COORDINATES'        // lat/lng ≤ 2 decimal places (fake GPS signature)

/**
 * Server-side GPS spoof flag detection.
 * Flags are stored for HR review — they do NOT block check-in by themselves.
 * Geofence enforcement is the primary security gate.
 */
export function detectGpsSpoofFlags(opts: {
  lat: number
  lng: number
  accuracy?: number | null
  distanceM?: number | null
}): GpsSpoofFlag[] {
  const flags: GpsSpoofFlag[] = []
  const { lat, lng, accuracy, distanceM } = opts

  if (accuracy != null) {
    if (accuracy === 0)        flags.push('ZERO_ACCURACY')
    else if (accuracy < 1)    flags.push('SUSPICIOUS_HIGH_ACCURACY')
    else if (accuracy > 2000) flags.push('VERY_LOW_ACCURACY')
    else if (accuracy > 500)  flags.push('LOW_ACCURACY')
  }

  const latDec = lat.toString().split('.')[1]?.length ?? 0
  const lngDec = lng.toString().split('.')[1]?.length ?? 0
  if (latDec <= 2 || lngDec <= 2) flags.push('ROUND_COORDINATES')

  if (distanceM != null && distanceM < 0.5) flags.push('EXACT_MATCH')

  return flags
}

export type GeolocationPositionLike = {
  coords: { latitude: number; longitude: number; accuracy: number }
}

export type GetCurrentPositionFn = (
  onSuccess: (pos: GeolocationPositionLike) => void,
  onError: (err: unknown) => void,
  options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
) => void

/**
 * Wraps a getCurrentPosition-shaped function with a hard timeout, resolving `null` on
 * failure/timeout instead of rejecting — the point is to let a caller fall back to a
 * stale-but-known-good reading rather than block indefinitely on a slow/flaky GPS chip.
 * `maximumAge:0` forces an actual fresh read, not a cached position.
 */
export function refreshGpsWithTimeout(
  getCurrentPosition: GetCurrentPositionFn,
  timeoutMs: number,
): Promise<{ lat: number; lng: number; accuracy?: number } | null> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(null)
    }, timeoutMs)

    getCurrentPosition(
      (pos) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}
