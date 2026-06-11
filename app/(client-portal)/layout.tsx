import type { ReactNode } from 'react'

export const metadata = { title: 'KM Service Plus — Client Portal' }

export default function ClientPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 font-sans">
      {children}
    </div>
  )
}
