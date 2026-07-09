import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { activityLog: { create: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { logCaseDocumentAccess } from '@/lib/document-access-log'

describe('logCaseDocumentAccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes an ActivityLog row with docType=CaseDocument, docId=documentId, docRef=caseId', async () => {
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as never)

    await logCaseDocumentAccess({
      actorId: 'u1', actorName: 'User One', documentId: 'doc-1', caseId: 'case-1',
      action: 'VIEW', detail: 'เปิดดูเอกสาร', ip: '1.2.3.4', userAgent: 'test-agent',
    })

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'u1',
        actorName: 'User One',
        docType: 'CaseDocument',
        docId: 'doc-1',
        docRef: 'case-1',
        action: 'VIEW',
        detail: 'เปิดดูเอกสาร',
        ip: '1.2.3.4',
        userAgent: 'test-agent',
      },
    })
  })

  it('records docRef=null when the document has no linked case', async () => {
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as never)

    await logCaseDocumentAccess({
      actorId: 'u1', actorName: 'User One', documentId: 'doc-1', caseId: null,
      action: 'DOWNLOAD', detail: 'ขอลิงก์ดาวน์โหลด', ip: '1.2.3.4', userAgent: null,
    })

    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ docRef: null, action: 'DOWNLOAD' }) }),
    )
  })

  it('swallows errors — a logging failure must never throw back to the caller', async () => {
    vi.mocked(prisma.activityLog.create).mockRejectedValue(new Error('db down'))

    await expect(
      logCaseDocumentAccess({
        actorId: 'u1', actorName: 'User One', documentId: 'doc-1', caseId: 'case-1',
        action: 'VIEW', detail: 'x', ip: '1.2.3.4', userAgent: null,
      }),
    ).resolves.toBeUndefined()
  })
})
