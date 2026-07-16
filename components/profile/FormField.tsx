'use client'

import { useId, isValidElement, cloneElement } from 'react'

type Props = {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}

export default function FormField({ label, required, error, hint, children, className = '' }: Props) {
  const inputId = useId()
  // Every call site passes a single input/select/textarea as children — clone
  // it to inject the id the label points to, rather than requiring every
  // caller to thread an id through themselves.
  const field = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ id?: string }>, { id: inputId })
    : children

  return (
    <div className={className}>
      <label htmlFor={inputId} className="text-xs text-white/50 block mb-1">
        {label}
        {required ? <span className="text-red-400/90 ml-0.5">*</span> : null}
      </label>
      {field}
      {error ? <p className="text-xs text-red-400 mt-1">{error}</p> : null}
      {!error && hint ? <p className="text-[11px] text-slate-500 mt-1">{hint}</p> : null}
    </div>
  )
}
