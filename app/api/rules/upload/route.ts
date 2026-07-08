import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-handler'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'
import { ANNOUNCEMENT_EDITOR_ROLES } from '@/lib/access-control'

const MAX_SIZE = 20 * 1024 * 1024 // 20 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/jpeg',
  'image/png',
  'image/webp',
]

// Extension/format derived from the validated MIME type ONLY — never trust the
// client-supplied filename's extension (see outside-work/upload/route.ts for
// the same fix and rationale).
const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !ANNOUNCEMENT_EDITOR_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 20 MB' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'รองรับเฉพาะ PDF, DOCX, JPG, PNG' }, { status: 400 })
    }

    // Try Cloudinary first
    const { isCloudinaryConfigured, ensureCloudinaryConfig } = await import('@/lib/cloudinary-service')
    if (isCloudinaryConfigured()) {
      ensureCloudinaryConfig()
      const { v2: cloudinary } = await import('cloudinary')

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`
      const ext = EXT_BY_TYPE[file.type] ?? 'bin'
      const publicId = `hr-system/rules/${Date.now()}-${randomBytes(4).toString('hex')}`

      const result = await cloudinary.uploader.upload(dataUri, {
        folder: undefined,
        public_id: publicId,
        resource_type: 'auto',
        type: 'upload',
        overwrite: false,
        format: ext,
      })

      return NextResponse.json({ fileUrl: result.secure_url })
    }

    // Fallback: save to local public/uploads/rules/
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'rules')
    await mkdir(uploadsDir, { recursive: true })

    const ext = EXT_BY_TYPE[file.type] ?? 'bin'
    const fname = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`
    const dest = path.join(uploadsDir, fname)

    const arrayBuffer = await file.arrayBuffer()
    await writeFile(dest, Buffer.from(arrayBuffer))

    const fileUrl = `/uploads/rules/${fname}`
    return NextResponse.json({ fileUrl })
  } catch (err) {
    return apiError(err)
  }
}
