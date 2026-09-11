/**
 * Pure, DB-free logic for device-binding anomaly detection — see
 * lib/device.ts's assertDeviceAllowed() for how this is wired into the
 * checkin/checkout/lunch flow. Not a hard-block gate: face match + liveness
 * remain the primary security check. This exists purely so HR has something
 * to look at retrospectively (via the existing /security events page) if a
 * registered device's browser/OS suddenly looks different, or its IP jumps
 * at the same time.
 *
 * Deliberately no geo-IP / impossible-travel detection here — this codebase
 * has no geo-IP lookup capability today, and adding one is a separate,
 * larger decision (new external dependency, cost, latency) left for later.
 */

export type UaSummary = { platform: string; browser: string }

/** Lightweight regex-based extraction — no UA-parsing library dependency,
 *  matching how this codebase already handles User-Agent elsewhere (e.g.
 *  app/api/attendance/checkin/route.ts just truncates the raw string).
 *  Order matters: some UAs match multiple patterns (e.g. Edge/Chrome both
 *  contain "Chrome/", desktop Chrome also contains "Safari/"). */
export function summarizeUserAgent(ua: string | null | undefined): UaSummary {
  const s = (ua ?? '').trim()
  if (!s) return { platform: 'unknown', browser: 'unknown' }

  let platform = 'unknown'
  if (/iPhone|iPad|iPod/i.test(s)) platform = 'iOS'
  else if (/Android/i.test(s)) platform = 'Android'
  else if (/Windows/i.test(s)) platform = 'Windows'
  else if (/Macintosh|Mac OS X/i.test(s)) platform = 'macOS'
  else if (/Linux/i.test(s)) platform = 'Linux'

  let browser = 'unknown'
  if (/EdgiOS|EdgA|Edge\//i.test(s)) browser = 'Edge'
  else if (/SamsungBrowser/i.test(s)) browser = 'Samsung Internet'
  else if (/CriOS|Chrome\//i.test(s)) browser = 'Chrome'
  else if (/FxiOS|Firefox\//i.test(s)) browser = 'Firefox'
  else if (/Safari\//i.test(s)) browser = 'Safari'

  return { platform, browser }
}

export type DeviceAnomalySeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export type DeviceAnomalyResult =
  | { anomaly: false }
  | { anomaly: true; severity: DeviceAnomalySeverity; reason: string }

const SEVERITY_ORDER: DeviceAnomalySeverity[] = ['INFO', 'WARNING', 'CRITICAL']

function escalate(severity: DeviceAnomalySeverity): DeviceAnomalySeverity {
  const next = SEVERITY_ORDER.indexOf(severity) + 1
  return SEVERITY_ORDER[Math.min(next, SEVERITY_ORDER.length - 1)]
}

/**
 * Compares the incoming request's UA/IP against the device's last-known
 * values (UserDevice.lastUserAgent/lastIpAddress) and decides whether it's
 * worth flagging.
 *
 * - No prior UA on record (first-ever check for this device row): never an
 *   anomaly — there's nothing to compare against yet.
 * - OS/platform family changed (e.g. Android -> iOS): WARNING — the same
 *   registered device claiming a different OS is the stronger signal.
 * - Only the browser changed, same OS: INFO — people do switch/update
 *   browsers; still worth a quiet record, not worth raising an eyebrow.
 * - IP changing alone never triggers anything by itself (mobile IPs change
 *   constantly — wifi/cellular, carrier NAT rotation — this would be pure
 *   noise as a standalone signal).
 * - IP changing AT THE SAME TIME as a platform/browser change escalates the
 *   severity one tier (INFO -> WARNING, WARNING -> CRITICAL) — corroborating
 *   signals together are stronger than either alone.
 */
export function classifyDeviceAnomaly(params: {
  lastUserAgent: string | null
  lastIpAddress: string | null
  newUserAgent: string | null
  newIpAddress: string | null
}): DeviceAnomalyResult {
  const { lastUserAgent, lastIpAddress, newUserAgent, newIpAddress } = params

  if (!lastUserAgent) return { anomaly: false }

  const last = summarizeUserAgent(lastUserAgent)
  const next = summarizeUserAgent(newUserAgent)

  const platformChanged =
    last.platform !== 'unknown' && next.platform !== 'unknown' && last.platform !== next.platform
  const browserChanged =
    !platformChanged &&
    last.browser !== 'unknown' &&
    next.browser !== 'unknown' &&
    last.browser !== next.browser

  if (!platformChanged && !browserChanged) return { anomaly: false }

  let severity: DeviceAnomalySeverity = platformChanged ? 'WARNING' : 'INFO'
  let reason = platformChanged
    ? `เปลี่ยนระบบปฏิบัติการ: ${last.platform} → ${next.platform}`
    : `เปลี่ยนเบราว์เซอร์ (OS เดิม ${last.platform}): ${last.browser} → ${next.browser}`

  const ipChanged = !!lastIpAddress && !!newIpAddress && lastIpAddress !== newIpAddress
  if (ipChanged) {
    severity = escalate(severity)
    reason = `${reason} + IP เปลี่ยน (${lastIpAddress} → ${newIpAddress})`
  }

  return { anomaly: true, severity, reason }
}
