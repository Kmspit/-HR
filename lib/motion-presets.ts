/** Shared Framer Motion presets — fast, subtle SaaS-style micro-interactions */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

export const springSnappy = { type: 'spring' as const, stiffness: 420, damping: 28, mass: 0.8 }

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: EASE_OUT },
}

export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: { duration: 0.22, ease: EASE_OUT },
}

export const modalPanel = {
  initial: { opacity: 0, scale: 0.97, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 6 },
  transition: { duration: 0.2, ease: EASE_OUT },
}

export const cardHover = {
  y: -3,
  transition: { duration: 0.15, ease: EASE_OUT },
}

export const cardTap = { scale: 0.98 }

export const buttonTap = { scale: 0.98 }
