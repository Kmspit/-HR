import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

function configureCloudinary() {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const key  = process.env.CLOUDINARY_API_KEY?.trim()
  const sec  = process.env.CLOUDINARY_API_SECRET?.trim()
  if (name && key && sec) cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: documentId } = await params
  const doc = await prisma.caseDocument.findUnique({ where: { id: documentId } })
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const body = await req.json()
  const { fileUrl, secureUrl, publicId, fileName, fileType, mimeType, resourceType, format, fileSize } = body

  if (!publicId || !fileName) {
    return NextResponse.json({ error: 'publicId, fileName required' }, { status: 400 })
  }

  const lastFile = await prisma.caseDocumentFile.findFirst({
    where: { documentId },
    orderBy: { version: 'desc' },
  })
  const version = (lastFile?.version ?? 0) + 1

  const file = await prisma.caseDocumentFile.create({
    data: {
      documentId,
      fileName,
      fileUrl:      fileUrl ?? secureUrl ?? '',
      secureUrl:    secureUrl ?? null,
      publicId,
      fileType:     fileType ?? mimeType ?? 'application/octet-stream',
      mimeType:     mimeType ?? null,
      resourceType: resourceType ?? null,
      format:       format ?? null,
      fileSize:     fileSize ? Number(fileSize) : null,
      version,
      uploadedById: session.user.id,
    },
  })

  // Version history
  const lastVer = await prisma.caseDocumentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
  })
  await prisma.caseDocumentVersion.create({
    data: {
      documentId,
      versionNumber: (lastVer?.versionNumber ?? 0) + 1,
      changeNote:    `อัพโหลดไฟล์ v${version}: ${fileName}`,
      changedById:   session.user.id,
      changedByName: session.user.name ?? '',
    },
  })

  // Bump document updatedAt
  await prisma.caseDocument.update({ where: { id: documentId }, data: { updatedAt: new Date() } })

  return NextResponse.json(file, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: documentId } = await params
  const { fileId } = await req.json()
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  const file = await prisma.caseDocumentFile.findUnique({ where: { id: fileId } })
  if (!file || file.documentId !== documentId) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  configureCloudinary()
  try { await cloudinary.uploader.destroy(file.publicId) } catch { /* best-effort */ }
  await prisma.caseDocumentFile.delete({ where: { id: fileId } })

  return NextResponse.json({ ok: true })
}
