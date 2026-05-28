import { saveUpload } from '@/lib/save-upload'

const MAX_PDF_BYTES = 10 * 1024 * 1024

export function isPdfFile(file: File) {
  const name = file.name.toLowerCase()
  return file.type === 'application/pdf' || name.endsWith('.pdf')
}

/** บันทึก PDF — local ใช้ /public/uploads, production ใช้ API route + เก็บ base64 ใน DB */
export async function storeWarningPdf(
  warningId: string,
  userId: string,
  file: File,
): Promise<{ fileUrl: string; pdfBase64: string | null } | null> {
  if (!file?.size || !isPdfFile(file)) return null
  if (file.size > MAX_PDF_BYTES) throw new Error('PDF_TOO_LARGE')

  const localPath = await saveUpload(file, 'warning', userId)
  if (localPath) {
    return { fileUrl: localPath, pdfBase64: null }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const apiPath = `/api/warnings/${warningId}/pdf`
  return {
    fileUrl: apiPath,
    pdfBase64: buffer.toString('base64'),
  }
}

export {
  warningPdfApiPath,
  warningPdfDownloadPath,
  warningHasPdf,
  warningPdfPublicUrl,
} from '@/lib/warning-pdf-url'
