import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireActivePortalSession } from '@/lib/portal-session-guard'
import { resolveClientUserIdForPortal } from '@/lib/client-message-access'

export async function GET(req: NextRequest) {
  const portal = await requireActivePortalSession(req)
  if (!portal.ok) {
    return NextResponse.json({ error: portal.error }, { status: portal.status })
  }

  const clientUserId = await resolveClientUserIdForPortal(
    portal.session.email,
    portal.session.clientCompanyId,
  )
  if (!clientUserId) return NextResponse.json([])

  const docs = await prisma.caseDocument.findMany({
    where: { clientId: clientUserId, status: 'ACTIVE' },
    include: {
      files:      { orderBy: { version: 'desc' } },
      signatures: { select: { signerName: true, signerRole: true, signedAt: true, signatureType: true, typedName: true, signatureUrl: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(docs)
}
