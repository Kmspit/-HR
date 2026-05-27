import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { profileImageBase64: true, profileImage: true },
    })

    if (!user?.profileImageBase64) {
      return NextResponse.json({ error: 'ไม่มีรูปโปรไฟล์' }, { status: 404 })
    }

    const buffer = Buffer.from(user.profileImageBase64, 'base64')
    const isPng = user.profileImage?.includes('.png') || buffer[0] === 0x89
    const contentType = isPng ? 'image/png' : 'image/jpeg'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
