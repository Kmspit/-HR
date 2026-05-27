import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import WarningsClient from './WarningsClient'

export default async function WarningsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

  type WarningRow = Awaited<
    ReturnType<
      typeof prisma.warning.findMany<{
        include: { user: { select: { name: true; employeeId: true; department: true } } }
      }>
    >
  >
  type EmployeeRow = {
    id: string
    name: string
    department: string | null
    employeeId: string | null
    _count: { warnings: number }
  }

  let warnings: WarningRow
  let employees: EmployeeRow[]

  try {
    ;[warnings, employees] = await Promise.all([
      prisma.warning.findMany({
        where: isManager ? {} : { userId: session.user.id },
        include: {
          user: { select: { name: true, employeeId: true, department: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      isManager
        ? prisma.user.findMany({
            where: {
              status: 'ACTIVE',
              role: { in: ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] },
            },
            select: {
              id: true,
              name: true,
              department: true,
              employeeId: true,
              _count: { select: { warnings: true } },
            },
            orderBy: { name: 'asc' },
          })
        : [],
    ])
  } catch (err) {
    console.error('[warnings-page]', err)
    return (
      <div className="flex flex-col">
        <Topbar title="ใบเตือน" subtitle="ไม่สามารถโหลดข้อมูลได้ชั่วคราว" />
        <div className="p-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
            <p className="font-medium">เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล</p>
            <p className="mt-2 text-sm text-red-200/80">
              กรุณารีเฟรชหน้านี้อีกครั้ง หากยังเข้าไม่ได้ แจ้งผู้ดูแลระบบให้รัน{' '}
              <code className="text-xs">npm run db:migrate:turso</code>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Topbar
        title="ใบเตือน"
        subtitle={
          isManager
            ? 'ออกใบเตือน · แนบ PDF · ส่งให้พนักงาน'
            : 'ประวัติใบเตือนของตัวเอง'
        }
      />
      <WarningsClient
      isManager={isManager}
      warnings={warnings.map((w) => ({
        id: w.id,
        userId: w.userId,
        userName: w.user.name,
        userDept: w.user.department ?? '',
        employeeId: w.user.employeeId ?? '',
        reason: w.reason,
        description: w.description ?? '',
        fileUrl: w.fileUrl ?? null,
        sentToLine: w.sentToLine,
        isAuto: w.isAuto,
        createdAt: w.createdAt.toISOString(),
      }))}
      employees={employees.map((e) => ({
        id: e.id,
        name: e.name,
        department: e.department ?? '',
        employeeId: e.employeeId ?? '',
        warningCount: e._count.warnings,
      }))}
    />
    </div>
  )
}
