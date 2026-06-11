import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clientId = session.user.id

  const docs = await prisma.caseDocument.findMany({
    where: { clientId, status: 'ACTIVE' },
    include: {
      files:      { orderBy: { version: 'desc' } },
      signatures: { select: { signerName: true, signerRole: true, signedAt: true, signatureType: true, typedName: true, signatureUrl: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(docs)
}
