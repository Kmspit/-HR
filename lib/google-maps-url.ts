/**
 * Pure, network-free Google Maps URL coordinate parsing — used as the
 * optional secondary path for entering an OutsideWorkRequest location
 * (the primary path is the "📍 จับ GPS" browser-geolocation button, same
 * pattern as WeeklyPlanPanel.tsx).
 *
 * Deliberately does NOT resolve short links (maps.app.goo.gl, goo.gl/maps,
 * share.google, ...) — those never embed coordinates in the URL itself and
 * would require a server-side HTTP redirect-follow (confirmed: a real
 * example in production data takes at least 2 redirect hops to resolve).
 * That's a separate, larger decision — new external dependency, latency,
 * no reliability guarantee from Google — left for later if ever wanted.
 * Short links simply fail to parse here and the caller shows a message
 * pointing the user at the full-link format or the GPS button instead.
 */

export type ParsedMapsCoords = { lat: number; lng: number }

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

/**
 * Parses lat/lng out of a full-length Google Maps URL — the "@lat,lng,zoom"
 * segment present in desktop copy-link/share URLs
 * (.../place/Name/@13.7563,100.5018,17z/...), or a bare "lat,lng" in the
 * `q` query parameter (maps.google.com/?q=13.7563,100.5018). Returns null
 * for anything else, including every short-link format and any full link
 * that has no coordinates embedded (e.g. a place-name-only search result).
 */
export function parseGoogleMapsCoords(url: string): ParsedMapsCoords | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  const atMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (atMatch) {
    const lat = Number(atMatch[1])
    const lng = Number(atMatch[2])
    if (isValidLatLng(lat, lng)) return { lat, lng }
  }

  try {
    const parsed = new URL(trimmed)
    const q = parsed.searchParams.get('q')
    if (q) {
      const qMatch = q.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/)
      if (qMatch) {
        const lat = Number(qMatch[1])
        const lng = Number(qMatch[2])
        if (isValidLatLng(lat, lng)) return { lat, lng }
      }
    }
  } catch {
    // not a valid absolute URL — fall through to null
  }

  return null
}
