import type { PrismaClient } from '@prisma/client'

const LEAVE_CHAIN_ID = 'leave-default-chain-v1'

/** Idempotent seed — default Leave chain: หัวหน้า (org) → HR → CEO */
export async function seedDefaultLeaveChain(prisma: PrismaClient): Promise<void> {
  const existingDefault = await prisma.approvalChainConfig.findFirst({
    where: { entityType: 'LEAVE', isDefault: true },
    select: { id: true },
  })
  if (existingDefault) return

  const existing = await prisma.approvalChainConfig.findUnique({
    where: { id: LEAVE_CHAIN_ID },
    select: { id: true },
  })
  if (existing) return

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'CEO', 'ADMIN', 'HR'] }, status: 'ACTIVE' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) return

  await prisma.approvalChainConfig.create({
    data: {
      id:          LEAVE_CHAIN_ID,
      name:        'Leave — หัวหน้า → HR → CEO',
      description: 'หัวหน้า (teamLeader/manager ของผู้ขอ) → HR → CEO',
      entityType:  'LEAVE',
      isActive:    true,
      isDefault:   true,
      createdById: admin.id,
      steps: {
        create: [
          {
            stepOrder:    1,
            stepName:     'หัวหน้า',
            approverRole: null,
            approverId:   null,
            canSkip:      true,
          },
          {
            stepOrder:    2,
            stepName:     'HR อนุมัติ',
            approverRole: 'HR',
            approverId:   null,
            canSkip:      false,
          },
          {
            stepOrder:    3,
            stepName:     'CEO อนุมัติ',
            approverRole: 'CEO',
            approverId:   null,
            canSkip:      false,
          },
        ],
      },
    },
  })
}
