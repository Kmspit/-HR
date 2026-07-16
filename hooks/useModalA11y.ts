import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus trap (Tab/Shift+Tab stay within the dialog) + focus return (the
 * element that had focus before opening gets it back on close) for a
 * hand-rolled modal. Attach `panelRef` to the dialog's outer element and
 * spread `role="dialog" aria-modal="true"` on it — this hook only owns
 * focus behavior, not the visual chrome.
 *
 * Extracted from components/motion/MotionModal.tsx so every independently
 * hand-rolled modal in the app gets the same tested behavior instead of
 * re-implementing it (or, as was the case before, not having it at all).
 */
export function useModalA11y(open: boolean): RefObject<HTMLDivElement | null> {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    const focusFirst = () => {
      const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(focusable?.[0] ?? panel)?.focus()
    }
    // Defer one tick so the panel has actually mounted before we query it.
    const t = setTimeout(focusFirst, 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => el.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  return panelRef
}
