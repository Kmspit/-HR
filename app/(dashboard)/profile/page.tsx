import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import ProfileClient from './ProfileClient'
import { splitDisplayName } from '@/lib/profile-name'
import { ROLE_LABELS } from '@/lib/permissions'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      employeeId: true,
      name: true,
      prefix: true,
      nickname: true,
      phone: true,
      birthDate: true,
      address: true,
      nationalId: true,
      profileImage: true,
      role: true,
      status: true,
      department: true,
      position: true,
      baseSalary: true,
      startDate: true,
      socialSecurity: true,
      lineId: true,
      createdAt: true,
      branchId: true,
    },
  })

  if (!user) redirect('/dashboard')

  let branchName = '—'
  if (user.branchId) {
    try {
      const branch = await prisma.companyBranch.findUnique({
        where: { id: user.branchId },
        select: { name: true, code: true },
      })
      if (branch) branchName = `${branch.name} (${branch.code})`
    } catch {
      branchName = '—'
    }
  }

  const { prefix, firstName, lastName } = splitDisplayName(user.name, user.prefix)

  return (
    <div className="flex flex-col">
      <Topbar title="โปรไฟล์ของฉัน" subtitle="แก้ไขข้อมูลส่วนตัวและดูประวัติตอนสมัคร" />
      <ProfileClient
        initial={{
          prefix,
          firstName,
          lastName,
          nickname: user.nickname ?? '',
          phone: user.phone ?? '',
          address: user.address ?? '',
          profileImage: user.profileImage,
          email: user.email,
          employeeId: user.employeeId ?? '',
          birthDate: user.birthDate?.toISOString().slice(0, 10) ?? '',
          nationalId: user.nationalId ?? '',
          roleLabel: ROLE_LABELS[user.role],
          branchName,
          status: user.status,
          department: user.department ?? '',
          position: user.position ?? '',
          baseSalary: user.baseSalary,
          startDate: user.startDate?.toISOString().slice(0, 10) ?? '',
          socialSecurity: user.socialSecurity,
          lineId: user.lineId ?? '',
          createdAt: user.createdAt.toISOString(),
        }}
      />
    </div>
  )
}
