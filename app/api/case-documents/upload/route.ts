import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/case-documents/upload
// Creates CaseDocument + CaseDocumentFile in one transaction.
// Caller has already uploaded the file to Cloudinary and provides the result.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    title,
    description,
    category,
    docType,
    caseId,
    caseNumber,
    taskId,
    debtorId,
    clientName,
    department,
    tags,
    // file metadata from Cloudinary
    publicId,
    fileUrl,
    secureUrl,
    fileName,
    fileType,
    mimeType,
    resourceType,
    format,
    fileSize,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!publicId || !secureUrl || !fileName) {
    return NextResponse.json({ error: 'publicId, secureUrl, fileName required' }, { status: 400 })
  }

  try {
    const doc = await prisma.caseDocument.create({
      data: {
        title:       title.trim(),
        description: description?.trim() ?? null,
        category:    category ?? 'OTHER',
        docType:     docType  ?? 'OTHER',
        caseId:      caseId   ?? null,
        caseNumber:  caseNumber?.trim() ?? null,
        taskId:      taskId   ?? null,
        debtorId:    debtorId ?? null,
        clientName:  clientName?.trim() ?? null,
        department:  department ?? session.user.department ?? null,
        tags:        tags?.trim() ?? null,
        uploadedById: session.user.id,
      },
    })

    const file = await prisma.caseDocumentFile.create({
      data: {
        documentId:   doc.id,
        fileName:     fileName,
        fileUrl:      fileUrl ?? secureUrl,
        secureUrl:    secureUrl,
        publicId:     publicId,
        fileType:     fileType ?? mimeType ?? 'application/octet-stream',
        mimeType:     mimeType ?? null,
        resourceType: resourceType ?? null,
        format:       format ?? null,
        fileSize:     fileSize ? Number(fileSize) : null,
        version:      1,
        uploadedById: session.user.id,
      },
    })

    await prisma.caseDocumentVersion.create({
      data: {
        documentId:    doc.id,
        versionNumber: 1,
        changeNote:    'สร้างเอกสาร',
        changedById:   session.user.id,
        changedByName: session.user.name ?? '',
      },
    })

    const result = await prisma.caseDocument.findUnique({
      where: { id: doc.id },
      include: {
        uploadedBy: { select: { id: true, name: true, role: true } },
        files:      { orderBy: { version: 'desc' } },
        versions:   { orderBy: { versionNumber: 'desc' } },
      },
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err: any) {
    console.error('[case-documents UPLOAD]', err)
    return NextResponse.json({ error: 'Cannot save document' }, { status: 500 })
  }
}
