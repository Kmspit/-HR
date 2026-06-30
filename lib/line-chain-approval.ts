/**
 * LINE postback → approval chain executors (leave / outside / forgot-scan).
 */
import type { PrismaClient, Role } from '@prisma/client'
import { executeLeaveStepAction, executeOutsideWorkStepAction } from '@/lib/approval-chain'
import { executeForgotScanStepAction } from '@/lib/forgot-scan-chain'

export const LINE_WEBHOOK_IP = 'line-webhook'

export const LINE_NOT_YOUR_TURN_MSG = 'ไม่ใช่คิวของคุณในการอนุมัติขั้นนี้'

export const LINE_USE_APP_MSG = 'กรุณาอนุมัติที่ศูนย์อนุมัติในแอป /approvals'

export type LineChainDocType = 'LEAVE' | 'OUTSIDE' | 'FORGOT_SCAN'

const DOC_LABEL: Record<LineChainDocType, string> = {
  LEAVE:       'คำขอลา',
  OUTSIDE:     'คำขอปฏิบัติงานนอก',
  FORGOT_SCAN: 'คำขอแก้ไขเวลา',
}

export function formatLineChainActionError(result: { error: string; status: number }): string {
  if (result.status === 403) return LINE_NOT_YOUR_TURN_MSG
  if (
    result.error === 'USE_LEGACY_APPROVAL' ||
    result.error === 'NO_CHAIN' ||
    result.status === 409
  ) {
    return LINE_USE_APP_MSG
  }
  return result.error
}

export type LineChainApprovalResult =
  | { ok: true; stepName: string; finalized: boolean; docLabel: string }
  | { ok: false; message: string }

export async function runLineChainApproval(
  prisma: PrismaClient,
  docType: LineChainDocType,
  requestId: string,
  actorId: string,
  role: Role,
  action: 'APPROVE' | 'REJECT',
): Promise<LineChainApprovalResult> {
  if (docType === 'LEAVE') {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: requestId } })
    if (!leave) return { ok: false, message: 'ไม่พบคำขอลา' }
    if (leave.status === 'APPROVED' || leave.status === 'REJECTED') {
      return { ok: false, message: `คำขอนี้ดำเนินการแล้ว (${leave.status})` }
    }
    if (!leave.chainConfigId) return { ok: false, message: LINE_USE_APP_MSG }

    const result = await executeLeaveStepAction(
      prisma, requestId, actorId, role, action, undefined, LINE_WEBHOOK_IP,
    )
    if ('error' in result) return { ok: false, message: formatLineChainActionError(result) }

    return { ok: true, stepName: result.stepName, finalized: result.finalized, docLabel: DOC_LABEL.LEAVE }
  }

  if (docType === 'OUTSIDE') {
    const ow = await prisma.outsideWorkRequest.findUnique({ where: { id: requestId } })
    if (!ow) return { ok: false, message: 'ไม่พบคำขอปฏิบัติงานนอก' }
    if (ow.status === 'APPROVED' || ow.status === 'REJECTED') {
      return { ok: false, message: `คำขอนี้ดำเนินการแล้ว (${ow.status})` }
    }
    if (!ow.chainConfigId || ow.approvalStatus !== 'pending_chain') {
      return { ok: false, message: LINE_USE_APP_MSG }
    }

    const result = await executeOutsideWorkStepAction(
      prisma, requestId, actorId, role, action, undefined, LINE_WEBHOOK_IP,
    )
    if ('error' in result) return { ok: false, message: formatLineChainActionError(result) }

    await prisma.approvalHistory.create({
      data: {
        approvedById: actorId,
        action,
        step: ow.currentStepOrder,
        ip: LINE_WEBHOOK_IP,
        outsideRequestId: requestId,
      },
    }).catch(() => {})

    return { ok: true, stepName: result.stepName, finalized: result.finalized, docLabel: DOC_LABEL.OUTSIDE }
  }

  // FORGOT_SCAN
  const fs = await prisma.forgotScanRequest.findUnique({ where: { id: requestId } })
  if (!fs) return { ok: false, message: 'ไม่พบคำขอลืมสแกน' }
  if (fs.status === 'APPROVED' || fs.status === 'REJECTED') {
    return { ok: false, message: `คำขอนี้ดำเนินการแล้ว (${fs.status})` }
  }
  if (!fs.chainConfigId) return { ok: false, message: LINE_USE_APP_MSG }

  const result = await executeForgotScanStepAction(
    prisma, requestId, actorId, role, action, undefined, LINE_WEBHOOK_IP,
  )
  if ('error' in result) return { ok: false, message: formatLineChainActionError(result) }

  return { ok: true, stepName: result.stepName, finalized: result.finalized, docLabel: DOC_LABEL.FORGOT_SCAN }
}
