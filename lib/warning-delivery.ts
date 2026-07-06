import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { pushLineMessages } from '@/lib/line-api'
import { generateWarningPdfBuffer } from '@/lib/warning-pdf-generate'
import { storeWarningPdfBuffer, warningHasPdf } from '@/lib/warning-pdf'
import {
  createWarningPdfAccessToken,
  warningPdfSignedUrl,
} from '@/lib/warning-pdf-access'
import { validateAppBaseUrl } from '@/lib/payslip-pdf-access'

export type LineDeliveryStatus = 'pending' | 'sent' | 'failed'

export type WarningDeliveryResult = {
  ok: boolean
  lineDeliveryStatus: LineDeliveryStatus
  fileUrl: string | null
  signedPdfUrl: string | null
  lineUserId: string | null
  lineErrorMessage: string | null
  lineSentAt: string | null
}

const LINE_RETRY = 3
const RETRY_DELAY_MS = 1200

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function ensureWarningPdfStored(
  warningId: string,
): Promise<{ fileUrl: string } | null> {
  const warning = await prisma.warning.findUnique({
    where: { id: warningId },
    include: {
      user: {
        select: {
          name: true,
          employeeId: true,
          department: true,
        },
      },
      issuedBy: { select: { name: true } },
    },
  })
  if (!warning) return null

  if (warningHasPdf(warning.fileUrl)) {
    return { fileUrl: warning.fileUrl! }
  }

  const priorCount = await prisma.warning.count({
    where: {
      userId: warning.userId,
      createdAt: { lte: warning.createdAt },
    },
  })

  const settings = await prisma.companySettings.findUnique({
    where: { id: 'singleton' },
    select: { companyName: true },
  })
  const companyName = settings?.companyName ?? 'บริษัท'

  const buffer = await generateWarningPdfBuffer({
    companyName,
    employeeName: warning.user.name,
    employeeId: warning.user.employeeId,
    department: warning.user.department,
    warningNumber: priorCount,
    level: warning.level,
    reason: warning.reason,
    description: warning.description,
    issuedAt: warning.createdAt,
    issuedByName: warning.issuedBy.name,
  })

  const stored = await storeWarningPdfBuffer(warningId, warning.userId, buffer)
  await prisma.warning.update({
    where: { id: warningId },
    data: { fileUrl: stored.fileUrl, pdfBase64: stored.pdfBase64 },
  })

  return { fileUrl: stored.fileUrl }
}

function buildWarningLineFlex(params: {
  employeeName: string
  issuedAt: Date
  reason: string
  pdfUrl: string
}) {
  const dateStr = params.issuedAt.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return {
    type: 'flex',
    altText: 'แจ้งเตือนเอกสารใบเตือนพนักงาน',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#22c55e',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: 'แจ้งเตือนเอกสารใบเตือนพนักงาน',
            color: '#ffffff',
            weight: 'bold',
            size: 'md',
            wrap: true,
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: `ชื่อพนักงาน: ${params.employeeName}`,
            wrap: true,
            size: 'sm',
          },
          {
            type: 'text',
            text: `วันที่ออกใบเตือน: ${dateStr}`,
            wrap: true,
            size: 'sm',
            color: '#64748b',
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'text',
            text: `สาเหตุ: ${params.reason}`,
            wrap: true,
            size: 'sm',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#16a34a',
            action: {
              type: 'uri',
              label: 'เปิดเอกสาร PDF',
              uri: params.pdfUrl,
            },
          },
        ],
      },
    },
  }
}

async function pushLineWithRetry(
  lineUserId: string,
  messages: object[],
): Promise<{ ok: boolean; error?: string }> {
  let lastErr = 'ส่ง LINE ไม่สำเร็จ'
  for (let i = 0; i < LINE_RETRY; i++) {
    const result = await pushLineMessages(lineUserId, messages)
    if (result.ok) return { ok: true }
    lastErr = result.error ?? lastErr
    if (i < LINE_RETRY - 1) await sleep(RETRY_DELAY_MS)
  }
  console.error('[warning-line]', lineUserId, lastErr)
  return { ok: false, error: lastErr }
}

