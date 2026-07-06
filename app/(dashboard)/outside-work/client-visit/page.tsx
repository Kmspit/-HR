import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import { canAccessPage } from '@/lib/page-access'
import ClientVisitForm from './ClientVisitForm'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day  = date.getDay()
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

export default async function OutsideWorkClientVisitPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!canAccessPage(session.user.role, '/outside-work/client-visit')) redirect('/unauthorized')

  const weekStart = getMonday(new Date())
  const weekEnd   = addDays(weekStart, 7)

  const rows = await prisma.outsideWorkRequest.findMany({
    where: {
      userId: session.user.id,
      clientCompanyId: { not: null },
      date: { gte: weekStart, lt: weekEnd },
      deletedAt: null,
    },
    select: {
      id: true, date: true, timeSlot: true, place: true, purpose: true,
      caseNumber: true, productCategory: true, productType: true, caseCount: true,
      status: true, approvalStatus: true, documentNumber: true,
      clientCompanyId: true,
      clientCompany: { select: { companyName: true } },
    },
    orderBy: { date: 'desc' },
  }).catch(() => [])

  const items = rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    timeSlot: r.timeSlot,
    place: r.place,
    purpose: r.purpose,
    caseNumber: r.caseNumber,
    productCategory: r.productCategory,
    productType: r.productType,
    caseCount: r.caseCount,
    status: r.status,
    approvalStatus: r.approvalStatus,
    documentNumber: r.documentNumber,
    clientCompanyId: r.clientCompanyId,
    clientCompanyName: r.clientCompany?.companyName ?? null,
  }))

  return (
    <div className="flex flex-col">
      <Topbar
        title="ออกนอกสถานที่ (บริษัทลูกค้า)"
        subtitle="กรอกทีละรายการ — บังคับเลือกบริษัทลูกค้าจาก CRM ทุกครั้ง"
      />
      <ClientVisitForm initialItems={items} />
    </div>
  )
}
