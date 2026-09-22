'use client'

import { useEffect, useState } from 'react'

type Props = {
  value: number
  onChange: (value: number) => void
  /** 'decimal' (default) allows one '.' — for money/fractional quantities.
   *  'integer' rejects '.' entirely — for whole-number counts. */
  mode?: 'integer' | 'decimal'
  min?: number
  className?: string
  id?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  'aria-label'?: string
}

const DECIMAL_PATTERN = /^\d*\.?\d*$/
const INTEGER_PATTERN = /^\d*$/

/**
 * Drop-in replacement for <input type="number"> (mobile audit, 2026-09-22,
 * group 6) — type="number" forces the full alphanumeric keyboard on some
 * mobile browsers (only iOS Safari reliably shows a numeric pad for it) and
 * lets the mouse scroll-wheel silently change the value when the field
 * happens to be focused while the page scrolls, a well-known footgun.
 *
 * Uses type="text" + inputMode="numeric"/"decimal" instead — this reliably
 * triggers the numeric on-screen keyboard everywhere, and, since plain text
 * inputs have no native wheel-changes-value behavior at all (that quirk is
 * specific to type="number"), the scroll-wheel problem is prevented by
 * construction rather than needing an onWheel handler to suppress it.
 *
 * Keeps an internal text draft so a user can type a trailing "." (e.g.
 * "12.") without it snapping back to "12" on every keystroke — the parent
 * only ever sees committed numbers via onChange, so existing number-typed
 * form state doesn't need to change shape at the call site.
 */
export default function NumericInput({
  value, onChange, mode = 'decimal', min, className, id, placeholder, disabled, required,
  'aria-label': ariaLabel,
}: Props) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    // Skip re-syncing the visible text if it already represents the same
    // number the parent just sent back down — without this guard, typing
    // "12." would parse to 12, the parent stores 12, and the next render
    // would snap the field back to "12", deleting the "." just typed.
    setDraft((prev) => (prev !== '' && Number(prev) === value ? prev : String(value)))
  }, [value])

  function handleChange(raw: string) {
    const pattern = mode === 'integer' ? INTEGER_PATTERN : DECIMAL_PATTERN
    if (!pattern.test(raw)) return
    setDraft(raw)
    if (raw === '' || raw === '.') { onChange(0); return }
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    onChange(min != null ? Math.max(parsed, min) : parsed)
  }

  return (
    <input
      id={id}
      type="text"
      inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
      value={draft}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      className={className}
    />
  )
}
