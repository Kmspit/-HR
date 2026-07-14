import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    case: { findUnique: vi.fn() },
    caseDocument: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    caseDocumentFile: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    caseDocumentVersion: { create: vi.fn(), findFirst: vi.fn() },
  },
}))

const cloudinaryDestroy = vi.fn().mockResolvedValue({})
vi.mock('cloudinary', () => ({
  v2: { config: vi.fn(), uploader: { destroy: (...a: unknown[]) => cloudinaryDestroy(...a) } },
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST as uploadPost } from '@/app/api/case-documents/upload/route'
import { POST as filesPost, DELETE as filesDelete } from '@/app/api/case-documents/[id]/files/route'

const otherUserSession = { user: { id: 'other-1', role: 'LAWYER', department: 'แผนกอื่น' } }
const assigneeSession  = { user: { id: 'assignee-1', role: 'LAWYER', department: null } }
const hrSession        = { user: { id: 'hr-1', role: 'HR', department: null } }

const caseRow = {
  createdById: 'creator-1', assignedEmployeeId: 'assignee-1', department: 'แผนกกฎหมาย',
}

function makeUploadReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/case-documents/upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function makeFilesReq(method: string, body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/case-documents/doc-1/files', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
const params = Promise.resolve({ id: 'doc-1' })

const validUploadBody = {
  title: 'สัญญา', caseId: 'case-1', publicId: 'pub-1', secureUrl: 'https://res/x.pdf', fileName: 'x.pdf',
}

describe('POST /api/case-documents/upload — requires case access when caseId is given', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRow as never)
    vi.mocked(prisma.caseDocument.create).mockResolvedValue({ id: 'doc-1' } as never)
    vi.mocked(prisma.caseDocumentFile.create).mockResolvedValue({ id: 'file-1' } as never)
    vi.mocked(prisma.caseDocumentVersion.create).mockResolvedValue({} as never)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ id: 'doc-1', files: [], versions: [] } as never)
  })

  it('forbids a user with no relationship to the case from attaching a document to it', async () => {
    vi.mocked(auth).mockResolvedValue(otherUserSession as never)
    const res = await uploadPost(makeUploadReq(validUploadBody))
    expect(res.status).toBe(403)
    expect(prisma.caseDocument.create).not.toHaveBeenCalled()
  })

  it('allows the case assignee to attach a document', async () => {
    vi.mocked(auth).mockResolvedValue(assigneeSession as never)
    const res = await uploadPost(makeUploadReq(validUploadBody))
    expect(res.status).toBe(201)
    expect(prisma.caseDocument.create).toHaveBeenCalled()
  })

  it('allows EXEC roles (e.g. HR) regardless of case relationship', async () => {
    vi.mocked(auth).mockResolvedValue(hrSession as never)
    const res = await uploadPost(makeUploadReq(validUploadBody))
    expect(res.status).toBe(201)
  })

  it('skips the case-access check entirely when no caseId is given (unrelated document)', async () => {
    vi.mocked(auth).mockResolvedValue(otherUserSession as never)
    const { caseId: _drop, ...bodyWithoutCase } = validUploadBody
    const res = await uploadPost(makeUploadReq(bodyWithoutCase))
    expect(res.status).toBe(201)
    expect(prisma.case.findUnique).not.toHaveBeenCalled()
  })
})

describe('POST/DELETE /api/case-documents/[id]/files — requires case access when the document is case-linked', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.case.findUnique).mockResolvedValue(caseRow as never)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ id: 'doc-1', caseId: 'case-1' } as never)
    vi.mocked(prisma.caseDocumentFile.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.caseDocumentFile.create).mockResolvedValue({ id: 'file-2', version: 1 } as never)
    vi.mocked(prisma.caseDocumentVersion.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.caseDocumentVersion.create).mockResolvedValue({} as never)
    vi.mocked(prisma.caseDocument.update).mockResolvedValue({} as never)
    vi.mocked(prisma.caseDocumentFile.findUnique).mockResolvedValue({ id: 'file-1', documentId: 'doc-1', publicId: 'pub-1' } as never)
    vi.mocked(prisma.caseDocumentFile.delete).mockResolvedValue({} as never)
  })

  it('POST: forbids adding a new file version if the caller has no access to the linked case', async () => {
    vi.mocked(auth).mockResolvedValue(otherUserSession as never)
    const res = await filesPost(makeFilesReq('POST', { publicId: 'pub-2', fileName: 'y.pdf' }), { params })
    expect(res.status).toBe(403)
    expect(prisma.caseDocumentFile.create).not.toHaveBeenCalled()
  })

  it('POST: allows the case assignee to add a new file version', async () => {
    vi.mocked(auth).mockResolvedValue(assigneeSession as never)
    const res = await filesPost(makeFilesReq('POST', { publicId: 'pub-2', fileName: 'y.pdf' }), { params })
    expect(res.status).toBe(201)
    expect(prisma.caseDocumentFile.create).toHaveBeenCalled()
  })

  it('DELETE: forbids deleting a file if the caller has no access to the linked case', async () => {
    vi.mocked(auth).mockResolvedValue(otherUserSession as never)
    const res = await filesDelete(makeFilesReq('DELETE', { fileId: 'file-1' }), { params })
    expect(res.status).toBe(403)
    expect(cloudinaryDestroy).not.toHaveBeenCalled()
    expect(prisma.caseDocumentFile.delete).not.toHaveBeenCalled()
  })

  it('DELETE: allows the case assignee to delete a file', async () => {
    vi.mocked(auth).mockResolvedValue(assigneeSession as never)
    const res = await filesDelete(makeFilesReq('DELETE', { fileId: 'file-1' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.caseDocumentFile.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } })
  })
})
