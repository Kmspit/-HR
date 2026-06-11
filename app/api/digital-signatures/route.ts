import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'
import { headers } from 'next/headers'

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const docType = req.nextUrl.searchParams.get('docType')
  const docId   = req.nextUrl.searchParams.get('docId')
  if (!docType || !docId) {
    return NextResponse.json({ error: 'docType and docId are required' }, { status: 400 })
  }

  const signatures = await prisma.digitalSignature.findMany({
    where: { docType, docId },
    include: { signedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { signedAt: 'asc' },
  })
  return NextResponse.json(signatures)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hdrs      = await headers()
  const ip        = hdrs.get('x-forwarded-for') ?? 'unknown'
  const userAgent = hdrs.get('user-agent') ?? undefined
  const contentType = req.headers.get('content-type') ?? ''

  let signatureData: string | null = null
  let signatureUrl:  string | null = null
  let docType: string, docId: string, signatureType: string, typedName: string | null

  if (contentType.includes('multipart/form-data')) {
    const fd  = await req.formData()
    docType       = fd.get('docType')       as string
    docId         = fd.get('docId')         as string
    signatureType = fd.get('signatureType') as string ?? 'UPLOAD'
    typedName     = fd.get('typedName')     as string | null

    const file = fd.get('file') as File | null
    if (file && file.size > 0) {
      configureCloudinary()
      const buf = Buffer.from(await file.arrayBuffer())
      const uploaded = await new Promise<{ secure_url: string }>((res, rej) => {
        cloudinary.uploader.upload_stream(
          { folder: 'digital-signatures', resource_type: 'image' },
          (err, result) => err ? rej(err) : res(result as { secure_url: string })
        ).end(buf)
      })
      signatureUrl = uploaded.secure_url
    }
  } else {
    const body    = await req.json()
    docType       = body.docType
    docId         = body.docId
    signatureType = body.signatureType ?? 'TYPED'
    typedName     = body.typedName ?? null
    signatureData = body.signatureData ?? null
  }

  if (!docType || !docId) {
    return NextResponse.json({ error: 'docType and docId are required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, role: true, position: true },
  })

  const sig = await prisma.digitalSignature.create({
    data: {
      signedById:     session.user.id,
      signerName:     user?.name ?? session.user.name ?? '',
      signerPosition: user?.position ?? null,
      signerRole:     user?.role ?? session.user.role,
      signatureType,
      signatureData:  signatureData ?? null,
      signatureUrl:   signatureUrl  ?? null,
      typedName:      typedName     ?? null,
      docType,
      docId,
      ip,
      userAgent:      userAgent ?? null,
    },
  })

  // Write activity log
  await prisma.activityLog.create({
    data: {
      actorId:   session.user.id,
      actorName: user?.name ?? '',
      docType,
      docId,
      action:   'SIGNED',
      detail:   `ลงนามโดย ${user?.name ?? ''} (${signatureType})`,
      ip,
      userAgent: userAgent ?? null,
    },
  })

  return NextResponse.json(sig, { status: 201 })
}
