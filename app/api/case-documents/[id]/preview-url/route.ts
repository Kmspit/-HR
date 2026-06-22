import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { ensureCloudinaryConfig } from '@/lib/cloudinary-service'
import { v2 as cloudinary } from 'cloudinary'

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
    select: { publicId: true, format: true, resourceType: true, mimeType: true },
  })
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    ensureCloudinaryConfig()
    const resourceType = (file.resourceType as 'image' | 'video' | 'raw') ?? 'image'
    const fmt = file.format ?? (file.mimeType?.includes('pdf') ? 'pdf' : 'jpg')

    // private_download_url is required for type:authenticated assets — cloudinary.url()
    // with sign_url:true only works for type:upload and returns a 401 for authenticated.
    // attachment:false keeps the browser in preview/inline mode instead of forcing download.
    const url = cloudinary.utils.private_download_url(file.publicId, fmt, {
      resource_type: resourceType,
      type:          'authenticated',
      expires_at:    Math.floor(Date.now() / 1000) + 900, // 15 minutes
      attachment:    false,
    })

    return NextResponse.json({ url })
  } catch (err: any) {
    console.error('[preview-url GET]', err)
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }
}
