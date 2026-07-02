import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite'

/** รหัสเปิด PDF = เลขบัตรประชาชน 4 ตัวท้าย */
export function nationalIdPdfPassword(nationalId: string | null | undefined): string | null {
  const digits = String(nationalId ?? '').replace(/\D/g, '')
  if (digits.length < 4) return null
  return digits.slice(-4)
}

export async function encryptPayslipPdfBuffer(pdfBuffer: Buffer, password: string): Promise<Buffer> {
  const encrypted = await encryptPDF(new Uint8Array(pdfBuffer), password, password)
  return Buffer.from(encrypted)
}
