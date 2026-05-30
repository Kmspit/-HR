import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

let cachedFont: Buffer | null = null

const FONT_CANDIDATES = [
  ['assets', 'fonts', 'NotoSansThai-Regular.ttf'],
  [
    'node_modules',
    '@expo-google-fonts',
    'noto-sans-thai',
    '400Regular',
    'NotoSansThai_400Regular.ttf',
  ],
]

/** โหลดฟอนต์ไทยจากไฟล์ในโปรเจกต์ — ไม่พึ่ง CDN (ใช้ได้บน Vercel) */
export async function loadThaiPdfFontBytes(): Promise<Buffer> {
  if (cachedFont) return cachedFont

  for (const parts of FONT_CANDIDATES) {
    const filePath = join(process.cwd(), ...parts)
    if (!existsSync(filePath)) continue
    try {
      const buf = await readFile(filePath)
      if (buf.length > 1000) {
        cachedFont = buf
        return buf
      }
    } catch {
      /* try next */
    }
  }

  throw new Error('ไม่พบไฟล์ฟอนต์ไทยในระบบ — รัน npm run prebuild')
}
