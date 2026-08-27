/** Fires `onIdle` after `ms` of no `touch()` calls. `touch()` again resets the clock. */
export function createIdleTimer(onIdle: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    touch() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onIdle, ms)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
