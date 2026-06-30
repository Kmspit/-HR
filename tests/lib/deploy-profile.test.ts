import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getDeployProfile,
  isPathHiddenByDeployProfile,
  resetDeployProfileCache,
} from '@/lib/deploy-profile'

describe('deploy-profile', () => {
  const env = process.env

  beforeEach(() => {
    resetDeployProfileCache()
  })

  afterEach(() => {
    process.env = env
    resetDeployProfileCache()
  })

  it('defaults to full profile', () => {
    delete process.env.NEXT_PUBLIC_DEPLOY_PROFILE
    delete process.env.DEPLOY_PROFILE
    resetDeployProfileCache()
    expect(getDeployProfile()).toBe('full')
    expect(isPathHiddenByDeployProfile('/cases')).toBe(false)
  })

  it('hr profile hides legal, finance, and work module paths', () => {
    process.env.NEXT_PUBLIC_DEPLOY_PROFILE = 'hr'
    resetDeployProfileCache()
    expect(isPathHiddenByDeployProfile('/cases')).toBe(true)
    expect(isPathHiddenByDeployProfile('/billing')).toBe(true)
    expect(isPathHiddenByDeployProfile('/tasks')).toBe(true)
    expect(isPathHiddenByDeployProfile('/training')).toBe(true)
    expect(isPathHiddenByDeployProfile('/payroll')).toBe(false)
    expect(isPathHiddenByDeployProfile('/attendance')).toBe(false)
    expect(isPathHiddenByDeployProfile('/api/cases')).toBe(true)
    expect(isPathHiddenByDeployProfile('/api/tasks/generate')).toBe(true)
  })

  it('legal profile hides HR admin and extra paths', () => {
    process.env.NEXT_PUBLIC_DEPLOY_PROFILE = 'legal'
    resetDeployProfileCache()
    expect(isPathHiddenByDeployProfile('/payroll')).toBe(true)
    expect(isPathHiddenByDeployProfile('/employees')).toBe(true)
    expect(isPathHiddenByDeployProfile('/settings')).toBe(true)
    expect(isPathHiddenByDeployProfile('/executive')).toBe(true)
    expect(isPathHiddenByDeployProfile('/security')).toBe(true)
    expect(isPathHiddenByDeployProfile('/documents')).toBe(true)
    expect(isPathHiddenByDeployProfile('/cases')).toBe(false)
    expect(isPathHiddenByDeployProfile('/leave')).toBe(false)
    expect(isPathHiddenByDeployProfile('/api/payroll')).toBe(true)
    expect(isPathHiddenByDeployProfile('/api/settings')).toBe(true)
  })

  it('frozen modules hide additional paths', () => {
    process.env.NEXT_PUBLIC_FROZEN_MODULES = '/training,/automation'
    resetDeployProfileCache()
    expect(isPathHiddenByDeployProfile('/training')).toBe(true)
    expect(isPathHiddenByDeployProfile('/automation')).toBe(true)
  })
})
