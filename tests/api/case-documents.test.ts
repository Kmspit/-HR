import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    caseDocument: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    caseDocumentFile: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('cloudinary', () => ({
  v2: {
    config:      vi.fn(),
    uploader:    { upload: vi.fn() },
    url:         vi.fn(),
  },
}))

vi.mock('@/lib/cloudinary-service', () => ({
  getSignedUrl: vi.fn(),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cloudinary-service'
import { GET as previewGet } from '@/app/api/case-documents/[id]/preview-url/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

const userSession = { user: { id: 'user-1', name: 'Test', role: 'EMPLOYEE' } }

const mockFile = {
  id: 'file-1', documentId: 'doc-1', publicId: 'hr/docs/test.pdf',
  format: 'pdf', resourceType: 'raw', mimeType: 'application/pdf',
  secureUrl: 'https://res.cloudinary.com/demo/image/authenticated/test.pdf',
  fileUrl: null,
}

function makePreviewReq(docId: string, fileId: string) {
  return new NextRequest(
    `http://localhost/api/case-documents/${docId}/preview-url?fileId=${fileId}`,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/case-documents/[id]/preview-url', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: caller is the document's uploader, so existing behavior tests
    // below reach the file lookup unless a test overrides this for the
    // access-control cases.
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ uploadedById: 'user-1' } as any)
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const res = await previewGet(makePreviewReq('doc-1', 'file-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the document itself is not found', async () => {
    vi.mocked(auth).mockResolvedValue(userSession as any)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue(null as any)
    const res = await previewGet(makePreviewReq('doc-1', 'file-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    })
    expect(res.status).toBe(404)
  })

  it('forbids a caller who is neither a manage-role nor the document uploader from minting a signed URL', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'stranger-1', role: 'EMPLOYEE' } } as any)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ uploadedById: 'user-1' } as any)
    const res = await previewGet(makePreviewReq('doc-1', 'file-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    })
    expect(res.status).toBe(403)
    expect(prisma.caseDocumentFile.findFirst).not.toHaveBeenCalled()
  })

  it('allows a CAN_MANAGE role regardless of who uploaded the document', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'hr-1', role: 'HR' } } as any)
    vi.mocked(prisma.caseDocument.findUnique).mockResolvedValue({ uploadedById: 'someone-else' } as any)
    vi.mocked(prisma.caseDocumentFile.findFirst).mockResolvedValue(mockFile as any)
    vi.mocked(getSignedUrl).mockReturnValue('https://signed.cloudinary.com/test.pdf?token=abc')
    const res = await previewGet(makePreviewReq('doc-1', 'file-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    })
    expect(res.status).toBe(200)
  })

  it('returns 400 when fileId is missing', async () => {
    vi.mocked(auth).mockResolvedValue(userSession as any)
    const res = await previewGet(
      new NextRequest('http://localhost/api/case-documents/doc-1/preview-url'),
      { params: Promise.resolve({ id: 'doc-1' }) },
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when file is not found', async () => {
    vi.mocked(auth).mockResolvedValue(userSession as any)
    vi.mocked(prisma.caseDocumentFile.findFirst).mockResolvedValue(null as any)
    const res = await previewGet(makePreviewReq('doc-1', 'missing'), {
      params: Promise.resolve({ id: 'doc-1' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns signed URL for authenticated Cloudinary file', async () => {
    vi.mocked(auth).mockResolvedValue(userSession as any)
    vi.mocked(prisma.caseDocumentFile.findFirst).mockResolvedValue(mockFile as any)
    vi.mocked(getSignedUrl).mockReturnValue('https://signed.cloudinary.com/test.pdf?token=abc')

    const res = await previewGet(makePreviewReq('doc-1', 'file-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toContain('signed.cloudinary.com')
    expect(getSignedUrl).toHaveBeenCalledWith(
      mockFile.publicId,
      expect.objectContaining({ expiresInSec: 900 }),
    )
  })

  it('returns public URL for upload-type Cloudinary file', async () => {
    vi.mocked(auth).mockResolvedValue(userSession as any)
    vi.mocked(prisma.caseDocumentFile.findFirst).mockResolvedValue({
      ...mockFile,
      secureUrl: 'https://res.cloudinary.com/demo/raw/upload/test.pdf',
    } as any)

    const res = await previewGet(makePreviewReq('doc-1', 'file-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toContain('/upload/')
    expect(getSignedUrl).not.toHaveBeenCalled()
  })

  it('returns 500 when getSignedUrl returns null', async () => {
    vi.mocked(auth).mockResolvedValue(userSession as any)
    vi.mocked(prisma.caseDocumentFile.findFirst).mockResolvedValue(mockFile as any)
    vi.mocked(getSignedUrl).mockReturnValue(null as any)

    const res = await previewGet(makePreviewReq('doc-1', 'file-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    })
    expect(res.status).toBe(500)
  })
})
