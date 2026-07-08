import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/api-handler', () => ({
  apiError: (err: unknown) => new Response(JSON.stringify({ error: String(err) }), { status: 500 }),
}))

const writeFileMock = vi.fn().mockResolvedValue(undefined)
vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { POST } from '@/app/api/outside-work/upload/route'

const empSession = { user: { id: 'emp-1', role: 'EMPLOYEE' } }

function makeReq(file: File) {
  const form = new FormData()
  form.set('file', file)
  return new NextRequest('http://localhost/api/outside-work/upload', { method: 'POST', body: form })
}

describe('POST /api/outside-work/upload — extension is derived from validated MIME type only', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(empSession as never)
  })

  it('ignores a malicious client-supplied extension and writes a safe one for the declared type', async () => {
    // Attacker: real bytes are irrelevant here — the important thing is the
    // FILENAME claims ".html" while `type` claims image/jpeg (both attacker-controlled).
    const file = new File(['<script>alert(1)</script>'], 'pwn.html', { type: 'image/jpeg' })
    const res = await POST(makeReq(file))
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.url).toMatch(/^\/uploads\/outside-work\/[0-9a-f]+\.jpg$/)
    expect(data.url).not.toContain('.html')

    const writtenPath = writeFileMock.mock.calls[0][0] as string
    expect(writtenPath.endsWith('.jpg')).toBe(true)
    expect(writtenPath).not.toContain('.html')
  })

  it('rejects a disallowed MIME type regardless of filename', async () => {
    const file = new File(['whatever'], 'innocuous.png', { type: 'text/html' })
    const res = await POST(makeReq(file))
    expect(res.status).toBe(400)
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('produces the expected extension for every allowed type', async () => {
    const cases: [string, string][] = [
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
      ['application/pdf', 'pdf'],
    ]
    for (const [type, expectedExt] of cases) {
      writeFileMock.mockClear()
      const file = new File(['x'], `evil.sh`, { type })
      const res = await POST(makeReq(file))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.url.endsWith(`.${expectedExt}`)).toBe(true)
    }
  })
})
