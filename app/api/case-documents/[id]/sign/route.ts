import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

function configureCloudinary() {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const key  = process.env.CLOUDINARY_API_KEY?.trim()
  const sec  = process.env.CLOUDINARY_API_SECRET?.trim()
  if (name && key && sec) cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true })
}

const CAN_SIGN = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'MANAGER', 'TEAM_LEADER']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CAN_SIGN.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden: insufficient role to sign' }, { status: 403 })
  }

  const { id: documentId } = await params
  const doc = await prisma.caseDocument.findUnique({ where: { id: documentId } })
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const body = await req.json()
  const { signatureType, typedName, signatureData, signerPosition } = body
  // signatureType: 'TYPED' | 'DRAWN' | 'UPLOADED'
  // signatureData: base64 data URL (for DRAWN) or already uploaded URL (UPLOADED)
  // typedName: string (for TYPED)

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, role: true, position: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  let signatureUrl: string | null = null

  if (signatureType === 'DRAWN' && signatureData) {
    configureCloudinary()
    // Upload drawn signature (base64) to Cloudinary
    const result = await cloudinary.uploader.upload(signatureData, {
      folder:          'hr-system/signatures',
      resource_type:   'image',
      public_id:       `sig_${documentId}_${session.user.id}_${Date.now()}`,
      allowed_formats: ['png', 'jpg', 'jpeg'],
    })
    signatureUrl = result.secure_url
  } else if (signatureType === 'UPLOADED' && signatureData) {
    signatureUrl = signatureData
  }

  const existing = await prisma.caseDocumentSignature.findFirst({
    where: { documentId, signedById: session.user.id },
  })
  if (existing) {
    return NextResponse.json({ error: 'You have already signed this document' }, { status: 409 })
  }

  const sig = await prisma.caseDocumentSignature.create({
    data: {
      documentId,
      signedById:     session.user.id,
      signerName:     user.name,
      signerRole:     user.role,
      signerPosition: signerPosition ?? user.position ?? null,
      signatureType:  signatureType ?? 'TYPED',
      signatureData:  signatureType === 'DRAWN' ? signatureData : null,
      signatureUrl,
      typedName:      typedName ?? null,
    },
  })

  // Version history
  const lastVer = await prisma.caseDocumentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
  })
  await prisma.caseDocumentVersion.create({
    data: {
      documentId,
      versionNumber: (lastVer?.versionNumber ?? 0) + 1,
      changeNote:    `ลงลายมือชื่อโดย ${user.name} (${signatureType})`,
      changedById:   session.user.id,
      changedByName: user.name,
    },
  })

  await prisma.caseDocument.update({ where: { id: documentId }, data: { updatedAt: new Date() } })

  return NextResponse.json(sig, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: documentId } = await params
  const { signatureId } = await req.json()
  if (!signatureId) return NextResponse.json({ error: 'signatureId required' }, { status: 400 })

  const sig = await prisma.caseDocumentSignature.findUnique({ where: { id: signatureId } })
  if (!sig || sig.documentId !== documentId) {
    return NextResponse.json({ error: 'Signature not found' }, { status: 404 })
  }

  // Only own signature or super-admin can remove
  const canRemove = sig.signedById === session.user.id || session.user.role === 'SUPER_ADMIN'
  if (!canRemove) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (sig.signatureUrl && sig.signatureType === 'DRAWN') {
    configureCloudinary()
    try {
      const publicId = sig.signatureUrl.split('/upload/')[1]?.replace(/\.[^.]+$/, '')
      if (publicId) await cloudinary.uploader.destroy(publicId)
    } catch { /* best-effort */ }
  }

  await prisma.caseDocumentSignature.delete({ where: { id: signatureId } })
  return NextResponse.json({ ok: true })
}
