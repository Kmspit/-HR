import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { HR_ADMIN } from '@/lib/module-gates'
import Topbar from '@/components/dashboard/Topbar'
import AttendanceImportClient from '@/components/attendance/AttendanceImportClient'
import type { Role } from '@prisma/client'

export const metadata = { title: 'นำเข้าข้อมูลลงเวลาจาก Excel' }

export default async function AttendanceImportPage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  if (!HR_ADMIN.includes(session.user.role as Role)) redirect('/unauthorized')

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="นำเข้าข้อมูลลงเวลาจาก Excel"
        subtitle="สำหรับข้อมูลลงเวลาย้อนหลังที่ไม่มีในระบบเท่านั้น"
      />
      <div className="min-w-0 flex-1">
        <AttendanceImportClient />
      </div>
    </div>
  )
}
