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

/** Deterministic Cloudinary public_id — ต้องตรงกับ upload ใน payslip-line-send */
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
