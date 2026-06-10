import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'ไฟล์ขนาดใหญ่เกิน 10MB' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'รองรับเฉพาะ JPG, PNG, WebP, PDF' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const filename = `${randomBytes(8).toString('hex')}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'outside-work')
    await mkdir(uploadDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadDir, filename), buffer)

    return NextResponse.json({ url: `/uploads/outside-work/${filename}`, name: file.name })
  } catch (err) {
    return apiError(err)
  }
}
