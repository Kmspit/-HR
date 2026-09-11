import { describe, it, expect } from 'vitest'
import { summarizeUserAgent, classifyDeviceAnomaly } from '@/lib/device-anomaly'

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const ANDROID_FIREFOX =
  'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0'
const ANDROID_SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/115.0.0.0 Mobile Safari/537.36'

describe('summarizeUserAgent', () => {
  it('identifies Android + Chrome', () => {
    expect(summarizeUserAgent(ANDROID_CHROME)).toEqual({ platform: 'Android', browser: 'Chrome' })
  })

  it('identifies iOS + Safari', () => {
    expect(summarizeUserAgent(IOS_SAFARI)).toEqual({ platform: 'iOS', browser: 'Safari' })
  })

  it('identifies Windows + Chrome', () => {
    expect(summarizeUserAgent(WINDOWS_CHROME)).toEqual({ platform: 'Windows', browser: 'Chrome' })
  })

  it('identifies Android + Firefox', () => {
    expect(summarizeUserAgent(ANDROID_FIREFOX)).toEqual({ platform: 'Android', browser: 'Firefox' })
  })

  it('identifies Samsung Internet ahead of the Chrome token it also contains', () => {
    expect(summarizeUserAgent(ANDROID_SAMSUNG)).toEqual({ platform: 'Android', browser: 'Samsung Internet' })
  })

  it('returns unknown/unknown for null, undefined, or empty input', () => {
    expect(summarizeUserAgent(null)).toEqual({ platform: 'unknown', browser: 'unknown' })
    expect(summarizeUserAgent(undefined)).toEqual({ platform: 'unknown', browser: 'unknown' })
    expect(summarizeUserAgent('')).toEqual({ platform: 'unknown', browser: 'unknown' })
  })

  it('returns unknown/unknown for a gibberish string that matches nothing', () => {
    expect(summarizeUserAgent('curl/8.0.1')).toEqual({ platform: 'unknown', browser: 'unknown' })
  })
})

describe('classifyDeviceAnomaly', () => {
  it('is never an anomaly when there is no prior UA on record (first-ever check)', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: null,
      lastIpAddress: null,
      newUserAgent: ANDROID_CHROME,
      newIpAddress: '1.2.3.4',
    })
    expect(result).toEqual({ anomaly: false })
  })

  it('is not an anomaly when UA and IP are unchanged', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: ANDROID_CHROME,
      lastIpAddress: '1.2.3.4',
      newUserAgent: ANDROID_CHROME,
      newIpAddress: '1.2.3.4',
    })
    expect(result).toEqual({ anomaly: false })
  })

  it('flags a platform/OS change as WARNING', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: ANDROID_CHROME,
      lastIpAddress: null,
      newUserAgent: IOS_SAFARI,
      newIpAddress: null,
    })
    expect(result.anomaly).toBe(true)
    if (result.anomaly) {
      expect(result.severity).toBe('WARNING')
      expect(result.reason).toContain('Android')
      expect(result.reason).toContain('iOS')
    }
  })

  it('flags a browser-only change (same OS) as INFO', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: ANDROID_CHROME,
      lastIpAddress: null,
      newUserAgent: ANDROID_FIREFOX,
      newIpAddress: null,
    })
    expect(result.anomaly).toBe(true)
    if (result.anomaly) {
      expect(result.severity).toBe('INFO')
      expect(result.reason).toContain('Chrome')
      expect(result.reason).toContain('Firefox')
    }
  })

  it('does not trigger on IP change alone (same platform and browser)', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: ANDROID_CHROME,
      lastIpAddress: '1.2.3.4',
      newUserAgent: ANDROID_CHROME,
      newIpAddress: '5.6.7.8',
    })
    expect(result).toEqual({ anomaly: false })
  })

  it('escalates INFO to WARNING when IP changes together with a browser-only change', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: ANDROID_CHROME,
      lastIpAddress: '1.2.3.4',
      newUserAgent: ANDROID_FIREFOX,
      newIpAddress: '5.6.7.8',
    })
    expect(result.anomaly).toBe(true)
    if (result.anomaly) {
      expect(result.severity).toBe('WARNING')
      expect(result.reason).toContain('IP เปลี่ยน')
    }
  })

  it('escalates WARNING to CRITICAL when IP changes together with a platform/OS change', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: ANDROID_CHROME,
      lastIpAddress: '1.2.3.4',
      newUserAgent: IOS_SAFARI,
      newIpAddress: '5.6.7.8',
    })
    expect(result.anomaly).toBe(true)
    if (result.anomaly) {
      expect(result.severity).toBe('CRITICAL')
    }
  })

  it('never escalates past CRITICAL', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: ANDROID_CHROME,
      lastIpAddress: '1.2.3.4',
      newUserAgent: IOS_SAFARI,
      newIpAddress: '5.6.7.8',
    })
    expect(result.anomaly && result.severity).toBe('CRITICAL')
  })

  it('does not flag a change when the new UA is unparseable (avoids false positives from bad parsing)', () => {
    const result = classifyDeviceAnomaly({
      lastUserAgent: ANDROID_CHROME,
      lastIpAddress: null,
      newUserAgent: 'curl/8.0.1',
      newIpAddress: null,
    })
    expect(result).toEqual({ anomaly: false })
  })
})
