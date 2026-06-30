import type { PrismaClient } from '@prisma/client'

const WEEKLY_CHAIN_ID = 'weekly-plan-default-chain-v1'

/** Idempotent — หัวหน้า → MANAGER_HR → ADMIN (matches legacy 2-step + org supervisor) */
export async function seedDefaultWeeklyPlanChain(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.approvalChainConfig.findFirst({
    where: { entityType: 'WEEKLY_PLAN', isDefault: true },
    select: { id: true },
  })
  if (existing) return

  const byId = await prisma.approvalChainConfig.findUnique({
    where: { id: WEEKLY_CHAIN_ID },
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
      id:          WEEKLY_CHAIN_ID,
      name:        'Weekly Plan — หัวหน้า → HR → ผู้บริหาร',
      description: 'หัวหน้า (org) → MANAGER_HR → ADMIN',
      entityType:  'WEEKLY_PLAN',
      isActive:    true,
      isDefault:   true,
      createdById: admin.id,
      steps: {
        create: [
          { stepOrder: 1, stepName: 'หัวหน้า', approverRole: null, approverId: null, canSkip: true },
          { stepOrder: 2, stepName: 'หัวหน้างาน (HR)', approverRole: 'MANAGER_HR', approverId: null, canSkip: false },
          { stepOrder: 3, stepName: 'ผู้บริหาร', approverRole: 'ADMIN', approverId: null, canSkip: false },
        ],
      },
    },
  })
}
