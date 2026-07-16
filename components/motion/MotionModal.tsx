'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fadeIn, modalPanel } from '@/lib/motion-presets'
import { useModalA11y } from '@/hooks/useModalA11y'

type Props = {
  open: boolean
  onClose?: () => void
  children: React.ReactNode
  className?: string
  panelClassName?: string
  /** Backdrop click closes modal when true (default) */
  dismissOnBackdrop?: boolean
  zIndex?: string
  /** Accessible name for the dialog, announced by screen readers on open */
  ariaLabel?: string
}

export default function MotionModal({
  open,
  onClose,
  children,
  className,
  panelClassName,
  dismissOnBackdrop = true,
  zIndex = 'z-50',
  ariaLabel,
}: Props) {
  const reduced = useReducedMotion()
  // Focus trap (Tab/Shift+Tab stay within the dialog) + focus return (the
  // element that had focus before opening gets it back on close), matching
  // standard dialog behavior — previously the modal had neither, so keyboard
  // and screen-reader users could tab straight through to page content
  // hidden behind the backdrop, and lost their place entirely on close.
  const panelRef = useModalA11y(open)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open || !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const backdrop = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : fadeIn
  const panel = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : modalPanel

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            'fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]',
            zIndex,
            className,
          )}
          {...backdrop}
          onClick={dismissOnBackdrop ? onClose : undefined}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            {...panel}
            className={cn(
              'w-full max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 shadow-xl',
              panelClassName,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
