'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Spinner from '@/components/ui/Spinner'

type LoadingState = {
  show: boolean
  message: string
}

type LoadingContextValue = {
  showLoading: (message?: string) => void
  hideLoading: () => void
}

const LoadingContext = createContext<LoadingContextValue | null>(null)

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LoadingState>({ show: false, message: 'กำลังโหลด...' })
  const pathname = usePathname()

  const showLoading = useCallback((message = 'กำลังโหลด...') => {
    setState({ show: true, message })
  }, [])

  const hideLoading = useCallback(() => {
    setState({ show: false, message: 'กำลังโหลด...' })
  }, [])

  // Auto-hide overlay when route changes (prevents stuck loading after login/nav)
  useEffect(() => {
    hideLoading()
  }, [pathname, hideLoading])

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading }}>
      {children}
      {state.show && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center
            bg-black/40 backdrop-blur-[2px] animate-fade-in-slow"
          role="status"
          aria-live="polite"
          aria-label={state.message}
        >
          <div
            className="flex flex-col items-center gap-3 rounded-2xl px-8 py-6 shadow-2xl
              dark:bg-[#0d1424]/95 dark:border dark:border-white/10
              light:bg-white/95 light:border light:border-slate-200
              animate-fade-in"
          >
            <Spinner size="lg" />
            <p className="text-sm font-medium dark:text-slate-200 light:text-slate-700">{state.message}</p>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  const ctx = useContext(LoadingContext)
  if (!ctx) throw new Error('useLoading must be used within LoadingProvider')
  return ctx
}
