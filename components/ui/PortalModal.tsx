'use client'

import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { useModalA11y } from '@/hooks/useModalA11y'
import { cn } from '@/lib/utils'

type Props = {
  onClose: () => void
  ariaLabel: string
  children: React.ReactNode
  /** Backdrop wrapper classes — defaults to the app's existing dark-overlay convention */
  backdropClassName?: string
  /** Centering-wrapper classes (the flex container between backdrop and panel) — override to
   *  preserve a page's own responsive layout, e.g. a mobile bottom-sheet via `items-end md:items-center` */
  wrapperClassName?: string
  panelClassName?: string
  /** Clicking the backdrop (outside the panel) closes the modal — off by default to match
   *  each page's prior behavior; pass true only for modals that already dismissed on backdrop click */
  dismissOnBackdrop?: boolean
}

/**
 * Backdrop + dialog panel rendered via a portal to document.body instead of
 * inline in the page's component tree. A `position:fixed; inset:0` element
 * nested inside this app's dashboard layout (DashboardLayout -> PageTransition
 * -> page root, several of which rely on flex-1/h-full stretching through a
 * plain `display:block` <main>) gets sized as an ordinary flex-column item
 * instead of a viewport-relative overlay — the backdrop collapses to a thin
 * strip and page content shows through underneath it. Portaling to
 * document.body removes the element from that ancestor chain entirely, so
 * it can't inherit a broken containing block regardless of the exact cause.
 */
export default function PortalModal({
  onClose, ariaLabel, children, backdropClassName, wrapperClassName, panelClassName, dismissOnBackdrop = false,
}: Props) {
  const panelRef = useModalA11y(true)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div className={cn('fixed inset-0 bg-black/40 z-60 overflow-y-auto', backdropClassName)}>
      <div
        className={cn('flex min-h-full items-center justify-center p-4', wrapperClassName)}
        onClick={dismissOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose() } : undefined}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal
          aria-label={ariaLabel}
          tabIndex={-1}
          className={panelClassName}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
