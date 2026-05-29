import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError, runNotify } from '@/lib/api-handler'
import { createAuditLog } from '@/lib/notifications'
import { snapshotProfileForAudit } from '@/lib/profile-history'
import { splitDisplayName } from '@/lib/profile-name'
import { isAvatarFile, storeProfileAvatar } from '@/lib/profile-avatar'
import { ROLE_LABELS } from '@/lib/permissions'
import { assertLineFieldsUnique, parseLineFields } from '@/lib/line-profile'
import { parseSelfProfileInput, SELF_PROFILE_FORBIDDEN } from '@/lib/profile-update'

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
  lineUserId: string | null
  lineDisplayName: string | null
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
    lineUserId: u.lineUserId ?? '',
    lineDisplayName: u.lineDisplayName ?? '',
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
  lineUserId: true,
  lineDisplayName: true,
  createdAt: true,
} as const

function readProfileBody(
  contentType: string,
  formData: FormData | null,
  json: Record<string, unknown> | null,
) {
  const get = (key: string): string | undefined => {
    if (formData) {
      const v = formData.get(key)
      if (v == null) return undefined
      return String(v)
    }
    if (json && key in json) return String(json[key] ?? '')
    return undefined
  }
  return {
    prefix: get('prefix'),
    firstName: get('firstName'),
    lastName: get('lastName'),
    nickname: get('nickname'),
    phone: get('phone'),
    email: get('email'),
    address: get('address'),
    lineId: get('lineId'),
    birthDate: get('birthDate'),
    nationalId: get('nationalId'),
    avatarFile:
      formData && (formData.get('avatar') as File | null)?.size
        ? (formData.get('avatar') as File)
        : null,
  }
}

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
    let formData: FormData | null = null
    let json: Record<string, unknown> | null = null

    if (contentType.includes('multipart/form-data')) {
      formData = await req.formData()
    } else {
      json = (await req.json()) as Record<string, unknown>
      for (const key of Object.keys(json)) {
        if (SELF_PROFILE_FORBIDDEN.has(key)) {
          return NextResponse.json(
            { error: 'ไม่สามารถแก้ไขสิทธิ์หรือข้อมูลระบบได้ — ติดต่อ HR' },
            { status: 403 },
          )
        }
      }
    }

    const raw = readProfileBody(contentType, formData, json)
    const parsed = parseSelfProfileInput({
      prefix: raw.prefix,
      firstName: raw.firstName,
      lastName: raw.lastName,
      nickname: raw.nickname ?? null,
      phone: raw.phone,
      email: raw.email,
      address: raw.address ?? null,
      birthDate: raw.birthDate ?? null,
      nationalId: raw.nationalId ?? null,
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const lineParsed = parseLineFields(
      { lineId: raw.lineId },
      { requireLineId: true, allowUserId: false, allowDisplayName: false },
    )
    if (!lineParsed.ok) {
      return NextResponse.json({ error: lineParsed.error }, { status: 400 })
    }
    const lineUnique = await assertLineFieldsUnique(lineParsed, session.user.id)
    if (!lineUnique.ok) {
      return NextResponse.json({ error: lineUnique.error }, { status: 409 })
    }

    const dupPhone = await prisma.user.findFirst({
      where: { phone: parsed.data.phone, NOT: { id: session.user.id } },
    })
    if (dupPhone) {
      return NextResponse.json({ error: 'เบอร์โทรนี้มีในระบบแล้ว' }, { status: 409 })
    }

    const dupEmail = await prisma.user.findFirst({
      where: { email: parsed.data.email, NOT: { id: session.user.id } },
    })
    if (dupEmail) {
      return NextResponse.json({ error: 'อีเมลนี้มีในระบบแล้ว' }, { status: 409 })
    }

    if (parsed.data.nationalId) {
      const dupId = await prisma.user.findFirst({
        where: { nationalId: parsed.data.nationalId, NOT: { id: session.user.id } },
      })
      if (dupId) {
        return NextResponse.json({ error: 'เลขบัตรประชาชนนี้มีในระบบแล้ว' }, { status: 409 })
      }
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      lineId: lineParsed.lineId,
    }

    if (raw.avatarFile) {
      if (!isAvatarFile(raw.avatarFile)) {
        return NextResponse.json({ error: 'รองรับเฉพาะรูป JPG, PNG, WEBP' }, { status: 400 })
      }
      try {
        const stored = await storeProfileAvatar(session.user.id, raw.avatarFile)
        if (!stored) {
          return NextResponse.json({ error: 'บันทึกรูปโปรไฟล์ไม่สำเร็จ' }, { status: 500 })
        }
        updateData.profileImage = stored.profileImage
        updateData.profileImageBase64 = null
        updateData.profileCloudinaryPublicId = stored.profileCloudinaryPublicId
        updateData.profileSecureUrl = stored.profileSecureUrl
      } catch (e) {
        if (e instanceof Error && e.message === 'AVATAR_TOO_LARGE') {
          return NextResponse.json({ error: 'รูปต้องไม่เกิน 2 MB' }, { status: 400 })
        }
        if (e instanceof Error && e.message === 'CLOUDINARY_NOT_CONFIGURED') {
          return NextResponse.json({ error: 'ระบบจัดเก็บรูปยังไม่พร้อม — ติดต่อ IT' }, { status: 503 })
        }
        throw e
      }
    }

    const beforeAudit = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        phone: true,
        name: true,
        prefix: true,
        nickname: true,
        address: true,
        birthDate: true,
        nationalId: true,
        lineId: true,
        profileImage: true,
      },
    })

    let user
    try {
      user = await prisma.user.update({
        where: { id: session.user.id },
        data: updateData,
        select: PROFILE_SELECT,
      })
    } catch (updateErr) {
      throw updateErr
    }

    if (beforeAudit) {
      const afterSnap = snapshotProfileForAudit(user)
      const beforeSnap = snapshotProfileForAudit(beforeAudit)
      if (JSON.stringify(beforeSnap) !== JSON.stringify(afterSnap)) {
        await runNotify(() =>
          createAuditLog({
            actorId: session.user.id,
            targetId: session.user.id,
            targetType: 'UserProfile',
            action: 'UPDATE',
            before: beforeSnap,
            after: afterSnap,
          }),
        )
      }
    }

    return NextResponse.json({ profile: serializeUser(user), message: 'บันทึกโปรไฟล์แล้ว' })
  } catch (err) {
    return apiError(err)
  }
}
