import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const payment = await prisma.recoveryPayment.findUnique({ where: { id } })
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only collector or manager can upload proof
  const isMgr = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER'].includes(session.user.role)
  if (payment.collectorId !== session.user.id && !isMgr) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  configureCloudinary()
  const buf    = Buffer.from(await file.arrayBuffer())
  const b64    = `data:${file.type};base64,${buf.toString('base64')}`
  const result = await cloudinary.uploader.upload(b64, {
    folder:        'hrflow/recovery-proofs',
    resource_type: 'auto',
  })

  // Delete old proof if exists
  if (payment.proofPublicId) {
    await cloudinary.uploader.destroy(payment.proofPublicId, { resource_type: 'auto' }).catch(() => {})
  }

  const updated = await prisma.recoveryPayment.update({
    where: { id },
    data: {
      proofUrl:      result.secure_url,
      proofPublicId: result.public_id,
    },
  })

  return NextResponse.json({ proofUrl: updated.proofUrl })
}
