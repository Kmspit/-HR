import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
  if (!settings) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Don't expose secrets in GET for non-admins
  return NextResponse.json({ settings })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  const settings = await prisma.companySettings.upsert({
    where: { id: 'singleton' },
    update: body,
    create: { id: 'singleton', ...body },
  })

  return NextResponse.json({ settings })
}
