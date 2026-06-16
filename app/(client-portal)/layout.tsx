import type { ReactNode } from 'react'
import AiFloatingButton from '@/components/AiFloatingButton'

export const metadata = { title: 'KM Service Plus — Client Portal' }

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 font-sans">
      {children}
      <AiFloatingButton isClientPortal />
    </div>
  )
}
