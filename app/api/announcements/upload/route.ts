import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { v2 as cloudinary } from 'cloudinary'
import { apiError } from '@/lib/api-handler'
import { ANNOUNCEMENT_UPLOADER_ROLES } from '@/lib/access-control'

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
}

function configureCloudinary() {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const key = process.env.CLOUDINARY_API_KEY?.trim()
  const sec = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!name || !key || !sec) throw new Error('Cloudinary not configured')
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true })
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !ANNOUNCEMENT_UPLOADER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return NextResponse.json({ error: 'ไฟล์ประเภทนี้ไม่รองรับ (รองรับ: PDF, Word, Excel, PNG, JPG, ZIP)' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 20 MB' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`

    configureCloudinary()
    const ROOT = (process.env.CLOUDINARY_ROOT_FOLDER ?? 'hr-system').replace(/^\/|\/$/g, '')
    const isImage = file.type.startsWith('image/')

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `${ROOT}/announcements`,
      public_id: `${Date.now()}`,
      resource_type: isImage ? 'image' : 'raw',
      type: 'upload',
      overwrite: false,
      format: ext,
    })

    return NextResponse.json({
      name: file.name,
      url: result.secure_url,
      publicId: result.public_id,
      type: file.type,
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !ANNOUNCEMENT_UPLOADER_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { publicId, resourceType } = await req.json() as { publicId: string; resourceType?: string }
    if (!publicId) return NextResponse.json({ error: 'publicId required' }, { status: 400 })

    configureCloudinary()
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType === 'image' ? 'image' : 'raw',
      type: 'upload',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
