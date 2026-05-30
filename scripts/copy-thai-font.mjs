import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const destDir = join(root, 'assets', 'fonts')
const dest = join(destDir, 'NotoSansThai-Regular.ttf')
const src = join(
  root,
  'node_modules',
  '@expo-google-fonts',
  'noto-sans-thai',
  '400Regular',
  'NotoSansThai_400Regular.ttf',
)

if (!existsSync(src)) {
  console.warn('[copy-thai-font] skip — install @expo-google-fonts/noto-sans-thai')
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })
copyFileSync(src, dest)
console.log('[copy-thai-font] OK', dest)
