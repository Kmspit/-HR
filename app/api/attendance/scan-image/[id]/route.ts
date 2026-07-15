import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { verifyScanImageAccessToken } from '@/lib/attendance-scan-access'
import { getFaceScanImageBuffer } from '@/lib/attendance-face-scan'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
 try {
  const { id } = await params
  const access = new URL(req.url).searchParams.get('access')

  let allowed = false
  if (access && (await verifyScanImageAccessToken(access, id))) {
    allowed = true
  } else {
    const session = await auth()
    if (session?.user?.id) {
      const scan = await prisma.attendanceFaceScan.findUnique({
        where: { id },
        select: { userId: true },
      })
      if (scan) {
        const isOwner = scan.userId === session.user.id
        const isHr = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
        allowed = isOwner || isHr
      }
    }
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ?w= requests a resized/compressed thumbnail (e.g. grid/lightbox previews) instead of the
  // full-resolution original — clamp to a sane range so the param can't be abused to force huge
  // Cloudinary transforms. Omit ?w= entirely to get the original bytes (e.g. "ดูรูปเต็ม").
  const wParam = new URL(req.url).searchParams.get('w')
  const width = wParam ? Math.min(Math.max(parseInt(wParam, 10) || 0, 100), 1200) : undefined

  const img = await getFaceScanImageBuffer(id, width ? { width } : undefined)
  if (!img) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(img.buffer), {
    headers: {
      'Content-Type': img.mime,
      'Cache-Control': access ? 'private, max-age=3600' : 'private, no-store, max-age=0',
    },
  })
} catch (err) {
  return apiError(err)
 }
}
