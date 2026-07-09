import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getSignedUrl } from '@/lib/cloudinary-service'
import { logCaseDocumentAccess } from '@/lib/document-access-log'

const CAN_MANAGE = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER', 'ADMIN']

// GET /api/case-documents/[id]/preview-url?fileId=<fileId>
// Returns a short-lived signed Cloudinary URL for inline preview.
// Same access check as GET/PATCH/DELETE on the parent document
// (app/api/case-documents/[id]/route.ts) — the signed URL itself can't be
// forged, but minting one for a document the caller has no access to defeats
// the point of checking access on the document routes at all.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  const doc = await prisma.caseDocument.findUnique({
    where: { id },
    select: { uploadedById: true, caseId: true, title: true },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canView = CAN_MANAGE.includes(session.user.role) || doc.uploadedById === session.user.id
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await logCaseDocumentAccess({
    actorId:    session.user.id,
    actorName:  session.user.name ?? '',
    documentId: id,
    caseId:     doc.caseId,
    action:     'DOWNLOAD',
    detail:     `ขอลิงก์ดาวน์โหลดไฟล์ของเอกสาร "${doc.title}"`,
    ip:         req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
    userAgent:  req.headers.get('user-agent'),
  })

  const file = await prisma.caseDocumentFile.findFirst({
    where: { id: fileId, documentId: id },
    select: { publicId: true, format: true, resourceType: true, mimeType: true, secureUrl: true, fileUrl: true },
  })
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  console.log('[preview-url] file lookup ok', {
    fileId, documentId: id,
    publicId:    file.publicId,
    format:      file.format,
    resourceType:file.resourceType,
    mimeType:    file.mimeType,
    hasSecureUrl:!!file.secureUrl,
    hasFileUrl:  !!file.fileUrl,
    isAuthenticated: file.secureUrl?.includes('/authenticated/'),
  })

  try {
    const cloudinaryType = file.secureUrl?.includes('/authenticated/')
      ? 'authenticated'
      : 'upload'

    if (cloudinaryType === 'authenticated') {
      const fmt = file.format ?? (file.mimeType?.includes('pdf') ? 'pdf' : 'jpg')
      console.log('[preview-url] signing authenticated URL', { publicId: file.publicId, fmt, expiresInSec: 900 })
      const url = getSignedUrl(file.publicId, { expiresInSec: 900, format: fmt })
      if (!url) return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 })
      console.log('[preview-url] signed URL ok, length=', url.length)
      return NextResponse.json({ url })
    }

    console.log('[preview-url] returning public URL (upload type)')
    return NextResponse.json({ url: file.secureUrl ?? file.fileUrl })
  } catch (err: any) {
    console.error('[preview-url GET]', err)
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }
}
