import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getSignedUrl } from '@/lib/cloudinary-service'

// GET /api/case-documents/[id]/preview-url?fileId=<fileId>
// Returns a short-lived signed Cloudinary URL for inline preview.
// Only authenticated users may call this; the URL itself carries a cryptographic
// signature so it cannot be forged, but has no server-enforced expiry beyond
// the session gate here.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  const file = await prisma.caseDocumentFile.findFirst({
    where: { id: fileId, documentId: id },
    select: { publicId: true, format: true, resourceType: true, mimeType: true, secureUrl: true, fileUrl: true },
  })
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const cloudinaryType = file.secureUrl?.includes('/authenticated/')
      ? 'authenticated'
      : 'upload'

    if (cloudinaryType === 'authenticated') {
      const fmt = file.format ?? (file.mimeType?.includes('pdf') ? 'pdf' : 'jpg')
      const url = getSignedUrl(file.publicId, { expiresInSec: 900, format: fmt })
      if (!url) return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 })
      return NextResponse.json({ url })
    }

    return NextResponse.json({ url: file.secureUrl ?? file.fileUrl })
  } catch (err: any) {
    console.error('[preview-url GET]', err)
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }
}
