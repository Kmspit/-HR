/**
 * State machine for the "ดูเลขเต็ม" reveal control on a national ID field.
 * Fetching the real value from GET /api/users/[id]/sensitive is audit-logged once
 * per call, so show/hide toggling after a successful fetch must NEVER refetch — it
 * only flips between the masked and plaintext views of the value already in memory.
 * Kept as a plain reducer (no React) so the "never refetch on toggle" guarantee is
 * testable without a component-rendering setup, which this project doesn't have.
 */
export type RevealState = {
  status: 'hidden' | 'visible' | 'masked'
  value: string
  /** Increments only on a real fetch — the thing tests assert to prove no refetch. */
  fetchCount: number
}

export type RevealAction =
  | { type: 'FETCHED'; value: string }
  | { type: 'TOGGLE' }
  | { type: 'HIDE' }
  | { type: 'CLEAR' }

export const initialRevealState: RevealState = { status: 'hidden', value: '', fetchCount: 0 }

/**
 * What the 60s idle timer should do: if the field hasn't been edited since it was
 * revealed, wipe it (CLEAR); if HR is mid-edit, only hide it (HIDE) — auto-clear must
 * never destroy work in progress, only keep the value off-screen when unattended.
 */
export function idleTimeoutAction(currentValue: string, revealedBaseline: string): 'HIDE' | 'CLEAR' {
  return currentValue === revealedBaseline ? 'CLEAR' : 'HIDE'
}

export function revealReducer(state: RevealState, action: RevealAction): RevealState {
  switch (action.type) {
    case 'FETCHED':
      return { status: 'visible', value: action.value, fetchCount: state.fetchCount + 1 }
    case 'TOGGLE':
      if (state.status === 'hidden') return state
      return { ...state, status: state.status === 'visible' ? 'masked' : 'visible' }
    // Idempotent hide — used by the idle-timeout path when a pending edit means the
    // value itself must be kept (only TOGGLE's "visible" needs hiding; 'masked' and
    // 'hidden' are already fine as-is).
    case 'HIDE':
      if (state.status === 'visible') return { ...state, status: 'masked' }
      return state
    case 'CLEAR':
      return { status: 'hidden', value: '', fetchCount: state.fetchCount }
    default:
      return state
  }
}
