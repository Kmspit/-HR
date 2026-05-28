import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { hasOrgAssignment, needsOrgAssignment } from '@/lib/user-org'
import { Building2, Clock } from 'lucide-react'
import Link from 'next/link'

export default async function OrgPendingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  if (!needsOrgAssignment(session.user.role)) redirect('/dashboard')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      divisionId: true,
      departmentId: true,
      sectionId: true,
      branch: { select: { name: true } },
    },
  })

  if (user && hasOrgAssignment(user)) redirect('/dashboard')

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
          <Clock className="h-7 w-7 text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-white">เข้าสู่ระบบแล้ว — รอ HR กำหนดฝ่าย / แผนก</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          รหัสผ่านถูกต้องและบัญชีเปิดใช้งานแล้ว แต่ยังไม่ได้รับการกำหนดฝ่ายและแผนก
          จึงยังเข้าหน้าหลักไม่ได้ชั่วคราว
          {user?.branch ? ` (สาขา: ${user.branch.name})` : ''}
          <br />
          กรุณาติดต่อ HR/Admin เพื่อกำหนดฝ่ายและแผนกก่อนเข้าใช้งานระบบ (ส่วนงานไม่บังคับ)
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href="/profile"
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5"
          >
            ดูโปรไฟล์ของฉัน
          </Link>
          <p className="text-[10px] text-slate-600 flex items-center justify-center gap-1">
            <Building2 className="w-3 h-3" /> เค เอ็ม เซอร์วิสพลัส จำกัด
          </p>
        </div>
      </div>
    </div>
  )
}
