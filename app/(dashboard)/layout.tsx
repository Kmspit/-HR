import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/Sidebar'
import MobileNav from '@/components/dashboard/MobileNav'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import DeviceBinder from '@/components/dashboard/DeviceBinder'
import { prisma } from '@/lib/prisma'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await ensureDbSchema()
  const session = await auth()

  if (!session?.user) redirect('/')
  if (session.user.status !== 'ACTIVE') redirect(`/?status=${session.user.status.toLowerCase()}`)

  const user = {
    name:       session.user.name ?? '',
    email:      session.user.email ?? '',
    role:       session.user.role,
    department: session.user.department,
  }

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  })

  return (
    <div className="dashboard-shell flex min-h-[100dvh] dark:bg-[#070b14] light:bg-slate-50">
      <DeviceBinder />
      {/* Desktop sidebar */}
      <div className="dashboard-sidebar-slot hidden md:flex md:w-56 md:flex-shrink-0">
        <Sidebar user={user} />
      </div>

      {/* Main content */}
      <div className="dashboard-main flex flex-1 flex-col min-w-0 overflow-hidden">
        <DashboardHeader user={user} unreadCount={unreadCount} />
        <main className="dashboard-main-scroll flex-1 overflow-y-auto overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          <div className="page-enter">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav role={user.role} />
    </div>
  )
}
