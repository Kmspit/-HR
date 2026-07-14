import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'
import { apiError } from '@/lib/api-handler'

const CAN_MANAGE_ALL = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR']
const MAX_BYTES = 20 * 1024 * 1024

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

// POST /api/tasks/[id]/attachments — upload a file attachment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: taskId } = await params
    const task = await prisma.taskAssignment.findUnique({ where: { id: taskId } })
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const userId = session.user.id
    const role = session.user.role
    const isFullAdmin = CAN_MANAGE_ALL.includes(role)
    const canUpload =
      task.assigneeId === userId ||
      task.assignedById === userId ||
      isFullAdmin

    if (!canUpload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return NextResponse.json(
        { error: 'ไฟล์ประเภทนี้ไม่รองรับ (รองรับ: PDF, Word, Excel, PNG, JPG, ZIP)' },
        { status: 400 },
      )
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
      folder: `${ROOT}/tasks/${taskId}`,
      public_id: `${Date.now()}`,
      resource_type: isImage ? 'image' : 'raw',
      type: 'upload',
      overwrite: false,
      format: ext,
    })

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        fileName: file.name,
        fileUrl: result.secure_url,
        publicId: result.public_id,
        fileType: file.type,
        fileSize: file.size,
        uploadedById: userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ attachment }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}

// DELETE /api/tasks/[id]/attachments?attachmentId=xxx — remove an attachment
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: taskId } = await params
    const { searchParams } = new URL(req.url)
    const attachmentId = searchParams.get('attachmentId')
    if (!attachmentId) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 })

    const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } })
    if (!attachment || attachment.taskId !== taskId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const userId = session.user.id
    const role = session.user.role
    const isFullAdmin = CAN_MANAGE_ALL.includes(role)
    const canDelete = attachment.uploadedById === userId || isFullAdmin

    if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    configureCloudinary()
    const isImage = attachment.fileType.startsWith('image/')
    // Best-effort — matches the other Cloudinary-delete routes, don't fail the
    // whole attachment removal (or block the response) on a Cloudinary hiccup.
    after(() => {
      cloudinary.uploader.destroy(attachment.publicId, {
        resource_type: isImage ? 'image' : 'raw',
        type: 'upload',
      }).catch(() => {})
    })

    await prisma.taskAttachment.delete({ where: { id: attachmentId } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
