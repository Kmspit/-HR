import { describe, expect, it } from 'vitest'
import { requirePrototypeBridgeSecret } from '@/lib/prototype-bridge'

describe('requirePrototypeBridgeSecret', () => {
  it('returns disabled when bridge env is off', () => {
    const prev = process.env.ENABLE_PROTOTYPE_BRIDGE
    delete process.env.ENABLE_PROTOTYPE_BRIDGE
    const res = requirePrototypeBridgeSecret(new Request('http://localhost/api/leave/prototype'))
    expect(res?.status).toBe(403)
    if (prev) process.env.ENABLE_PROTOTYPE_BRIDGE = prev
  })

  it('returns 503 when enabled but secret unset', () => {
    const prevEnable = process.env.ENABLE_PROTOTYPE_BRIDGE
    const prevSecret = process.env.PROTOTYPE_BRIDGE_SECRET
    process.env.ENABLE_PROTOTYPE_BRIDGE = 'true'
    delete process.env.PROTOTYPE_BRIDGE_SECRET
    const res = requirePrototypeBridgeSecret(new Request('http://localhost/api/leave/prototype'))
    expect(res?.status).toBe(503)
    if (prevEnable) process.env.ENABLE_PROTOTYPE_BRIDGE = prevEnable
    else delete process.env.ENABLE_PROTOTYPE_BRIDGE
    if (prevSecret) process.env.PROTOTYPE_BRIDGE_SECRET = prevSecret
  })

  it('passes when header matches secret', () => {
    const prevEnable = process.env.ENABLE_PROTOTYPE_BRIDGE
    const prevSecret = process.env.PROTOTYPE_BRIDGE_SECRET
    process.env.ENABLE_PROTOTYPE_BRIDGE = 'true'
    process.env.PROTOTYPE_BRIDGE_SECRET = 'test-secret'
    const req = new Request('http://localhost/api/leave/prototype', {
      headers: { 'x-prototype-bridge-secret': 'test-secret' },
    })
    expect(requirePrototypeBridgeSecret(req)).toBeNull()
    if (prevEnable) process.env.ENABLE_PROTOTYPE_BRIDGE = prevEnable
    else delete process.env.ENABLE_PROTOTYPE_BRIDGE
    if (prevSecret) process.env.PROTOTYPE_BRIDGE_SECRET = prevSecret
    else delete process.env.PROTOTYPE_BRIDGE_SECRET
  })
})
