import type { PrismaClient, Role } from '@prisma/client'
import { HR_ADMIN } from '@/lib/module-gates'
import { canApproverActOnRequester, isCompanyWideApprover } from '@/lib/org-scope'

export type ApprovalRequestAccessShape = {
  requestedById: string
  steps: Array<{
    id: string
    stepOrder: number
    status: string
    approverId: string | null
    approverRole: string | null
  }>
}

export async function canViewApprovalRequest(
  prisma: PrismaClient,
  viewerId: string,
  viewerRole: Role,
  request: ApprovalRequestAccessShape,
): Promise<boolean> {
  if (request.requestedById === viewerId) return true
  if (HR_ADMIN.includes(viewerRole) || isCompanyWideApprover(viewerRole)) return true

  for (const step of request.steps) {
    if (step.approverId === viewerId) return true
    if (step.approverRole === viewerRole) {
      const ok = await canApproverActOnRequester(
        prisma,
        viewerId,
        viewerRole,
        request.requestedById,
      )
      if (ok) return true
    }
  }
  return false
}

export async function canActOnApprovalStep(
  prisma: PrismaClient,
  viewerId: string,
  viewerRole: Role,
  request: ApprovalRequestAccessShape,
  activeStep: ApprovalRequestAccessShape['steps'][number],
): Promise<boolean> {
  if (['SUPER_ADMIN', 'CEO'].includes(viewerRole)) return true
  if (activeStep.approverId === viewerId || activeStep.approverRole === viewerRole) {
    return canApproverActOnRequester(
      prisma,
      viewerId,
      viewerRole,
      request.requestedById,
    )
  }
  return false
}
