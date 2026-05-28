import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolvePostLoginPath } from '@/lib/post-login-path'

/** ปลายทางหลังล็อกอิน (JSON — สำรอง) */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ path: '/login' })
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
    return NextResponse.json({ path: '/login' })
  }

  const { path, message } = resolvePostLoginPath(dbUser)
  return NextResponse.json({ path, message })
}
