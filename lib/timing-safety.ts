/**
 * Pads a request handler's response time up to a minimum floor, so that a
 * fast path (e.g. "no such account") can't be distinguished from a slower
 * path (e.g. "account exists, wrote an OTP row") by measuring wall-clock
 * response time. Call once, right before returning, with the timestamp
 * captured at the start of the handler.
 */
export async function padToMinDuration(startedAt: number, minMs: number): Promise<void> {
  const elapsed = Date.now() - startedAt
  const remaining = minMs - elapsed
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining))
  }
}
