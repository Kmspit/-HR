import { describe, expect, it } from 'vitest'
import { matchRoutePermission, canAccessPath } from '@/lib/route-match'

describe('route-match', () => {
  it('prefers /attendance/scans over /attendance', () => {
    expect(matchRoutePermission('/attendance/scans')).toBe('/attendance/scans')
    expect(matchRoutePermission('/attendance/scans/123')).toBe('/attendance/scans')
  })

  it('matches /attendance for attendance root', () => {
    expect(matchRoutePermission('/attendance')).toBe('/attendance')
    expect(matchRoutePermission('/attendance/checkin')).toBe('/attendance')
  })

  it('denies EMPLOYEE from scan history', () => {
    expect(canAccessPath('EMPLOYEE', '/attendance/scans')).toBe(false)
    expect(canAccessPath('TEAM_LEADER', '/attendance/scans')).toBe(true)
  })
})
