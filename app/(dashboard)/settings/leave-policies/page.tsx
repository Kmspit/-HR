import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/rbac'
import type { Role } from '@prisma/client'
import Topbar from '@/components/dashboard/Topbar'
import LeavePolicyManager from '@/components/leave/LeavePolicyManager'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export default async function LeavePoliciesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canManageUsers(session.user.role as Role)) redirect('/dashboard')

  await ensureDbSchema().catch(() => {})

  const [policies, settings] = await Promise.all([
    prisma.leavePolicy.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    prisma.companySettings.findUnique({
      where: { id: 'singleton' },
      select: { sickDaysYear: true, vacationDaysYear: true, personalDaysYear: true, probationMonths: true },
    }),
  ])

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <Topbar
        title="นโยบายวันลา"
        subtitle="กำหนดวันลาตาม Role / ตำแหน่ง + ช่วงทดลองงาน"
      />
      <div className="flex-1 p-4 md:p-6 w-full space-y-6">
        <LeavePolicyManager
          initialPolicies={JSON.parse(JSON.stringify(policies))}
          defaults={{
            sickDays:       settings?.sickDaysYear     ?? 30,
            vacationDays:   settings?.vacationDaysYear ?? 6,
            personalDays:   settings?.personalDaysYear ?? 3,
            probationMonths: settings?.probationMonths ?? 3,
          }}
        />
      </div>
    </div>
  )
}
