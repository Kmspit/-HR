import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolvePostLoginPath } from '@/lib/post-login-path'

/**
 * หลังล็อกอิน — redirect ฝั่งเซิร์ฟเวอร์ (อ่าน cookie ได้แน่นอนบน PC)
 * ใช้: window.location.href = '/api/auth/post-login' หลัง signIn สำเร็จ
 */
export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin
  const session = await auth()

  if (!session?.user?.id) {
    const url = new URL('/login', base)
    url.searchParams.set('error', 'SessionRequired')
    return NextResponse.redirect(url)
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      status: true,
      divisionId: true,
      departmentId: true,
      sectionId: true,
    },
  })

  if (!dbUser) {
    return NextResponse.redirect(new URL('/login', base))
  }

  const { path } = resolvePostLoginPath(dbUser)
  return NextResponse.redirect(new URL(path, base))
}
