import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const places = await prisma.savedWorkPlace.findMany({
      where: { userId: session.user.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json({ places })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name } = await req.json()
    const trimmed = String(name ?? '').trim()
    if (!trimmed) return NextResponse.json({ error: 'กรุณากรอกชื่อสถานที่' }, { status: 400 })

    const place = await prisma.savedWorkPlace.upsert({
      where: { userId_name: { userId: session.user.id, name: trimmed } },
      update: {},
      create: { userId: session.user.id, name: trimmed },
    })
    return NextResponse.json({ success: true, place })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await prisma.savedWorkPlace.deleteMany({
      where: { id, userId: session.user.id },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
