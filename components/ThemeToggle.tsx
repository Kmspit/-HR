'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div
        className="h-8.5 w-8.5 rounded-xl border dark:border-white/8 dark:bg-white/[0.03] light:border-slate-200 light:bg-white"
        aria-hidden
      />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`
        relative flex h-8.5 w-8.5 items-center justify-center rounded-xl border transition-all duration-200
        focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2
        dark:focus-visible:ring-offset-slate-900 light:focus-visible:ring-offset-white
        ${isDark
          ? 'border-white/8 bg-white/[0.03] text-slate-400 hover:border-white/15 hover:text-yellow-300'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-blue-600 shadow-sm'
        }
      `}
      title={isDark ? 'เปลี่ยนเป็นโหมดกลางวัน' : 'เปลี่ยนเป็นโหมดกลางคืน'}
      aria-label={isDark ? 'เปลี่ยนเป็นโหมดกลางวัน' : 'เปลี่ยนเป็นโหมดกลางคืน'}
      aria-pressed={isDark}
    >
      {isDark ? (
        /* Sun icon */
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        /* Moon icon */
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  )
}
