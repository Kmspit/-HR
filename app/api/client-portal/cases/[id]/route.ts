import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const clientId = session.user.id

  const task = await prisma.taskAssignment.findUnique({
    where: { id },
    include: {
      assignee:    { select: { id: true, name: true, position: true, phone: true } },
      assignedBy:  { select: { id: true, name: true } },
      attachments: { orderBy: { createdAt: 'desc' } },
      statusHistories: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Strict: only the linked client can view
  if (task.clientId !== clientId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Related documents
  const docs = await prisma.caseDocument.findMany({
    where: { OR: [{ clientId }, { taskId: id }], status: 'ACTIVE' },
    include: {
      files: { orderBy: { version: 'desc' }, take: 1 },
      signatures: { select: { signerName: true, signerRole: true, signedAt: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ task, docs })
}
