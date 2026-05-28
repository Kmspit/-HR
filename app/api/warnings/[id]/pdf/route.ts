import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { readFile } from 'fs/promises'
import path from 'path'

function pdfHeaders(filename: string, download: boolean) {
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': download
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  }
}

async function loadWarningPdfBuffer(warning: {
  pdfBase64: string | null
  fileUrl: string | null
}): Promise<Buffer | null> {
  if (warning.pdfBase64) {
    return Buffer.from(warning.pdfBase64, 'base64')
  }

  if (warning.fileUrl?.startsWith('/uploads/')) {
    try {
      const diskPath = path.join(process.cwd(), 'public', warning.fileUrl)
      return await readFile(diskPath)
    } catch {
      return null
    }
  }

  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const warning = await prisma.warning.findUnique({
      where: { id },
      select: { userId: true, pdfBase64: true, fileUrl: true },
    })
    if (!warning) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
    if (!isManager && warning.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const buffer = await loadWarningPdfBuffer(warning)
    if (!buffer?.length) {
      return NextResponse.json({ error: 'No PDF' }, { status: 404 })
    }

    const download = req.nextUrl.searchParams.get('download') === '1'
    const filename = `warning-${id}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      headers: pdfHeaders(filename, download),
    })
  } catch (err) {
    return apiError(err)
  }
}
