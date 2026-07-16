import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { apiError } from '@/lib/api-handler'

const userSel = { id: true, name: true, department: true, role: true }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id }     = await params
  const { status, note } = await req.json()

  const validStatuses = ['PENDING', 'KEPT', 'MISSED', 'CANCELLED']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const appt = await prisma.paymentAppointment.findUnique({
    where: { id },
    include: { debtor: true },
  })
  if (!appt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only touch `note` when the caller actually sent one — falling back to the
  // just-read `appt.note` here would overwrite the field with a stale value on
  // every status-only update, silently reverting a concurrently-saved note.
  const updateData: Record<string, unknown> = { status }
  if (note) updateData.note = note

  const updated = await prisma.paymentAppointment.update({
    where: { id },
    data:  updateData,
    include: {
      debtor:    { select: { id: true, debtorNumber: true, firstName: true, lastName: true, assignedToId: true } },
      createdBy: { select: userSel },
    },
  })

  // Notify assignee if appointment missed
  if (status === 'MISSED' && appt.debtor.assignedToId) {
    void createNotification({
      userId:  appt.debtor.assignedToId,
      type:    'DEBT_APPOINTMENT_MISSED',
      title:   'ลูกหนี้ผิดนัดชำระ',
      message: `${appt.debtor.firstName} ${appt.debtor.lastName} — นัด ${appt.appointDate.toLocaleDateString('th-TH')} ฿${appt.agreedAmount.toLocaleString('th-TH')}`,
    })
  }

  return NextResponse.json(updated)
} catch (err) {
  return apiError(err)
 }
}
