import PDFDocument from 'pdfkit'
import type { RGB } from 'pdf-lib'

/**
 * ตัวช่วยแปลงพิกัด/สี ระหว่าง pdf-lib (origin ล่างซ้าย, y ของ drawText คือ
 * baseline, y ของ drawRectangle คือขอบล่าง) กับ pdfkit (origin บนซ้าย,
 * y ของ text() คือขอบบนกล่องข้อความโดย default) — ให้โค้ด layout เดิม
 * (การคำนวณ y แบบ "ลดจากบนลงล่าง" ในทั้ง 3 ไฟล์) ไม่ต้องแก้เลย
 * เปลี่ยนแค่ชื่อฟังก์ชันที่เรียก primitive วาดจริง
 */

/**
 * สร้าง pdfkit document — ใช้แทน `new PDFDocument({...})` ตรงๆ ทุกจุด
 * pdfkit's constructor เรียก initFonts(options.font) เสมอ ถ้าไม่ระบุ font
 * จะ default เป็น 'Helvetica' แล้วโหลดผ่าน Node subpath import
 * (#standard-fonts/Helvetica) ทันที — Vercel ไม่ trace ไฟล์นี้เข้า
 * serverless bundle ทำให้ throw "Cannot find module '#standard-fonts/
 * Helvetica'" ตอน runtime จริง (ยืนยันผ่าน HTTP call จริงบน Preview
 * deployment 2026-09-14) เราไม่เคยใช้ standard font จริง (เรียก
 * doc.font(thaiBytes) ทันทีหลังสร้างเสมอ) จึงส่ง font: null เพื่อข้าม
 * การโหลด Helvetica ไปเลย — @types/pdfkit ยังไม่รองรับค่านี้ในชนิดข้อมูล
 * จึงต้อง cast เฉพาะจุดนี้จุดเดียว
 *
 * ส่ง password เพื่อเข้ารหัสไฟล์ตั้งแต่ตอนสร้าง — ใช้ pdfkit's native
 * PDFSecurity (RC4 128-bit, ตรงกับที่เคยใช้ @pdfsmaller/pdf-encrypt-lite)
 * แทนการเข้ารหัสแยกทีหลังด้วย library ภายนอก ซึ่ง reparse ทั้งไฟล์ผ่าน
 * pdf-lib's parser ใหม่หมด (เห็นจาก source: `PDFDocument.load()` จาก
 * pdf-lib) — ไฟล์ที่ pdfkit สร้าง (CID TrueType font, object streams)
 * ตีความผิดเมื่อ round-trip ผ่าน parser ของอีก library ทำให้ font stream
 * เสียหายขณะที่ content stream (รูปทรง/เส้น) รอด ยืนยันจากไฟล์ที่เก็บจริง
 * บน Cloudinary ที่ทุกกล่อง/เส้นถูกตำแหน่งแต่ข้อความหายหมด (2026-09-14)
 * — เข้ารหัสในตัว pdfkit เองตัดปัญหานี้ที่ต้นตอ ไม่มี library อื่นมา
 * ตีความไฟล์ซ้ำอีกที
 *
 * permissions ระบุครบทุกอย่าง (ไม่ใช่ปล่อย default) เพราะ pdfkit's
 * default เมื่อไม่ระบุ permissions คือปิดเกือบทุกสิทธิ์ (พิมพ์/copy/
 * แก้ไขไม่ได้) ต่างจาก @pdfsmaller/pdf-encrypt-lite เดิมที่เปิดให้หมด
 * (permissions = 0xFFFFFFFC) — ถ้าไม่ระบุจะกลายเป็น regression
 */
export function createPdfKitDocument(size: [number, number], password?: string): PDFKit.PDFDocument {
  return new PDFDocument({
    size,
    margin: 0,
    font: null as unknown as string,
    ...(password
      ? {
          userPassword: password,
          ownerPassword: password,
          pdfVersion: '1.4',
          permissions: {
            printing: 'highResolution',
            modifying: true,
            copying: true,
            annotating: true,
            fillingForms: true,
            contentAccessibility: true,
            documentAssembly: true,
          },
        }
      : {}),
  })
}

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
