/** Prototype HTML ↔ API bridges — disabled in production unless explicitly enabled. */
export function isPrototypeBridgeEnabled(): boolean {
  return process.env.ENABLE_PROTOTYPE_BRIDGE === 'true'
}

export function prototypeBridgeDisabledResponse() {
  return Response.json(
    { ok: false, error: 'PROTOTYPE_BRIDGE_DISABLED', message: 'Prototype bridge is disabled' },
    { status: 403 },
  )
}

/** When bridge is enabled, require PROTOTYPE_BRIDGE_SECRET header (503 if unset). */
export function requirePrototypeBridgeSecret(req: Request): Response | null {
  if (!isPrototypeBridgeEnabled()) return prototypeBridgeDisabledResponse()
  const expected = process.env.PROTOTYPE_BRIDGE_SECRET?.trim()
  if (!expected) {
    return Response.json(
      { ok: false, error: 'PROTOTYPE_BRIDGE_MISCONFIGURED', message: 'PROTOTYPE_BRIDGE_SECRET is required when bridge is enabled' },
      { status: 503 },
    )
  }
  const provided = req.headers.get('x-prototype-bridge-secret')?.trim()
  if (provided !== expected) {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  return null
}
