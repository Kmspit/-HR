import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ROLE_DEFAULT_ROUTE } from '@/lib/permissions'
import { hasOrgAssignment, needsOrgAssignment } from '@/lib/user-org'

/** ปลายทางหลังล็อกอินสำเร็จ (ตาม role + สถานะ org) */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ path: '/login' })
  }

  const { role, status } = session.user

  if (status === 'PENDING') {
    return NextResponse.json({
      path: '/',
      message: 'บัญชีของคุณรอการอนุมัติจาก HR',
    })
  }
  if (status === 'DISABLED') {
    return NextResponse.json({
      path: '/?status=disabled',
      message: 'บัญชีนี้ถูกระงับการใช้งาน',
    })
  }
  if (status === 'REJECTED') {
    return NextResponse.json({
      path: '/?status=rejected',
      message: 'คำขอสมัครถูกปฏิเสธ',
    })
  }

  if (needsOrgAssignment(role)) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { divisionId: true, departmentId: true, sectionId: true },
    })
    if (!hasOrgAssignment(user ?? {})) {
      return NextResponse.json({
        path: '/org-pending',
        message:
          'เข้าสู่ระบบสำเร็จ — รอ HR กำหนดฝ่าย/แผนก/ส่วนงานก่อนใช้งานหน้าหลัก',
      })
    }
  }

  return NextResponse.json({
    path: ROLE_DEFAULT_ROUTE[role] ?? '/dashboard',
    message: null,
  })
}
