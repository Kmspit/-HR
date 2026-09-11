import type { RGB } from 'pdf-lib'

/**
 * ตัวช่วยแปลงพิกัด/สี ระหว่าง pdf-lib (origin ล่างซ้าย, y ของ drawText คือ
 * baseline, y ของ drawRectangle คือขอบล่าง) กับ pdfkit (origin บนซ้าย,
 * y ของ text() คือขอบบนกล่องข้อความโดย default) — ให้โค้ด layout เดิม
 * (การคำนวณ y แบบ "ลดจากบนลงล่าง" ในทั้ง 3 ไฟล์) ไม่ต้องแก้เลย
 * เปลี่ยนแค่ชื่อฟังก์ชันที่เรียก primitive วาดจริง
 */

function rgbToPdfKit(color: RGB): [number, number, number] {
  return [Math.round(color.red * 255), Math.round(color.green * 255), Math.round(color.blue * 255)]
}

/** วาดข้อความบรรทัดเดียว — (x, y) คือ baseline เหมือน page.drawText() ของ pdf-lib */
export function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  yBaseline: number,
  opts: { size: number; color?: RGB },
): void {
  const pageHeight = doc.page.height
  doc.fontSize(opts.size)
  if (opts.color) doc.fillColor(rgbToPdfKit(opts.color))
  doc.text(text, x, pageHeight - yBaseline, { lineBreak: false, baseline: 'alphabetic' })
}

/** วาดสี่เหลี่ยม — y คือขอบล่างเหมือน page.drawRectangle() ของ pdf-lib */
export function drawRect(
  doc: PDFKit.PDFDocument,
  x: number,
  yBottom: number,
  width: number,
  height: number,
  opts: { fill?: RGB; borderColor?: RGB; borderWidth?: number },
): void {
  const pageHeight = doc.page.height
  const yTop = pageHeight - yBottom - height
  doc.rect(x, yTop, width, height)
  if (opts.fill && opts.borderColor) {
    doc.lineWidth(opts.borderWidth ?? 1)
    doc.fillAndStroke(rgbToPdfKit(opts.fill), rgbToPdfKit(opts.borderColor))
  } else if (opts.fill) {
    doc.fill(rgbToPdfKit(opts.fill))
  } else if (opts.borderColor) {
    doc.lineWidth(opts.borderWidth ?? 1)
    doc.stroke(rgbToPdfKit(opts.borderColor))
  }
}

/** วาดเส้นแนวนอน — y เหมือน page.drawLine() ของ pdf-lib (จุดเดียว ไม่มีความสูง) */
export function drawHLine(
  doc: PDFKit.PDFDocument,
  y: number,
  x1: number,
  x2: number,
  opts: { thickness?: number; color?: RGB },
): void {
  const pageHeight = doc.page.height
  const yy = pageHeight - y
  doc.lineWidth(opts.thickness ?? 1)
  doc.moveTo(x1, yy).lineTo(x2, yy)
  doc.stroke(opts.color ? rgbToPdfKit(opts.color) : undefined)
}

/** เทียบเท่า font.widthOfTextAtSize(text, size) ของ pdf-lib */
export function widthOf(doc: PDFKit.PDFDocument, text: string, size: number): number {
  doc.fontSize(size)
  return doc.widthOfString(text)
}

/** เทียบเท่า pdf.save() ของ pdf-lib — เก็บ stream ออกมาเป็น Buffer เดียว */
export function finalizePdfKitDocument(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}
