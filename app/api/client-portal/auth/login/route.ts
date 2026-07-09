import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signPortalToken, portalCookieOptions } from '@/lib/portal-auth'
import { rateLimit } from '@/lib/rate-limit'
import { assertEnglishCredential } from '@/lib/english-input'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await rateLimit(`cp-login:${ip}`, 10, 15 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json({ error: 'ลองใหม่ภายหลัง' }, { status: 429 })
  }

  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, { status: 400 })
  }

  const emailNorm = String(email).trim().toLowerCase()
  const emailErr = assertEnglishCredential(emailNorm, 'email')
  const pwErr = assertEnglishCredential(String(password), 'password')
  if (emailErr || pwErr) {
    return NextResponse.json({ error: emailErr ?? pwErr }, { status: 400 })
  }

  const user = await prisma.clientPortalUser.findUnique({
    where: { email: emailNorm },
    include: { clientCompany: { select: { id: true, companyName: true, status: true } } },
  })

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  }

  if (user.clientCompany.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'บัญชีบริษัทถูกระงับ' }, { status: 403 })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  }

  // Update last login
  await prisma.clientPortalUser.update({
    where: { id: user.id },
    data:  { lastLoginAt: new Date() },
  })

  // Audit log
  void prisma.clientPortalLog.create({
    data: {
      portalUserId: user.id,
      action:       'LOGIN',
      ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
      userAgent:    req.headers.get('user-agent') ?? undefined,
    },
  }).catch(() => undefined)

  const token = await signPortalToken({
    portalUserId:    user.id,
    clientCompanyId: user.clientCompanyId,
    email:           user.email,
    fullName:        user.fullName,
  })

  const res = NextResponse.json({
    ok:          true,
    fullName:    user.fullName,
    companyName: user.clientCompany.companyName,
  })

  const { name, ...cookieOpts } = portalCookieOptions()
  res.cookies.set(name, token, cookieOpts)
  return res
}
