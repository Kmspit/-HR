import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { assertLineFieldsUnique, parseLineFields } from '@/lib/line-profile'
import { normalizeEmail, normalizeNationalId, parseBirthDate, SELF_PROFILE_FORBIDDEN } from '@/lib/profile-update'
import { normalizeThaiPhone } from '@/lib/profile-name'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const isSelf = id === session.user.id
    const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
    if (!isSelf && !isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        employeeId: true,
        role: true,
        status: true,
        department: true,
        position: true,
        baseSalary: true,
        socialSecurity: true,
        isCoworker: true,
        startDate: true,
        phone: true,
        lineId: true,
        lineUserId: true,
        lineDisplayName: true,
        prefix: true,
        nickname: true,
        birthDate: true,
        address: true,
        nationalId: true,
        profileImage: true,
      },
    })

    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ user })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()

    if (id === session.user.id) {
      for (const key of ['role', 'status']) {
        if (key in body && body[key] !== undefined) {
          return NextResponse.json(
            { error: 'ไม่สามารถแก้ Role หรือสถานะของตัวเองได้ — ให้ Admin คนอื่นช่วยแก้' },
            { status: 403 },
          )
        }
      }
    }

    for (const key of Object.keys(body)) {
      if (SELF_PROFILE_FORBIDDEN.has(key) && !['role', 'status'].includes(key)) {
        if (['password', 'passwordHash'].includes(key)) {
          return NextResponse.json({ error: 'ไม่รองรับการเปลี่ยนรหัสผ่านทาง API นี้' }, { status: 400 })
        }
      }
    }

    const lineParsed = parseLineFields(
      {
        lineId: body.lineId,
        lineUserId: body.lineUserId,
        lineDisplayName: body.lineDisplayName,
      },
      { requireLineId: false },
    )
    if (!lineParsed.ok) {
      return NextResponse.json({ error: lineParsed.error }, { status: 400 })
    }
    const lineUnique = await assertLineFieldsUnique(lineParsed, id)
    if (!lineUnique.ok) {
      return NextResponse.json({ error: lineUnique.error }, { status: 409 })
    }

    const data: Record<string, unknown> = {
      lineId: lineParsed.lineId,
      lineUserId: lineParsed.lineUserId,
      lineDisplayName: lineParsed.lineDisplayName,
    }

    if (body.email != null) {
      const email = normalizeEmail(String(body.email))
      if (!email) return NextResponse.json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 })
      const dup = await prisma.user.findFirst({ where: { email, NOT: { id } } })
      if (dup) return NextResponse.json({ error: 'อีเมลนี้มีในระบบแล้ว' }, { status: 409 })
      data.email = email
    }

    if (body.phone != null) {
      const phone = normalizeThaiPhone(String(body.phone))
      if (!phone) {
        return NextResponse.json(
          { error: 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0' },
          { status: 400 },
        )
      }
      const dup = await prisma.user.findFirst({ where: { phone, NOT: { id } } })
      if (dup) return NextResponse.json({ error: 'เบอร์โทรนี้มีในระบบแล้ว' }, { status: 409 })
      data.phone = phone
    }

    if (body.nationalId !== undefined) {
      const nationalId = normalizeNationalId(body.nationalId)
      if (body.nationalId != null && String(body.nationalId).trim() !== '' && !nationalId) {
        return NextResponse.json({ error: 'เลขบัตรประชาชนต้อง 13 หลัก' }, { status: 400 })
      }
      if (nationalId) {
        const dup = await prisma.user.findFirst({ where: { nationalId, NOT: { id } } })
        if (dup) {
          return NextResponse.json({ error: 'เลขบัตรประชาชนนี้มีในระบบแล้ว' }, { status: 409 })
        }
      }
      data.nationalId = nationalId
    }

    if (body.birthDate !== undefined) {
      const birth = parseBirthDate(body.birthDate)
      if (birth === 'invalid') {
        return NextResponse.json({ error: 'วันเกิดไม่ถูกต้อง' }, { status: 400 })
      }
      data.birthDate = birth
    }

    const allowedFields = [
      'name',
      'nameEn',
      'nickname',
      'prefix',
      'address',
      'department',
      'position',
      'baseSalary',
      'socialSecurity',
      'isCoworker',
      'startDate',
      'role',
      'status',
    ] as const

    for (const key of allowedFields) {
      if (key in body) data[key] = body[key]
    }

    if (id === session.user.id) {
      delete data.role
      delete data.status
    }

    if (data.startDate) data.startDate = new Date(data.startDate as string)

    const user = await prisma.user.update({ where: { id }, data })
    return NextResponse.json({ user })
  } catch (err) {
    return apiError(err)
  }
}
