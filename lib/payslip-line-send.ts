import { prisma } from '@/lib/prisma'
import { pushLineMessages } from '@/lib/line-api'
import { buildPayrollSlipPdfBuffer } from '@/lib/payslip-pdf-service'
import { encryptPayslipPdfBuffer, nationalIdPdfPassword } from '@/lib/payslip-pdf-encrypt'
import {
  isCloudinaryConfigured,
  loadUserImageContext,
  payslipFolder,
  uploadAuthenticatedPdf,
  getSignedPdfUrl,
} from '@/lib/cloudinary-service'

const MONTH_TH = [
  '',
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const DEFAULT_COMPANY = 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด'
const PAYSLIP_URL_TTL_SEC = 60 * 60 * 24 * 7 // 7 วัน

export type PayslipLineSendResult = {
  payrollId: string
  userId: string
  name: string
  ok: boolean
  error?: string
  payslipSentAt?: string
}

function periodLabel(month: number, year: number): string {
  return `${MONTH_TH[month]} ${year + 543}`
}

function buildPayslipLineFlex(month: number, year: number, signedUrl: string) {
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
            action: { type: 'uri', label: 'Download สลิป PDF', uri: signedUrl },
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
      payslipSentVia: 'LINE',
      payslipSentAt: now ?? undefined,
      payslipSentError: error ?? null,
      ...(status === 'SUCCESS' ? { slipSentAt: now } : {}),
    },
  })
}

async function uploadEncryptedPayslipPdf(
  payrollId: string,
  userId: string,
  encrypted: Buffer,
  filename: string,
): Promise<{ ok: true; signedUrl: string } | { ok: false; error: string }> {
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
    const signedUrl = getSignedPdfUrl(uploaded.publicId, { expiresInSec: PAYSLIP_URL_TTL_SEC })
    if (!signedUrl) {
      return { ok: false, error: 'สร้าง signed URL สำหรับ PDF ไม่สำเร็จ' }
    }
    return { ok: true, signedUrl }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'อัปโหลด PDF ไม่สำเร็จ'
    console.error('[payslip-line] cloudinary upload', payrollId, message)
    return { ok: false, error: message }
  }
}

export async function sendPayslipViaLineForPayroll(payrollId: string): Promise<PayslipLineSendResult> {
  const payroll = await prisma.payroll.findUnique({
    where: { id: payrollId },
    include: {
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

  await markPayslipSendStatus(payrollId, 'PENDING', null)

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

    const upload = await uploadEncryptedPayslipPdf(
      payrollId,
      payroll.userId,
      encrypted,
      filename,
    )
    if (!upload.ok) {
      await markPayslipSendStatus(payrollId, 'FAILED', upload.error)
      return {
        ...base,
        userId: payroll.userId,
        name: payroll.user.name,
        error: upload.error,
      }
    }

    const flex = buildPayslipLineFlex(payroll.month, payroll.year, upload.signedUrl)
    const push = await pushLineMessages(payroll.user.lineUserId, [flex])

    if (!push.ok) {
      console.error('[payslip-line] LINE push failed', {
        payrollId,
        userId: payroll.userId,
        lineUserId: payroll.user.lineUserId,
        error: push.error,
      })
      await markPayslipSendStatus(payrollId, 'FAILED', push.error ?? 'ส่ง LINE ไม่สำเร็จ')
      return {
        ...base,
        userId: payroll.userId,
        name: payroll.user.name,
        error: push.error ?? 'ส่ง LINE ไม่สำเร็จ',
      }
    }

    const sentAt = new Date()
    await prisma.payroll.update({
      where: { id: payrollId },
      data: {
        payslipSentAt: sentAt,
        payslipSentVia: 'LINE',
        payslipSentStatus: 'SUCCESS',
        payslipSentError: null,
        slipSentAt: sentAt,
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
    const message = err instanceof Error ? err.message : 'ส่งสลิปไม่สำเร็จ'
    await markPayslipSendStatus(payrollId, 'FAILED', message)
    return {
      ...base,
      userId: payroll.userId,
      name: payroll.user.name,
      error: message,
    }
  }
}
