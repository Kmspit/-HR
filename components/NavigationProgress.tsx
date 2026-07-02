'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const start = useCallback(() => {
    clearTimers()
    setVisible(true)
    setProgress(12)
    timers.current.push(setTimeout(() => setProgress(45), 80))
    timers.current.push(setTimeout(() => setProgress(72), 220))
    timers.current.push(setTimeout(() => setProgress(88), 480))
  }, [clearTimers])

  const finish = useCallback(() => {
    clearTimers()
    setProgress(100)
    timers.current.push(
      setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 280),
    )
  }, [clearTimers])

  // Complete when route changes
  useEffect(() => {
    finish()
  }, [pathname, searchParams, finish])

  // Start on internal link click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (href.startsWith('http') && !href.startsWith(window.location.origin)) return

      const url = new URL(href, window.location.origin)
      const next = url.pathname + url.search
      const current = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
      if (next === current) return

      start()
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [pathname, searchParams, start])

  if (!visible && progress === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[90] h-[3px] pointer-events-none" aria-hidden>
      <div
        className="h-full rounded-r-full transition-[width,opacity] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          background: 'linear-gradient(90deg, #22c55e, #6366f1, #06b6d4)',
          boxShadow: '0 0 12px rgba(99,102,241,0.6)',
        }}
      />
    </div>
  )
}
