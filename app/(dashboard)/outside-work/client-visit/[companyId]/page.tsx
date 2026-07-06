import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import { canAccessPage } from '@/lib/page-access'
import ClientVisitCompanyForm from './ClientVisitCompanyForm'

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

export default async function OutsideWorkClientVisitCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!canAccessPage(session.user.role, '/outside-work/client-visit')) redirect('/unauthorized')

  const { companyId } = await params
  const company = await prisma.clientCompany.findUnique({
    where: { id: companyId, status: 'ACTIVE' },
    select: { id: true, companyName: true },
  })
  if (!company) notFound()

  const weekStart = getMonday(new Date())
  const weekEnd   = addDays(weekStart, 7)

  const rows = await prisma.outsideWorkRequest.findMany({
    where: {
      userId: session.user.id,
      clientCompanyId: company.id,
      date: { gte: weekStart, lt: weekEnd },
      deletedAt: null,
    },
    select: {
      id: true, date: true, timeSlot: true, place: true, purpose: true,
      caseNumber: true, productCategory: true, productType: true, caseCount: true,
      status: true, approvalStatus: true, documentNumber: true,
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
  }))

  return (
    <div className="flex flex-col">
      <Topbar
        title={`ออกนอกสถานที่ — ${company.companyName}`}
        subtitle="กรอกทีละรายการสำหรับบริษัทลูกค้านี้"
        breadcrumb={[
          { label: 'เลือกบริษัทลูกค้า', href: '/outside-work/client-visit' },
          { label: company.companyName },
        ]}
      />
      <ClientVisitCompanyForm
        companyId={company.id}
        companyName={company.companyName}
        initialItems={items}
      />
    </div>
  )
}
