import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { splitDisplayName, buildDisplayName } from '@/lib/profile-name'
import { isAvatarFile, storeProfileAvatar } from '@/lib/profile-avatar'
import { ROLE_LABELS } from '@/lib/permissions'

function formatDate(d: Date | null | undefined) {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

function serializeUser(u: {
  id: string
  email: string
  employeeId: string | null
  name: string
  prefix: string | null
  nickname: string | null
  phone: string | null
  birthDate: Date | null
  address: string | null
  nationalId: string | null
  profileImage: string | null
  role: string
  status: string
  department: string | null
  position: string | null
  baseSalary: number | null
  startDate: Date | null
  socialSecurity: boolean
  lineId: string | null
  createdAt: Date
}) {
  const { prefix, firstName, lastName } = splitDisplayName(u.name, u.prefix)
  return {
    id: u.id,
    email: u.email,
    employeeId: u.employeeId ?? '',
    name: u.name,
    prefix,
    firstName,
    lastName,
    nickname: u.nickname ?? '',
    phone: u.phone ?? '',
    birthDate: formatDate(u.birthDate),
    address: u.address ?? '',
    nationalId: u.nationalId ?? '',
    profileImage: u.profileImage,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role as keyof typeof ROLE_LABELS],
    status: u.status,
    department: u.department ?? '',
    position: u.position ?? '',
    baseSalary: u.baseSalary,
    startDate: formatDate(u.startDate),
    socialSecurity: u.socialSecurity,
    lineId: u.lineId ?? '',
    createdAt: u.createdAt.toISOString(),
  }
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  employeeId: true,
  name: true,
  prefix: true,
  nickname: true,
  phone: true,
  birthDate: true,
  address: true,
  nationalId: true,
  profileImage: true,
  role: true,
  status: true,
  department: true,
  position: true,
  baseSalary: true,
  startDate: true,
  socialSecurity: true,
  lineId: true,
  createdAt: true,
} as const

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: PROFILE_SELECT,
    })
    if (!user) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    }

    return NextResponse.json({ profile: serializeUser(user) })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = req.headers.get('content-type') ?? ''
    let prefix: string
    let firstName: string
    let lastName: string
    let nickname: string | null
    let phone: string
    let address: string | null
    let avatarFile: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      prefix = (formData.get('prefix') as string) || 'นาย'
      firstName = (formData.get('firstName') as string) || ''
      lastName = (formData.get('lastName') as string) || ''
      nickname = (formData.get('nickname') as string) || null
      phone = (formData.get('phone') as string) || ''
      address = (formData.get('address') as string) || null
      const file = formData.get('avatar') as File | null
      if (file && file.size > 0) avatarFile = file
    } else {
      const body = await req.json()
      prefix = body.prefix ?? 'นาย'
      firstName = body.firstName ?? ''
      lastName = body.lastName ?? ''
      nickname = body.nickname ?? null
      phone = body.phone ?? ''
      address = body.address ?? null
    }

    if (!firstName.trim() || !lastName.trim()) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อและนามสกุล' }, { status: 400 })
    }

    const phoneNorm = phone.replace(/\D/g, '')
    if (!/^0[0-9]{9}$/.test(phoneNorm)) {
      return NextResponse.json({ error: 'เบอร์โทรต้อง 10 หลัก' }, { status: 400 })
    }

    const dupPhone = await prisma.user.findFirst({
      where: { phone: phoneNorm, NOT: { id: session.user.id } },
    })
    if (dupPhone) {
      return NextResponse.json({ error: 'เบอร์โทรนี้มีในระบบแล้ว' }, { status: 409 })
    }

    const updateData: {
      name: string
      prefix: string
      nickname: string | null
      phone: string
      address: string | null
      profileImage?: string
      profileImageBase64?: string | null
    } = {
      name: buildDisplayName(prefix, firstName, lastName),
      prefix: prefix.trim(),
      nickname: nickname?.trim() || null,
      phone: phoneNorm,
      address: address?.trim() || null,
    }

    if (avatarFile) {
      if (!isAvatarFile(avatarFile)) {
        return NextResponse.json({ error: 'รองรับเฉพาะรูป JPG, PNG, WEBP' }, { status: 400 })
      }
      try {
        const stored = await storeProfileAvatar(session.user.id, avatarFile)
        if (!stored) {
          return NextResponse.json({ error: 'บันทึกรูปโปรไฟล์ไม่สำเร็จ' }, { status: 500 })
        }
        updateData.profileImage = stored.profileImage
        updateData.profileImageBase64 = stored.profileImageBase64
      } catch (e) {
        if (e instanceof Error && e.message === 'AVATAR_TOO_LARGE') {
          return NextResponse.json({ error: 'รูปต้องไม่เกิน 2 MB' }, { status: 400 })
        }
        throw e
      }
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: PROFILE_SELECT,
    })

    return NextResponse.json({ profile: serializeUser(user), message: 'บันทึกโปรไฟล์แล้ว' })
  } catch (err) {
    return apiError(err)
  }
}
