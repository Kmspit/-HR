import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/Sidebar'
import MobileNav from '@/components/dashboard/MobileNav'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import DeviceBinder from '@/components/dashboard/DeviceBinder'
import { prisma } from '@/lib/prisma'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import { hasOrgAssignment, needsOrgAssignment } from '@/lib/user-org'
import OrgSetupBanner from '@/components/dashboard/OrgSetupBanner'
import DashboardMotionShell from '@/components/motion/DashboardMotionShell'
import FloatingQuickActions from '@/components/dashboard/FloatingQuickActions'
import { NotificationStreamProvider } from '@/components/notification-center/NotificationStreamProvider'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    await ensureDbSchema()
  } catch (err) {
    console.error('[DashboardLayout] ensureDbSchema', err)
  }
  const session = await auth()

  if (!session?.user) redirect('/login')
  if (session.user.status !== 'ACTIVE') redirect(`/?status=${session.user.status.toLowerCase()}`)

  let needsOrgSetup = false
  if (needsOrgAssignment(session.user.role)) {
    const orgUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { divisionId: true, departmentId: true, sectionId: true },
    })
    needsOrgSetup = !hasOrgAssignment(orgUser ?? {})
  }

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
    <NotificationStreamProvider>
    <div className="dashboard-shell flex h-[100dvh] bg-[#F7F9FC] dark:bg-[#070b14]">
      <DeviceBinder />
      {/* Sidebar — always in DOM so fixed mobile drawer can render; aside hides itself on mobile */}
      <Sidebar user={user} />

      {/* Main content */}
      <div className="dashboard-main flex flex-1 flex-col min-h-0 min-w-0 md:overflow-hidden">
        <DashboardHeader user={user} unreadCount={unreadCount} />
        <main className="dashboard-main-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          <DashboardMotionShell>
            {needsOrgSetup && <OrgSetupBanner />}
            {children}
          </DashboardMotionShell>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav role={user.role} />
      <FloatingQuickActions role={user.role} />
    </div>
    </NotificationStreamProvider>
  )
}
