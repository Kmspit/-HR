import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/debtor-access', () => ({
  checkDebtorAccess: vi.fn().mockResolvedValue({ status: 'ok' }),
}))

const cloudinaryUpload = vi.fn().mockResolvedValue({ secure_url: 'https://x/f', public_id: 'pub-1' })
vi.mock('cloudinary', () => ({
  v2: { config: vi.fn(), uploader: { upload: (...a: unknown[]) => cloudinaryUpload(...a) } },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientCompanyFile: { create: vi.fn().mockResolvedValue({ id: 'f1' }) },
    debtorFile:         { create: vi.fn().mockResolvedValue({ id: 'f1' }) },
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST as clientCompanyFilesPost } from '@/app/api/client-companies/[id]/files/route'
import { POST as debtorFilesPost } from '@/app/api/debtors/[id]/files/route'

const params = Promise.resolve({ id: 'x1' })
const session = { user: { id: 'u1', role: 'HR' } }

function makeReq(url: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return new NextRequest(url, { method: 'POST', body: formData })
}

function makeFile(name: string, type: string, size?: number) {
  if (size === undefined) return new File(['x'], name, { type })
  return new File([new Uint8Array(size)], name, { type })
}

describe('POST /api/client-companies/[id]/files — MIME whitelist + size cap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts an allowed type (pdf) within the size cap', async () => {
    vi.mocked(auth).mockResolvedValue(session as never)
    const req = makeReq('http://localhost/api/client-companies/x1/files', makeFile('a.pdf', 'application/pdf'))
    const res = await clientCompanyFilesPost(req, { params })
    expect(res.status).toBe(201)
    expect(cloudinaryUpload).toHaveBeenCalled()
  })

  it('rejects a disallowed MIME type (e.g. HTML/SVG) with 400, never reaching Cloudinary', async () => {
    vi.mocked(auth).mockResolvedValue(session as never)
    const req = makeReq('http://localhost/api/client-companies/x1/files', makeFile('a.html', 'text/html'))
    const res = await clientCompanyFilesPost(req, { params })
    expect(res.status).toBe(400)
    expect(cloudinaryUpload).not.toHaveBeenCalled()
    expect(prisma.clientCompanyFile.create).not.toHaveBeenCalled()
  })

  it('rejects a file over the 20MB cap with 400, never reaching Cloudinary', async () => {
    vi.mocked(auth).mockResolvedValue(session as never)
    const oversized = makeFile('a.pdf', 'application/pdf', 21 * 1024 * 1024)
    const req = makeReq('http://localhost/api/client-companies/x1/files', oversized)
    const res = await clientCompanyFilesPost(req, { params })
    expect(res.status).toBe(400)
    expect(cloudinaryUpload).not.toHaveBeenCalled()
  })
})

describe('POST /api/debtors/[id]/files — MIME whitelist + size cap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts an allowed type (docx) within the size cap', async () => {
    vi.mocked(auth).mockResolvedValue(session as never)
    const req = makeReq(
      'http://localhost/api/debtors/x1/files',
      makeFile('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    )
    const res = await debtorFilesPost(req, { params })
    expect(res.status).toBe(201)
    expect(cloudinaryUpload).toHaveBeenCalled()
  })

  it('rejects a disallowed MIME type with 400, never reaching Cloudinary', async () => {
    vi.mocked(auth).mockResolvedValue(session as never)
    const req = makeReq('http://localhost/api/debtors/x1/files', makeFile('a.exe', 'application/x-msdownload'))
    const res = await debtorFilesPost(req, { params })
    expect(res.status).toBe(400)
    expect(cloudinaryUpload).not.toHaveBeenCalled()
    expect(prisma.debtorFile.create).not.toHaveBeenCalled()
  })

  it('rejects a file over the 20MB cap with 400, never reaching Cloudinary', async () => {
    vi.mocked(auth).mockResolvedValue(session as never)
    const oversized = makeFile('a.pdf', 'application/pdf', 21 * 1024 * 1024)
    const req = makeReq('http://localhost/api/debtors/x1/files', oversized)
    const res = await debtorFilesPost(req, { params })
    expect(res.status).toBe(400)
    expect(cloudinaryUpload).not.toHaveBeenCalled()
  })
})
