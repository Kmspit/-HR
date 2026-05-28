'use client'

type Props = {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}

export default function FormField({ label, required, error, hint, children, className = '' }: Props) {
  return (
    <div className={className}>
      <label className="text-xs text-white/50 block mb-1">
        {label}
        {required ? <span className="text-red-400/90 ml-0.5">*</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-red-400 mt-1">{error}</p> : null}
      {!error && hint ? <p className="text-[11px] text-slate-500 mt-1">{hint}</p> : null}
    </div>
  )
}
