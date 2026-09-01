/**
 * State machine for the "ประวัติการแก้ไข" tab's fetch. Kept as a plain
 * reducer (no React) so "every path reaches a terminal state, the UI can
 * never get stuck on the loading spinner" is testable without a
 * component-rendering setup, which this project doesn't have — same
 * reasoning as lib/national-id-reveal.ts.
 *
 * Previous bug this replaces: the component used a `loading` boolean as
 * both the effect's re-fetch guard AND a dependency of that same effect —
 * setLoading(true) retriggered the effect, which cancelled the in-flight
 * request's own eventual dispatch before it could resolve, permanently
 * stranding the UI in the loading phase. This module has no such
 * self-referential state — `phase` only ever changes via an explicit
 * action, and every fetch path (success, HTTP error, thrown exception)
 * must end in a SUCCESS or FAILURE dispatch, never silently left at
 * 'loading'.
 */

export type HistoryLoadItem = {
  id: string
  at: string
  actorName: string
  changes: string[]
}

export type HistoryLoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'loaded'; items: HistoryLoadItem[]; trackingStartedAt: string | null }
  | { phase: 'error'; message: string; canRetry: boolean }

export type HistoryLoadAction =
  | { type: 'START' }
  | { type: 'SUCCESS'; items: HistoryLoadItem[]; trackingStartedAt: string | null }
  | { type: 'FAILURE'; status: number }

export const initialHistoryLoadState: HistoryLoadState = { phase: 'idle' }

/**
 * 403 means the viewer genuinely lacks permission — retrying won't change
 * that, so it gets its own message and no retry button. Every other failure
 * (network error, 500, timeout, malformed response) is generic and
 * retry-able — the server's raw error text is deliberately not surfaced
 * here so the message stays predictable regardless of what the backend says.
 */
export function historyErrorMessage(status: number): string {
  if (status === 403) return 'ไม่มีสิทธิ์ดูประวัติ'
  return 'โหลดประวัติไม่สำเร็จ'
}

export function historyCanRetry(status: number): boolean {
  return status !== 403
}

export function historyLoadReducer(state: HistoryLoadState, action: HistoryLoadAction): HistoryLoadState {
  switch (action.type) {
    case 'START':
      return { phase: 'loading' }
    case 'SUCCESS':
      return { phase: 'loaded', items: action.items, trackingStartedAt: action.trackingStartedAt }
    case 'FAILURE':
      return { phase: 'error', message: historyErrorMessage(action.status), canRetry: historyCanRetry(action.status) }
    default:
      return state
  }
}

/** Whether the effect should kick off a fetch right now — a fetch starts at
 *  most once per mount (guarded by a ref in the component, not by `phase`,
 *  so this decision never depends on state the fetch itself changes). */
export function shouldStartHistoryLoad(active: boolean, alreadyStarted: boolean): boolean {
  return active && !alreadyStarted
}
