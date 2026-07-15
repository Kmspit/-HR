import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'
import { apiError } from '@/lib/api-handler'

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const claim  = await prisma.expenseClaim.findUnique({ where: { id } })
  if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (claim.submittedById !== session.user.id && !['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

  configureCloudinary()
  const result = await cloudinary.uploader.upload(base64, {
    folder:   'expense-claims',
    resource_type: 'auto',
  })

  const saved = await prisma.expenseClaimFile.create({
    data: {
      claimId:  id,
      url:      result.secure_url,
      publicId: result.public_id,
      filename: file.name,
      fileType: file.type,
      size:     file.size,
    },
  })

  return NextResponse.json(saved, { status: 201 })
 } catch (err) {
  return apiError(err)
 }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id }   = await params
  const { fileId } = await req.json()
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  const file = await prisma.expenseClaimFile.findUnique({ where: { id: fileId } })
  if (!file || file.claimId !== id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (file.publicId) {
    configureCloudinary()
    after(() => { cloudinary.uploader.destroy(file.publicId, { resource_type: 'auto' }).catch(() => {}) })
  }
  await prisma.expenseClaimFile.delete({ where: { id: fileId } })
  return NextResponse.json({ ok: true })
 } catch (err) {
  return apiError(err)
 }
}
