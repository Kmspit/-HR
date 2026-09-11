import { describe, it, expect } from 'vitest'
import { parseGoogleMapsCoords, isValidLatLng } from '@/lib/google-maps-url'

describe('isValidLatLng', () => {
  it('accepts valid coordinates', () => {
    expect(isValidLatLng(13.7563, 100.5018)).toBe(true)
    expect(isValidLatLng(-33.8688, 151.2093)).toBe(true)
    expect(isValidLatLng(90, 180)).toBe(true)
    expect(isValidLatLng(-90, -180)).toBe(true)
  })

  it('rejects out-of-range values', () => {
    expect(isValidLatLng(91, 100)).toBe(false)
    expect(isValidLatLng(13, 181)).toBe(false)
    expect(isValidLatLng(-91, 0)).toBe(false)
  })

  it('rejects non-finite values', () => {
    expect(isValidLatLng(NaN, 100)).toBe(false)
    expect(isValidLatLng(13, Infinity)).toBe(false)
  })
})

describe('parseGoogleMapsCoords — full links with embedded coordinates (no network)', () => {
  it('parses the @lat,lng,zoom segment from a place-share desktop URL', () => {
    const url = 'https://www.google.com/maps/place/Eiffel+Tower/@48.8584,2.2945,17z/data=!3m1!4b1'
    expect(parseGoogleMapsCoords(url)).toEqual({ lat: 48.8584, lng: 2.2945 })
  })

  it('parses a bare @lat,lng URL with no trailing zoom', () => {
    expect(parseGoogleMapsCoords('https://www.google.com/maps/@13.7563,100.5018')).toEqual({
      lat: 13.7563, lng: 100.5018,
    })
  })

  it('parses negative coordinates (southern/western hemisphere)', () => {
    expect(parseGoogleMapsCoords('https://www.google.com/maps/@-33.8688,151.2093,15z')).toEqual({
      lat: -33.8688, lng: 151.2093,
    })
  })

  it('parses a bare lat,lng from the ?q= query param', () => {
    expect(parseGoogleMapsCoords('https://maps.google.com/?q=13.7563,100.5018')).toEqual({
      lat: 13.7563, lng: 100.5018,
    })
  })
})

describe('parseGoogleMapsCoords — deliberately unsupported (returns null, no network call)', () => {
  it('returns null for a maps.app.goo.gl short link', () => {
    expect(parseGoogleMapsCoords('https://maps.app.goo.gl/xyzABC123')).toBeNull()
  })

  it('returns null for a goo.gl/maps short link', () => {
    expect(parseGoogleMapsCoords('https://goo.gl/maps/xyzABC123')).toBeNull()
  })

  it('returns null for a share.google short link (the exact format found in production data)', () => {
    expect(parseGoogleMapsCoords('https://share.google/T1awq8zb91o6grcpM')).toBeNull()
  })

  it('returns null for a place-name-only URL with no dropped pin', () => {
    expect(parseGoogleMapsCoords('https://www.google.com/maps/place/Eiffel+Tower')).toBeNull()
  })

  it('returns null for a ?q=placename (non-numeric) query', () => {
    expect(parseGoogleMapsCoords('https://maps.google.com/?q=Eiffel+Tower')).toBeNull()
  })

  it('returns null for empty, whitespace-only, or garbage input', () => {
    expect(parseGoogleMapsCoords('')).toBeNull()
    expect(parseGoogleMapsCoords('   ')).toBeNull()
    expect(parseGoogleMapsCoords('not a url at all')).toBeNull()
  })

  it('returns null when the @ segment has out-of-range values', () => {
    expect(parseGoogleMapsCoords('https://www.google.com/maps/@999,100.5018,17z')).toBeNull()
  })
})
