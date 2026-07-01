'use client'

import { PageTransition, SuccessAnimationProvider } from '@/components/motion'

export default function DashboardMotionShell({ children }: { children: React.ReactNode }) {
  return (
    <SuccessAnimationProvider>
      <PageTransition>{children}</PageTransition>
    </SuccessAnimationProvider>
  )
}
