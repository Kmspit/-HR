import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireActivePortalSession } from '@/lib/portal-session-guard'

export async function GET(req: NextRequest) {
  const portal = await requireActivePortalSession(req)
  if (!portal.ok) {
    return NextResponse.json({ error: portal.error }, { status: portal.status })
  }

  const user = await prisma.clientPortalUser.findUnique({
    where:  { id: portal.session.portalUserId },
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
