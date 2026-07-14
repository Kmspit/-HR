import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'
import { checkDebtorAccess } from '@/lib/debtor-access'
import { DOCUMENT_MIME_ALLOWLIST, DOCUMENT_ALLOWED_FORMATS, MAX_DOCUMENT_UPLOAD_BYTES } from '@/lib/document-upload'

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
}

const userSel = { id: true, name: true, department: true, role: true }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const files = await prisma.debtorFile.findMany({
    where: { debtorId: id },
    include: { createdBy: { select: userSel } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(files)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Debtor not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  const docType  = (formData.get('docType') as string) || 'OTHER'

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!DOCUMENT_MIME_ALLOWLIST[file.type]) {
    return NextResponse.json(
      { error: 'ชนิดไฟล์ไม่รองรับ (รองรับ PDF, JPG, PNG, WebP, Word, Excel, Zip, Text)' },
      { status: 400 },
    )
  }
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'ไฟล์ขนาดใหญ่เกิน 20MB' }, { status: 400 })
  }

  configureCloudinary()
  const buf   = Buffer.from(await file.arrayBuffer())
  const b64   = `data:${file.type};base64,${buf.toString('base64')}`
  const result = await cloudinary.uploader.upload(b64, {
    folder:          'hrflow/debt-docs',
    resource_type:   'auto',
    allowed_formats: DOCUMENT_ALLOWED_FORMATS,
  })

  const dbFile = await prisma.debtorFile.create({
    data: {
      debtorId:   id,
      url:        result.secure_url,
      publicId:   result.public_id,
      filename:   file.name,
      fileType:   file.type,
      size:       file.size,
      docType,
      createdById: session.user.id,
    },
    include: { createdBy: { select: userSel } },
  })

  return NextResponse.json(dbFile, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id }   = await params
  const access = await checkDebtorAccess(prisma, id, session.user.id, session.user.role)
  if (access.status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { fileId } = await req.json()

  const file = await prisma.debtorFile.findUnique({ where: { id: fileId } })
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  if (file.debtorId !== id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })

  if (file.publicId) {
    configureCloudinary()
    after(() => { cloudinary.uploader.destroy(file.publicId, { resource_type: 'auto' }).catch(() => {}) })
  }

  await prisma.debtorFile.delete({ where: { id: fileId } })
  return NextResponse.json({ ok: true })
}
