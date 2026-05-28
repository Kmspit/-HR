import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolvePostLoginPath } from '@/lib/post-login-path'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

/** สำรอง — redirect หลังล็อกอิน (หลักใช้ url จาก POST /api/auth/login) */
export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin
  try {
    await ensureDbSchema().catch(() => {})
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
  } catch (err) {
    console.error('[post-login]', err)
    return NextResponse.redirect(new URL('/dashboard', base))
  }
}
