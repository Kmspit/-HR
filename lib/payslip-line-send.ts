import { prisma } from '@/lib/prisma'
import { pushLineMessages } from '@/lib/line-api'
import { uploadLineMessageContent } from '@/lib/line-file-upload'
import { buildPayrollSlipPdfBuffer } from '@/lib/payslip-pdf-service'
import { encryptPayslipPdfBuffer, nationalIdPdfPassword } from '@/lib/payslip-pdf-encrypt'

const MONTH_TH = [
  '',
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const DEFAULT_COMPANY = 'บริษัท เค เอ็ม เซอร์วิสพลัส จำกัด'

export type PayslipLineSendResult = {
  payrollId: string
  userId: string
  name: string
  ok: boolean
  error?: string
  payslipSentAt?: string
}

function buildLineText(employeeName: string, month: number, year: number): string {
  const period = `${MONTH_TH[month]} ${year + 543}`
  return [
    `📄 สลิปเงินเดือน ${period}`,
    DEFAULT_COMPANY,
    '',
    `เรียน คุณ ${employeeName}`,
    'กรุณาเปิดไฟล์ด้วยรหัส: เลขบัตรประชาชน 4 ตัวหลัง',
  ].join('\n')
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
      payslipSentVia: status === 'SUCCESS' ? 'LINE' : status === 'PENDING' ? 'LINE' : 'LINE',
      payslipSentAt: now ?? undefined,
      payslipSentError: error ?? null,
      ...(status === 'SUCCESS' ? { slipSentAt: now } : {}),
    },
  })
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

    const upload = await uploadLineMessageContent(encrypted, 'application/pdf', filename)
    if (!upload.ok) {
      await markPayslipSendStatus(payrollId, 'FAILED', upload.error)
      return {
        ...base,
        userId: payroll.userId,
        name: payroll.user.name,
        error: upload.error,
      }
    }

    const text = buildLineText(payroll.user.name, payroll.month, payroll.year)
    const push = await pushLineMessages(payroll.user.lineUserId, [
      { type: 'text', text },
      { type: 'file', fileName: filename, messageId: upload.messageId },
    ])

    if (!push.ok) {
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
