import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Topbar from '@/components/dashboard/Topbar'
import WarningDetailClient from './WarningDetailClient'
import { canApproveWarning, canManageUsers } from '@/lib/rbac'
import { ensureDbSchema } from '@/lib/ensure-db-schema'
import type { Role } from '@prisma/client'

export default async function WarningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  await ensureDbSchema().catch(() => {})

  const { id } = await params

  const warning = await prisma.warning.findUnique({
    where: { id },
    include: {
      user:       { select: { id: true, name: true, employeeId: true, department: true, position: true } },
      issuedBy:   { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
    },
  })

  if (!warning) notFound()

  const role = session.user.role as Role
  const isHR = canManageUsers(role)
  const canApprove = canApproveWarning(role)

  const canSee =
    warning.userId === session.user.id || isHR || canApprove

  if (!canSee) redirect('/warnings')

  // Employee can only see APPROVED
  if (
    warning.userId === session.user.id &&
    !isHR && !canApprove &&
    warning.status !== 'APPROVED'
  ) {
    notFound()
  }

  return (
    <div className="flex flex-col">
      <Topbar
        title="รายละเอียดใบเตือน"
        subtitle={warning.isAuto ? 'ใบเตือนอัตโนมัติ' : 'ใบเตือนโดย HR'}
      />
      <WarningDetailClient
        warning={JSON.parse(JSON.stringify(warning))}
        canApprove={canApprove}
        isHR={isHR}
        currentUserId={session.user.id}
      />
    </div>
  )
}
