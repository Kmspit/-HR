'use client'



import dynamic from 'next/dynamic'

import { PageTransition } from '@/components/motion'



const SuccessAnimationProvider = dynamic(

  () => import('./SuccessAnimation').then((m) => m.SuccessAnimationProvider),

  { ssr: false },

)



export default function DashboardMotionShell({ children }: { children: React.ReactNode }) {

  return (

    <SuccessAnimationProvider>

      <PageTransition>{children}</PageTransition>

    </SuccessAnimationProvider>

  )

}

