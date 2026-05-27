import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { saveUpload } from '@/lib/save-upload'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  _req: NextRequest,
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

    if (warning.pdfBase64) {
      const buffer = Buffer.from(warning.pdfBase64, 'base64')
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="warning-${id}.pdf"`,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    if (warning.fileUrl?.startsWith('/uploads/')) {
      try {
        const diskPath = path.join(process.cwd(), 'public', warning.fileUrl)
        const buffer = await readFile(diskPath)
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="warning-${id}.pdf"`,
          },
        })
      } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
    }

    return NextResponse.json({ error: 'No PDF' }, { status: 404 })
  } catch (err) {
    return apiError(err)
  }
}
