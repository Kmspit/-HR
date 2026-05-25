import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/Sidebar'
import MobileNav from '@/components/dashboard/MobileNav'
import DashboardHeader from '@/components/dashboard/DashboardHeader'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/')
  if (session.user.status !== 'ACTIVE') redirect(`/?status=${session.user.status.toLowerCase()}`)

  const user = {
    name:       session.user.name ?? '',
    email:      session.user.email ?? '',
    role:       session.user.role,
    department: session.user.department,
  }

  return (
    <div className="flex min-h-[100dvh] dark:bg-[#070b14] light:bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-56 md:flex-shrink-0">
        <Sidebar user={user} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <DashboardHeader user={user} />
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 68px)' }}
        >
          <div className="md:pb-0">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav role={user.role} />
    </div>
  )
}
