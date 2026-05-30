/** HTTP headers ต้องเป็น Latin-1 — ห้ามใส่ชื่อไทยใน filename */

export function workLogExportFilename(
  meta: {
    employeeId: string | null
    employeeName: string
    month: number
    year: number
  },
  ext: 'xlsx' | 'csv' | 'pdf',
): string {
  let slug = 'report'
  if (meta.employeeId?.trim()) {
    slug = meta.employeeId.replace(/[^a-zA-Z0-9_-]/g, '') || 'report'
  } else if (/ทุกคน|all/i.test(meta.employeeName)) {
    slug = 'all'
  }
  return `attendance-${meta.year}-${String(meta.month).padStart(2, '0')}-${slug}.${ext}`
}

export function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${safe}"`
}
