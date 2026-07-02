/**
 * สร้าง PWA icons ทุกขนาด — รันอัตโนมัติใน prebuild
 * พื้นหลัง #070b14, กล่องเขียว #22c55e, ตัวอักษร KM
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'icons')

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

function svgForSize(size) {
  const pad = Math.round(size * 0.1)
  const inner = size - pad * 2
  const radius = Math.round(size * 0.14)
  const fontSize = Math.round(size * 0.34)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#070b14"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${radius}" fill="#22c55e"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fontSize}">KM</text>
</svg>`)
}

fs.mkdirSync(outDir, { recursive: true })

for (const size of sizes) {
  const out = path.join(outDir, `icon-${size}x${size}.png`)
  await sharp(svgForSize(size)).png().toFile(out)
  console.log('[pwa-icons]', out)
}

console.log('[pwa-icons] done —', sizes.length, 'icons')
