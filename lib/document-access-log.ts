/**
 * Access logging for the case-documents module, reusing the existing
 * ActivityLog model (already used by digital-signatures/approval-requests)
 * rather than introducing a new table. docRef holds the document's caseId
 * so history can be queried either by document or by case.
 */
import { prisma } from '@/lib/prisma'

export type DocumentAccessAction = 'VIEW' | 'DOWNLOAD'

export async function logCaseDocumentAccess(params: {
  actorId: string
  actorName: string
  documentId: string
  caseId: string | null
  action: DocumentAccessAction
  detail: string
  ip: string
  userAgent: string | null
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        actorId:   params.actorId,
        actorName: params.actorName,
        docType:   'CaseDocument',
        docId:     params.documentId,
        docRef:    params.caseId,
        action:    params.action,
        detail:    params.detail,
        ip:        params.ip,
        userAgent: params.userAgent,
      },
    })
  } catch (err) {
    // Best-effort — a logging failure must never block a legitimate document view/download.
    console.error('[case-document-access-log]', err)
  }
}
