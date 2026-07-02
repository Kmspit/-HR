import { loadUserImageContext, payslipFolder } from '@/lib/cloudinary-service'

export function payslipPdfFilename(params: {
  year: number
  month: number
  userId: string
  employeeId: string | null
}): string {
  const emp = params.employeeId ?? params.userId.slice(0, 6)
  return `slip_${params.year}_${String(params.month).padStart(2, '0')}_${emp}.pdf`
}

/** Deterministic Cloudinary public_id — fallback เมื่อยังไม่มีค่าใน DB */
export async function resolvePayslipCloudinaryPublicId(
  payrollId: string,
  userId: string,
  filename: string,
): Promise<string> {
  const ctx = await loadUserImageContext(userId)
  const folder = payslipFolder(ctx, payrollId)
  const stem = filename.replace(/\.pdf$/i, '')
  return `${folder}/${stem}`
}

/** ใช้ publicId จาก DB ก่อน ( authoritative จาก upload ) */
export async function resolvePayslipPdfPublicId(params: {
  payrollId: string
  userId: string
  year: number
  month: number
  employeeId: string | null
  storedPublicId: string | null | undefined
}): Promise<string> {
  const stored = params.storedPublicId?.trim()
  if (stored) return stored
  const filename = payslipPdfFilename({
    year: params.year,
    month: params.month,
    userId: params.userId,
    employeeId: params.employeeId,
  })
  return resolvePayslipCloudinaryPublicId(params.payrollId, params.userId, filename)
}
