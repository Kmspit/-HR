import { prisma } from '@/lib/prisma'
import { pushLineMessages } from '@/lib/line-api'
import { buildPayrollSlipPdfBuffer } from '@/lib/payslip-pdf-service'
import { encryptPayslipPdfBuffer, nationalIdPdfPassword } from '@/lib/payslip-pdf-encrypt'
import {
  isCloudinaryConfigured,
  loadUserImageContext,
  payslipFolder,
  uploadAuthenticatedPdf,
  deleteRawFile,
} from '@/lib/cloudinary-service'
import {
  assertLineFlexUriLength,
  createPayslipPdfAccessToken,
  payslipLinePdfUrl,
  validateAppBaseUrl,
} from '@/lib/payslip-pdf-access'

const MONTH_TH = [
  '',
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const DEFAULT_COMPANY = 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด'
const PENDING_STALE_MS = 10 * 60 * 1000

export type PayslipLineSendResult = {
  payrollId: string
  userId: string
  name: string
  ok: boolean
  error?: string
  payslipSentAt?: string
  skipped?: boolean
}

function periodLabel(month: number, year: number): string {
  return `${MONTH_TH[month]} ${year + 543}`
}

function buildPayslipLineFlex(month: number, year: number, downloadUrl: string) {
  const period = periodLabel(month, year)
  return {
    type: 'flex',
    altText: `สลิปเงินเดือน ${period}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `📄 สลิปเงินเดือน ${period}`, weight: 'bold', wrap: true },
          { type: 'text', text: DEFAULT_COMPANY, size: 'sm', color: '#888888', wrap: true, margin: 'sm' },
          { type: 'text', text: 'กรุณากด Download เพื่อดูสลิป', size: 'sm', color: '#888888', wrap: true, margin: 'md' },
          {
            type: 'text',
            text: 'รหัส: เลขบัตรประชาชน 4 ตัวหลัง',
            size: 'sm',
            color: '#cc0000',
            wrap: true,
            margin: 'sm',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: 'Download สลิป PDF', uri: downloadUrl },
            style: 'primary',
          },
        ],
      },
    },
  }
}

async function markPayslipSendStatus(
  payrollId: string,
  status: 'SUCCESS' | 'FAILED' | 'PENDING',
  error?: string | null,
) {
  const now = status === 'SUCCESS' ? new Date() : undefined
  await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      payslipSentStatus: status,
      payslipSentVia: status === 'SUCCESS' ? 'LINE' : null,
      payslipSentAt: now ?? undefined,
      payslipSentError: error ?? null,
      ...(status === 'SUCCESS' ? { slipSentAt: now } : {}),
    },
  })
}

async function savePayslipCloudinaryPublicId(payrollId: string, publicId: string) {
  await prisma.payroll.update({
    where: { id: payrollId },
    data: { payslipCloudinaryPublicId: publicId },
  })
}

async function rollbackPayslipUpload(payrollId: string, publicId: string) {
  await deleteRawFile(publicId)
  await prisma.payroll.update({
    where: { id: payrollId },
    data: { payslipCloudinaryPublicId: null },
  })
}

/** ล็อกส่ง — ป้องกัน double-click; forceResend ข้าม PENDING ค้าง */
async function acquireSendLock(payrollId: string, forceResend?: boolean): Promise<boolean> {
  if (forceResend) {
    await prisma.payroll.updateMany({
      where: { id: payrollId },
      data: {
        payslipSentStatus: 'PENDING',
        payslipSentError: null,
      },
    })
    return true
  }

  const staleBefore = new Date(Date.now() - PENDING_STALE_MS)
  const result = await prisma.payroll.updateMany({
    where: {
      id: payrollId,
      OR: [
        { payslipSentStatus: null },
        { payslipSentStatus: { not: 'PENDING' } },
        { payslipSentStatus: 'PENDING', updatedAt: { lte: staleBefore } },
      ],
    },
    data: {
      payslipSentStatus: 'PENDING',
      payslipSentError: null,
      payslipSentVia: null,
    },
  })
  return result.count > 0
}

async function uploadEncryptedPayslipPdf(
  payrollId: string,
  userId: string,
  encrypted: Buffer,
  filename: string,
): Promise<{ ok: true; publicId: string } | { ok: false; error: string }> {
  if (!isCloudinaryConfigured()) {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า Cloudinary — ต้องมี CLOUDINARY_* บน Vercel' }
  }

  try {
    const ctx = await loadUserImageContext(userId)
    const folder = payslipFolder(ctx, payrollId)
    const uploaded = await uploadAuthenticatedPdf(encrypted, {
      folder,
      publicId: filename.replace(/\.pdf$/i, ''),
    })
    return { ok: true, publicId: uploaded.publicId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'อัปโหลด PDF ไม่สำเร็จ'
    console.error('[payslip-line] cloudinary upload', payrollId, message)
    return { ok: false, error: message }
  }
}

async function buildLineDownloadUrl(payrollId: string): Promise<string | null> {
  const baseCheck = validateAppBaseUrl()
  if (!baseCheck.ok) {
    console.error('[payslip-line]', baseCheck.error)
    return null
  }
  const token = await createPayslipPdfAccessToken(payrollId)
  const url = payslipLinePdfUrl(payrollId, baseCheck.url, token)
  return assertLineFlexUriLength(url) ? null : url
}

export type SendPayslipLineOptions = { forceResend?: boolean }

export async function sendPayslipViaLineForPayroll(
  payrollId: string,
  options?: SendPayslipLineOptions,
): Promise<PayslipLineSendResult> {
  const payroll = await prisma.payroll.findUnique({
    where: { id: payrollId },
    select: {
      id: true,
      userId: true,
      month: true,
      year: true,
      status: true,
      payslipSentStatus: true,
      user: {
        select: {
          id: true,
          name: true,
          nationalId: true,
          lineUserId: true,
        },
      },
    },
  })

  const base = {
    payrollId,
    userId: payroll?.userId ?? '',
    name: payroll?.user?.name ?? '',
    ok: false,
  }

  if (!payroll) {
    return { ...base, error: 'ไม่พบข้อมูล payroll' }
  }

  if (payroll.status !== 'APPROVED') {
    await markPayslipSendStatus(payrollId, 'FAILED', 'ต้องอนุมัติ payroll ก่อนส่งสลิป')
    return { ...base, userId: payroll.userId, name: payroll.user.name, error: 'ต้องอนุมัติ payroll ก่อนส่งสลิป' }
  }

  if (payroll.payslipSentStatus === 'SUCCESS' && !options?.forceResend) {
    return {
      ...base,
      userId: payroll.userId,
      name: payroll.user.name,
      skipped: true,
      error: 'ส่งสลิปสำเร็จแล้ว — ใช้ส่งซ้ำถ้าต้องการ',
    }
  }

  if (!payroll.user.lineUserId) {
    await markPayslipSendStatus(payrollId, 'FAILED', 'พนักงานยังไม่ได้เชื่อม LINE OA')
    return {
      ...base,
      userId: payroll.userId,
      name: payroll.user.name,
      error: 'พนักงานยังไม่ได้เชื่อม LINE OA',
    }
  }

  const password = nationalIdPdfPassword(payroll.user.nationalId)
  if (!password) {
    await markPayslipSendStatus(payrollId, 'FAILED', 'ไม่มีเลขบัตรประชาชน 4 ตัวท้ายสำหรับเข้ารหัส PDF')
    return {
      ...base,
      userId: payroll.userId,
      name: payroll.user.name,
      error: 'ไม่มีเลขบัตรประชาชน 4 ตัวท้ายสำหรับเข้ารหัส PDF',
    }
  }

  const locked = await acquireSendLock(payrollId, options?.forceResend)
  if (!locked) {
    return {
      ...base,
      userId: payroll.userId,
      name: payroll.user.name,
      error: 'กำลังส่งสลิปอยู่ กรุณารอสักครู่',
    }
  }

  let uploadedPublicId: string | null = null
  let linePushed = false

  try {
    const fullPayroll = await prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            department: true,
            position: true,
            branchId: true,
            nationalId: true,
            lineUserId: true,
          },
        },
      },
    })
    if (!fullPayroll) throw new Error('ไม่พบข้อมูล payroll')

    const { buffer, filename } = await buildPayrollSlipPdfBuffer(fullPayroll)
    const encrypted = await encryptPayslipPdfBuffer(buffer, password)

    const upload = await uploadEncryptedPayslipPdf(payrollId, payroll.userId, encrypted, filename)
    if (!upload.ok) {
      await markPayslipSendStatus(payrollId, 'FAILED', upload.error)
      return {
        ...base,
        userId: payroll.userId,
        name: payroll.user.name,
        error: upload.error,
      }
    }
    uploadedPublicId = upload.publicId
    await savePayslipCloudinaryPublicId(payrollId, upload.publicId)

    const downloadUrl = await buildLineDownloadUrl(payrollId)
    if (!downloadUrl) {
      const baseCheck = validateAppBaseUrl()
      const err = baseCheck.ok
        ? 'ลิงก์ดาวน์โหลดยาวเกินขีดจำกัด LINE'
        : baseCheck.error
      await rollbackPayslipUpload(payrollId, upload.publicId)
      await markPayslipSendStatus(payrollId, 'FAILED', err)
      return { ...base, userId: payroll.userId, name: payroll.user.name, error: err }
    }

    const flex = buildPayslipLineFlex(payroll.month, payroll.year, downloadUrl)
    const push = await pushLineMessages(payroll.user.lineUserId, [flex])

    if (!push.ok) {
      console.error('[payslip-line] LINE push failed', {
        payrollId,
        userId: payroll.userId,
        lineUserId: payroll.user.lineUserId,
        error: push.error,
      })
      await rollbackPayslipUpload(payrollId, upload.publicId)
      await markPayslipSendStatus(payrollId, 'FAILED', push.error ?? 'ส่ง LINE ไม่สำเร็จ')
      return {
        ...base,
        userId: payroll.userId,
        name: payroll.user.name,
        error: push.error ?? 'ส่ง LINE ไม่สำเร็จ',
      }
    }

    linePushed = true

    const sentAt = new Date()
    await prisma.payroll.update({
      where: { id: payrollId },
      data: {
        payslipSentAt: sentAt,
        payslipSentVia: 'LINE',
        payslipSentStatus: 'SUCCESS',
        payslipSentError: null,
        slipSentAt: sentAt,
        payslipCloudinaryPublicId: upload.publicId,
      },
    })

    return {
      payrollId,
      userId: payroll.userId,
      name: payroll.user.name,
      ok: true,
      payslipSentAt: sentAt.toISOString(),
    }
  } catch (err) {
    if (uploadedPublicId && !linePushed) {
      await rollbackPayslipUpload(payrollId, uploadedPublicId)
    }
    const message = err instanceof Error ? err.message : 'ส่งสลิปไม่สำเร็จ'
    const failMsg = linePushed
      ? `${message} (ส่ง LINE แล้ว — ลิงก์ยังใช้ได้ กรุณาติดต่อ IT เพื่อ sync สถานะ)`
      : message
    await markPayslipSendStatus(payrollId, 'FAILED', failMsg)
    return {
      ...base,
      userId: payroll.userId,
      name: payroll.user.name,
      error: failMsg,
    }
  }
}
