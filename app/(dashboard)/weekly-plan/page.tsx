import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Topbar from '@/components/dashboard/Topbar'
import WeeklyPlanPanel from '@/components/dashboard/WeeklyPlanPanel'

export default async function WeeklyPlanPage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (session.user.role !== 'LAWYER' && session.user.role !== 'MANAGER_HR') redirect('/dashboard')

  const plans = await prisma.weeklyLawyerPlan.findMany({
    where: session.user.role === 'LAWYER' ? { lawyerId: session.user.id } : {},
    include: { days: { orderBy: { dayOfWeek: 'asc' } }, lawyer: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Calculate next week
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + daysUntilMonday)
  nextMonday.setHours(0, 0, 0, 0)
  const nextSunday = new Date(nextMonday)
  nextSunday.setDate(nextMonday.getDate() + 6)

  // Deadline = this Sunday at 23:59
  const deadline = new Date(now)
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
  deadline.setDate(now.getDate() + daysUntilSunday)
  deadline.setHours(23, 59, 59, 0)

  const user = { name: session.user.name ?? '', email: session.user.email ?? '', role: session.user.role, department: session.user.department }

  return (
    <div className="flex flex-col">
      <Topbar
        title="แผนงานออกนอกสถานที่"
        subtitle={`ส่งก่อนวันอาทิตย์ · กำหนด: ${deadline.toLocaleDateString('th-TH')}`}
        user={user}
      />
      <WeeklyPlanPanel
        plans={JSON.parse(JSON.stringify(plans))}
        nextWeek={{ start: nextMonday.toISOString(), end: nextSunday.toISOString() }}
        deadline={deadline.toISOString()}
        isLawyer={session.user.role === 'LAWYER'}
      />
    </div>
  )
}
