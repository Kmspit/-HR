import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { verifyScanImageAccessToken } from '@/lib/attendance-scan-access'
import { getFaceScanImageBuffer } from '@/lib/attendance-face-scan'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const img = await getFaceScanImageBuffer(id)
  if (!img) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(img.buffer), {
    headers: {
      'Content-Type': img.mime,
      'Cache-Control': access ? 'private, max-age=3600' : 'private, no-store, max-age=0',
    },
  })
}
