import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import HolidaysClient from './HolidaysClient'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export default async function HolidaysPage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) redirect('/unauthorized')

  await ensureDbSchema()

  const [holidays, branches] = await Promise.all([
    prisma.companyHoliday.findMany({
      orderBy: [{ holidayDate: 'asc' }, { holidayName: 'asc' }],
      include: { branch: { select: { id: true, name: true, code: true } } },
    }),
    prisma.companyBranch.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, code: true },
    }),
  ])

  return (
    <div className="flex flex-col">
      <Topbar
        title="จัดการวันหยุด"
        subtitle="วันเสาร์-อาทิตย์ วันหยุดนักขัตฤกษ์ และวันหยุดบริษัท — แยกตามสาขา"
      />
      <HolidaysClient
        initialHolidays={holidays.map((h) => ({
          id: h.id,
          holidayName: h.holidayName,
          holidayDate: h.holidayDate.toISOString().slice(0, 10),
          holidayType: h.holidayType,
          repeatEveryYear: h.repeatEveryYear,
          branchId: h.branchId,
          branchLabel: h.branch
            ? `${h.branch.name} (${h.branch.code})`
            : 'ทุกสาขา',
        }))}
        branches={branches.map((b) => ({
          id: b.id,
          label: `${b.name} (${b.code})`,
        }))}
      />
    </div>
  )
}
