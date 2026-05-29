import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { fetchImageBuffer } from '@/lib/cloudinary-service'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        profileCloudinaryPublicId: true,
        profileImage: true,
        profileImageBase64: true,
      },
    })

    const publicId = user?.profileCloudinaryPublicId ?? user?.profileImage
    if (publicId && publicId.includes('/')) {
      const img = await fetchImageBuffer(publicId)
      if (img) {
        return new NextResponse(new Uint8Array(img.buffer), {
          headers: {
            'Content-Type': img.mime,
            'Cache-Control': 'private, no-store, max-age=0',
          },
        })
      }
    }

    if (user?.profileImageBase64) {
      const buffer = Buffer.from(user.profileImageBase64, 'base64')
      const isPng = buffer[0] === 0x89
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': isPng ? 'image/png' : 'image/jpeg',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    return NextResponse.json({ error: 'ไม่มีรูปโปรไฟล์' }, { status: 404 })
  } catch (err) {
    return apiError(err)
  }
}
