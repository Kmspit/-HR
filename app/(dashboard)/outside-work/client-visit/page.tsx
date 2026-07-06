import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, ChevronRight } from 'lucide-react'
import Topbar from '@/components/dashboard/Topbar'
import { canAccessPage } from '@/lib/page-access'

export default async function OutsideWorkClientVisitSelectPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!canAccessPage(session.user.role, '/outside-work/client-visit')) redirect('/unauthorized')

  const companies = await prisma.clientCompany.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, companyName: true, clientCode: true },
    orderBy: { companyName: 'asc' },
  }).catch(() => [])

  return (
    <div className="flex flex-col">
      <Topbar
        title="ออกนอกสถานที่ (บริษัทลูกค้า)"
        subtitle="เลือกบริษัทลูกค้าเพื่อกรอกรายการออกนอกสถานที่"
      />
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        {companies.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-white/40">
            ยังไม่มีบริษัทลูกค้า (status: ACTIVE) ในระบบ — ติดต่อ HR/Admin เพื่อเพิ่มข้อมูลใน CRM
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/outside-work/client-visit/${c.id}`}
              className="flex items-center justify-between gap-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 hover:border-green-500 hover:shadow-sm transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 shrink-0">
                  <Building2 className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{c.companyName}</p>
                  <p className="text-xs text-slate-400 dark:text-white/40 font-mono">{c.clientCode}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 dark:text-white/30 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
