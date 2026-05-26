import { mkdir, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'

function extensionFromFile(file: File): string {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return '.pdf'
  if (name.endsWith('.png')) return '.png'
  if (name.endsWith('.webp')) return '.webp'
  if (name.endsWith('.jpeg')) return '.jpeg'
  if (name.endsWith('.jpg')) return '.jpg'
  if (file.type === 'application/pdf') return '.pdf'
  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/webp') return '.webp'
  if (file.type === 'image/jpeg') return '.jpg'
  return '.bin'
}

/** Save uploaded file — works locally; on Vercel skips gracefully if /public is read-only */
export async function saveUpload(
  file: File,
  prefix: string,
  userId: string,
): Promise<string | undefined> {
  if (!file || file.size === 0) return undefined

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = extensionFromFile(file)
    const filename = `${prefix}_${userId}_${Date.now()}${ext}`

    if (process.env.VERCEL === '1') {
      await writeFile(path.join(os.tmpdir(), filename), buffer)
      return undefined
    }

    const dir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, filename), buffer)
    return `/uploads/${filename}`
  } catch (err) {
    console.warn('[saveUpload]', err)
    return undefined
  }
}
