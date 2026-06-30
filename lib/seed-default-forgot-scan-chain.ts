import type { PrismaClient } from '@prisma/client'

const FORGOT_SCAN_CHAIN_ID = 'forgot-scan-default-chain-v1'

/** Idempotent — หัวหน้า (org) → HR (matches legacy 2-step) */
export async function seedDefaultForgotScanChain(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.approvalChainConfig.findFirst({
    where: { entityType: 'FORGOT_SCAN', isDefault: true },
    select: { id: true },
  })
  if (existing) return

  const byId = await prisma.approvalChainConfig.findUnique({
    where: { id: FORGOT_SCAN_CHAIN_ID },
    select: { id: true },
  })
  if (byId) return

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'CEO', 'ADMIN', 'HR'] }, status: 'ACTIVE' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) return

  await prisma.approvalChainConfig.create({
    data: {
      id:          FORGOT_SCAN_CHAIN_ID,
      name:        'Forgot Scan — หัวหน้า → HR',
      description: 'หัวหน้า (org) → HR อนุมัติขั้นสุดท้าย',
      entityType:  'FORGOT_SCAN',
      isActive:    true,
      isDefault:   true,
      createdById: admin.id,
      steps: {
        create: [
          { stepOrder: 1, stepName: 'หัวหน้า', approverRole: null, approverId: null, canSkip: true },
          { stepOrder: 2, stepName: 'HR อนุมัติ', approverRole: 'HR', approverId: null, canSkip: false },
        ],
      },
    },
  })
}
