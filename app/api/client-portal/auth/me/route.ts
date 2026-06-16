import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const session = await getPortalSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.clientPortalUser.findUnique({
    where:  { id: session.portalUserId },
    select: {
      id:          true,
      email:       true,
      fullName:    true,
      phone:       true,
      isActive:    true,
      lastLoginAt: true,
      clientCompany: {
        select: { id: true, companyName: true, taxId: true, status: true, email: true },
      },
    },
  })

  if (!user || !user.isActive) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({ user })
}
