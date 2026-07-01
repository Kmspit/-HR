'use client'

import { createContext, useCallback, useContext, useState, useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { springSnappy } from '@/lib/motion-presets'

export type SuccessVariant = 'checkin' | 'leave' | 'approval'

type Burst = { id: number; variant: SuccessVariant }

const LABELS: Record<SuccessVariant, string> = {
  checkin: 'ลงเวลาสำเร็จ',
  leave: 'ส่งคำขอแล้ว',
  approval: 'อนุมัติแล้ว',
}

const COLORS: Record<SuccessVariant, string> = {
  checkin: 'from-blue-500 to-cyan-500',
  leave: 'from-violet-500 to-purple-500',
  approval: 'from-emerald-500 to-green-500',
}

const SuccessContext = createContext<(variant?: SuccessVariant) => void>(() => {})

export function useSuccessAnimation() {
  return useContext(SuccessContext)
}

export function SuccessAnimationProvider({ children }: { children: React.ReactNode }) {
  const [burst, setBurst] = useState<Burst | null>(null)
  const reduced = useReducedMotion()

  const triggerSuccess = useCallback((variant: SuccessVariant = 'approval') => {
    if (reduced) return
    setBurst({ id: Date.now(), variant })
  }, [reduced])

  useEffect(() => {
    if (!burst) return
    const t = window.setTimeout(() => setBurst(null), 1100)
    return () => window.clearTimeout(t)
  }, [burst])

  return (
    <SuccessContext.Provider value={triggerSuccess}>
      {children}
      <AnimatePresence mode="wait">
        {burst && (
          <motion.div
            key={burst.id}
            className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={springSnappy}
              className="flex flex-col items-center gap-3"
            >
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br shadow-lg ${COLORS[burst.variant]}`}
                style={{ boxShadow: '0 12px 40px rgba(16, 185, 129, 0.35)' }}
              >
                <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
              </div>
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06, duration: 0.15 }}
                className="text-[15px] font-semibold text-slate-800 dark:text-white drop-shadow-sm"
              >
                {LABELS[burst.variant]}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </SuccessContext.Provider>
  )
}
