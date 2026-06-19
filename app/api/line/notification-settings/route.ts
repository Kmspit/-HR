import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

type LineNotifSettings = {
  muteWeekend: boolean
  muteAfterHours: boolean
  muteStart: string
  muteEnd: string
  mutedTypes: string[]
}

const DEFAULT: LineNotifSettings = {
  muteWeekend: false,
  muteAfterHours: false,
  muteStart: '21:00',
  muteEnd: '08:00',
  mutedTypes: [],
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { lineNotifSettings: true, lineUserId: true },
    })

    let settings: LineNotifSettings = DEFAULT
    if (user?.lineNotifSettings) {
      try {
        settings = { ...DEFAULT, ...(JSON.parse(user.lineNotifSettings) as Partial<LineNotifSettings>) }
      } catch (e) { console.warn('[notification-settings] corrupted settings, using default:', e) }
    }

    return NextResponse.json({ settings, linked: !!user?.lineUserId })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as Partial<LineNotifSettings>

    // Merge with existing settings
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { lineNotifSettings: true },
    })

    let current: LineNotifSettings = DEFAULT
    if (user?.lineNotifSettings) {
      try { current = { ...DEFAULT, ...(JSON.parse(user.lineNotifSettings) as Partial<LineNotifSettings>) } }
      catch (e) { console.warn('[notification-settings] corrupted settings, using default:', e) }
    }

    const updated: LineNotifSettings = {
      muteWeekend:    typeof body.muteWeekend    === 'boolean' ? body.muteWeekend    : current.muteWeekend,
      muteAfterHours: typeof body.muteAfterHours === 'boolean' ? body.muteAfterHours : current.muteAfterHours,
      muteStart:      typeof body.muteStart      === 'string'  ? body.muteStart      : current.muteStart,
      muteEnd:        typeof body.muteEnd        === 'string'  ? body.muteEnd        : current.muteEnd,
      mutedTypes:     Array.isArray(body.mutedTypes)           ? body.mutedTypes     : current.mutedTypes,
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { lineNotifSettings: JSON.stringify(updated) },
    })

    return NextResponse.json({ ok: true, settings: updated })
  } catch (err) {
    return apiError(err)
  }
}
