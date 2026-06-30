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
