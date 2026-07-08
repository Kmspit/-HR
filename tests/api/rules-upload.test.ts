import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

vi.mock('@/lib/access-control', () => ({
  ANNOUNCEMENT_EDITOR_ROLES: ['MANAGER_HR', 'ADMIN', 'CEO'],
}))

const isCloudinaryConfigured = vi.fn()
const ensureCloudinaryConfig = vi.fn()
vi.mock('@/lib/cloudinary-service', () => ({
  isCloudinaryConfigured: (...a: unknown[]) => isCloudinaryConfigured(...a),
  ensureCloudinaryConfig: (...a: unknown[]) => ensureCloudinaryConfig(...a),
}))

const cloudinaryUpload = vi.fn().mockResolvedValue({ secure_url: 'https://res.cloudinary.com/demo/fake.pdf' })
vi.mock('cloudinary', () => ({
  v2: { uploader: { upload: (...a: unknown[]) => cloudinaryUpload(...a) } },
}))

const writeFileMock = vi.fn().mockResolvedValue(undefined)
vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { POST } from '@/app/api/rules/upload/route'

const hrSession = { user: { id: 'hr-1', role: 'MANAGER_HR' } }

function makeReq(file: File) {
  const form = new FormData()
  form.set('file', file)
  return new NextRequest('http://localhost/api/rules/upload', { method: 'POST', body: form })
}

describe('POST /api/rules/upload — extension/format derived from validated MIME type only', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(hrSession as never)
  })

  it('Cloudinary branch: ignores malicious filename extension, forces format from the MIME whitelist', async () => {
    isCloudinaryConfigured.mockReturnValue(true)
    const file = new File(['<svg onload=alert(1)>'], 'pwn.svg', { type: 'application/pdf' })

    const res = await POST(makeReq(file))
    expect(res.status).toBe(200)

    expect(cloudinaryUpload).toHaveBeenCalledTimes(1)
    const uploadOpts = cloudinaryUpload.mock.calls[0][1] as { format?: string }
    expect(uploadOpts.format).toBe('pdf')
    expect(uploadOpts.format).not.toBe('svg')
  })

  it('local-disk fallback: ignores malicious filename extension, writes a safe one for the declared type', async () => {
    isCloudinaryConfigured.mockReturnValue(false)
    const file = new File(['whatever'], 'pwn.html', { type: 'image/png' })

    const res = await POST(makeReq(file))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.fileUrl).toMatch(/\.png$/)
    expect(data.fileUrl).not.toContain('.html')

    const writtenPath = writeFileMock.mock.calls[0][0] as string
    expect(writtenPath.endsWith('.png')).toBe(true)
  })

  it('rejects a disallowed MIME type regardless of filename', async () => {
    const file = new File(['x'], 'looks-fine.pdf', { type: 'text/html' })
    const res = await POST(makeReq(file))
    expect(res.status).toBe(400)
    expect(cloudinaryUpload).not.toHaveBeenCalled()
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('forbids roles outside ANNOUNCEMENT_EDITOR_ROLES', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'emp-1', role: 'EMPLOYEE' } } as never)
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    const res = await POST(makeReq(file))
    expect(res.status).toBe(403)
  })
})