export async function deliverWarningToEmployee(
  warningId: string,
  options?: { warningNumber?: number },
): Promise<WarningDeliveryResult> {
  await prisma.warning.update({
    where: { id: warningId },
    data: { lineDeliveryStatus: 'pending', lineErrorMessage: null },
  })

  try {
    const pdf = await ensureWarningPdfStored(warningId)
    if (!pdf?.fileUrl) {
      throw new Error('สร้าง PDF ไม่สำเร็จ')
    }

    const warning = await prisma.warning.findUnique({
      where: { id: warningId },
      include: {
        user: {
          select: { name: true, lineUserId: true },
        },
      },
    })
    if (!warning) throw new Error('ไม่พบใบเตือน')

    const ordinal =
      options?.warningNumber ??
      (await prisma.warning.count({
        where: { userId: warning.userId, createdAt: { lte: warning.createdAt } },
      }))

    const title = `ได้รับใบเตือน (ครั้งที่ ${ordinal})`
    await createNotification({
      userId: warning.userId,
      type: 'WARNING_ISSUED',
      title,
      message: warning.reason,
      link: '/warnings',
    })

    const lineUserId = warning.user.lineUserId
    if (!lineUserId) {
      const msg = 'พนักงานยังไม่ผูก LINE OA — ให้เชื่อมที่โปรไฟล์'
      await prisma.warning.update({
        where: { id: warningId },
        data: {
          lineDeliveryStatus: 'failed',
          lineErrorMessage: msg,
          lineUserId: null,
          sentToLine: false,
        },
      })
      return {
        ok: false,
        lineDeliveryStatus: 'failed',
        fileUrl: pdf.fileUrl,
        signedPdfUrl: null,
        lineUserId: null,
        lineErrorMessage: msg,
        lineSentAt: null,
      }
    }

    const baseCheck = validateAppBaseUrl()
    if (!baseCheck.ok) {
      throw new Error(baseCheck.error)
    }
    const accessToken = await createWarningPdfAccessToken(warningId)
    const signedPdfUrl = warningPdfSignedUrl(warningId, baseCheck.url, accessToken)

    const flex = buildWarningLineFlex({
      employeeName: warning.user.name,
      issuedAt: warning.createdAt,
      reason: warning.reason,
      pdfUrl: signedPdfUrl,
    })

    const push = await pushLineWithRetry(lineUserId, [flex])
    const sentAt = new Date()

    await prisma.warning.update({
      where: { id: warningId },
      data: {
        lineDeliveryStatus: push.ok ? 'sent' : 'failed',
        lineSentAt: push.ok ? sentAt : null,
        lineUserId,
        lineErrorMessage: push.ok ? null : push.error ?? 'ส่ง LINE ไม่สำเร็จ',
        sentToLine: push.ok,
      },
    })

    return {
      ok: push.ok,
      lineDeliveryStatus: push.ok ? 'sent' : 'failed',
      fileUrl: pdf.fileUrl,
      signedPdfUrl,
      lineUserId,
      lineErrorMessage: push.ok ? null : push.error ?? null,
      lineSentAt: push.ok ? sentAt.toISOString() : null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ส่งใบเตือนไม่สำเร็จ'
    console.error('[warning-delivery]', warningId, msg)
    await prisma.warning.update({
      where: { id: warningId },
      data: {
        lineDeliveryStatus: 'failed',
        lineErrorMessage: msg,
        sentToLine: false,
      },
    })
    return {
      ok: false,
      lineDeliveryStatus: 'failed',
      fileUrl: null,
      signedPdfUrl: null,
      lineUserId: null,
      lineErrorMessage: msg,
      lineSentAt: null,
    }
  }
}
