import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile } from 'fs/promises'
import path from 'path'

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const lat = parseFloat(formData.get('lat') as string)
  const lng = parseFloat(formData.get('lng') as string)
  const address = formData.get('address') as string
  const photo = formData.get('photo') as File | null
  const locationType = (formData.get('locationType') as string) ?? 'company'
  const forceOutside = locationType === 'outside'

  // Save photo
  let photoUrl: string | undefined
  if (photo && photo.size > 0) {
    const bytes = await photo.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filename = `checkin_${session.user.id}_${Date.now()}.jpg`
    const filePath = path.join(process.cwd(), 'public', 'uploads', filename)
    await writeFile(filePath, buffer)
    photoUrl = `/uploads/${filename}`
  }

  // Geofence check — ถ้าเลือก outside ให้ข้ามการตรวจ geofence
  const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
  let isOutside = forceOutside  // default from user's choice
  if (!forceOutside && settings?.geofenceLat && settings?.geofenceLng && lat && lng) {
    const dist = getDistanceMeters(lat, lng, settings.geofenceLat, settings.geofenceLng)
    isOutside = dist > (settings.geofenceRadius ?? 200)
  }

  // Check late
  const now = new Date()
  let lateMinutes = 0
  let status: 'NORMAL' | 'LATE' = 'NORMAL'
  if (settings?.workStartTime) {
    const [h, m] = settings.workStartTime.split(':').map(Number)
    const grace = settings.lateGraceMin ?? 15
    const workStart = new Date(now)
    workStart.setHours(h, m + grace, 0, 0)
    if (now > workStart) {
      lateMinutes = Math.floor((now.getTime() - workStart.getTime()) / 60000)
      status = 'LATE'
    }
  }

  // Today date (midnight)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId: session.user.id, date: today } },
  })

  if (existing?.checkIn) {
    return NextResponse.json({ error: 'เน€เธเนเธเธญเธดเธเนเธฅเนเธงเธงเธฑเธเธเธตเน' }, { status: 400 })
  }

  const attendance = await prisma.attendance.upsert({
    where: { userId_date: { userId: session.user.id, date: today } },
    update: { checkIn: now, lat, lng, address, photoUrl, isOutside, status, lateMinutes },
    create: {
      userId: session.user.id,
      date: today,
      checkIn: now,
      lat,
      lng,
      address,
      photoUrl,
      isOutside,
      status,
      lateMinutes,
    },
  })

  return NextResponse.json({ success: true, attendance, isOutside, lateMinutes })
}
