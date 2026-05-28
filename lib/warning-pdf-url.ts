/** Client/server safe — ไม่ import fs */

export function warningPdfApiPath(warningId: string): string {
  return `/api/warnings/${warningId}/pdf`
}

export function warningPdfDownloadPath(warningId: string): string {
  return `${warningPdfApiPath(warningId)}?download=1`
}

export function warningHasPdf(fileUrl: string | null | undefined): boolean {
  return Boolean(fileUrl?.trim())
}

export function warningPdfPublicUrl(
  warningId: string,
  fileUrl: string | null,
  baseUrl: string,
): string | null {
  if (!warningHasPdf(fileUrl)) return null
  const base = baseUrl.replace(/\/$/, '')
  return `${base}${warningPdfApiPath(warningId)}`
}
