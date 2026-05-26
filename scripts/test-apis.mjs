import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma = url && token
  ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
  : new PrismaClient()

function todayLocal() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

try {
  const user = await prisma.user.findFirst({ where: { role: 'EMPLOYEE', status: 'ACTIVE' } })
  if (!user) throw new Error('no employee user')
  console.log('user:', user.email, user.id)

  const today = todayLocal()
  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  })
  console.log('existing attendance:', existing?.id, 'checkIn:', existing?.checkIn, 'checkOut:', existing?.checkOut)

  if (existing?.checkIn && !existing?.checkOut) {
    const updated = await prisma.attendance.update({
      where: { id: existing.id },
      data: { checkOut: new Date() },
    })
    console.log('checkout ok:', updated.id)
  } else if (!existing?.checkIn) {
    const created = await prisma.attendance.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: { checkIn: new Date(), lat: 13.75, lng: 100.5, address: 'test', status: 'NORMAL', lateMinutes: 0, isOutside: false },
      create: {
        userId: user.id,
        date: today,
        checkIn: new Date(),
        lat: 13.75,
        lng: 100.5,
        address: 'test',
        status: 'NORMAL',
        lateMinutes: 0,
        isOutside: false,
      },
    })
    console.log('checkin ok:', created.id)
  } else {
    console.log('already complete today — delete to retest if needed')
  }

  const leave = await prisma.leaveRequest.create({
    data: {
      userId: user.id,
      type: 'SICK',
      startDate: new Date('2026-05-26'),
      endDate: new Date('2026-05-26'),
      days: 1,
      reason: 'test api script',
      status: 'PENDING',
    },
  })
  console.log('leave ok:', leave.id)
  await prisma.leaveRequest.delete({ where: { id: leave.id } })
  console.log('leave cleanup ok')
} catch (e) {
  console.error('FAIL:', e)
} finally {
  await prisma.$disconnect()
}
