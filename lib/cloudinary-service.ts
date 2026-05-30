import { v2 as cloudinary } from 'cloudinary'
import { prisma } from '@/lib/prisma'

const ROOT = (process.env.CLOUDINARY_ROOT_FOLDER ?? 'hr-system').replace(/^\/|\/$/g, '')
const DEFAULT_RETENTION_DAYS = parseInt(process.env.CLOUDINARY_RETENTION_DAYS ?? '90', 10)

export type CloudinaryUploadResult = {
  publicId: string
  imageUrl: string
  secureUrl: string
  format: string
  fileSize: number
  width: number
  height: number
}

export type UploadImageOptions = {
  folder: string
  publicId?: string
  mime?: string
  resourceType?: 'image' | 'raw' | 'video' | 'auto'
}

let configured = false

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
    process.env.CLOUDINARY_API_KEY?.trim() &&
    process.env.CLOUDINARY_API_SECRET?.trim()
  )
}

export function ensureCloudinaryConfig(): void {
  if (!isCloudinaryConfigured()) {
    throw new Error('CLOUDINARY_NOT_CONFIGURED')
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
      api_key: process.env.CLOUDINARY_API_KEY!.trim(),
      api_secret: process.env.CLOUDINARY_API_SECRET!.trim(),
      secure: true,
    })
    configured = true
  }
}

export function requireCloudinary(): void {
  if (!isCloudinaryConfigured()) {
    throw new Error('ต้องตั้งค่า CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET')
  }
  ensureCloudinaryConfig()
}

export type UserImageContext = {
  userId: string
  employeeId: string | null
  branchId: string | null
}

export async function loadUserImageContext(userId: string): Promise<UserImageContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, employeeId: true, branchId: true },
  })
  if (!user) throw new Error('USER_NOT_FOUND')
  return {
    userId: user.id,
    employeeId: user.employeeId,
    branchId: user.branchId,
  }
}

function employeeFolderKey(ctx: UserImageContext): string {
  return ctx.employeeId?.trim() || `uid_${ctx.userId}`
}

export function attendanceScanFolder(
  ctx: UserImageContext,
  scanType: string,
  scanTime?: Date,
): string {
  const emp = employeeFolderKey(ctx)
  const map: Record<string, string> = {
    checkin: 'checkin',
    checkout: 'checkout',
    'lunch-out': 'lunch-start',
    'lunch-in': 'lunch-end',
    lunch_start: 'lunch-start',
    lunch_end: 'lunch-end',
  }
  const sub = map[scanType] ?? scanType
  // Include date segment: attendance/{employeeId}/{YYYY-MM-DD}/{type}
  const dateStr = (scanTime ?? new Date()).toISOString().slice(0, 10)
  return `${ROOT}/attendance/${emp}/${dateStr}/${sub}`
}

export function profileFolder(ctx: UserImageContext): string {
  return `${ROOT}/employees/${employeeFolderKey(ctx)}/profile`
}

export function faceRegistrationFolder(ctx: UserImageContext): string {
  return `${ROOT}/face-registration/${employeeFolderKey(ctx)}`
}

export function warningFolder(ctx: UserImageContext, warningId: string): string {
  return `${ROOT}/warnings/${employeeFolderKey(ctx)}/${warningId}`
}

/** อัปโหลดรูป — type authenticated (ไม่ public) */
export async function uploadImage(
  buffer: Buffer,
  options: UploadImageOptions,
): Promise<CloudinaryUploadResult> {
  requireCloudinary()
  const mime = options.mime ?? 'image/jpeg'
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`

  // Security: validate before upload
  const MAX_BYTES = 5 * 1024 * 1024
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Image size ${(buffer.length / 1024 / 1024).toFixed(1)} MB exceeds 5 MB limit.`)
  }
  const ext = mime.split('/')[1]?.toLowerCase().replace('jpeg', 'jpg')
  const ALLOWED = ['jpg', 'png', 'webp']
  if (!ALLOWED.includes(ext)) {
    throw new Error(`Unsupported format "${mime}". Accepted: jpg, jpeg, png, webp.`)
  }

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: options.folder,
    public_id: options.publicId,
    resource_type: options.resourceType ?? 'image',
    type: 'authenticated',
    overwrite: false, // prevent overwriting existing files
    allowed_formats: ALLOWED,
  })

  return {
    publicId: result.public_id,
    imageUrl: result.url,
    secureUrl: result.secure_url,
    format: result.format ?? 'jpg',
    fileSize: result.bytes ?? buffer.length,
    width: result.width ?? 0,
    height: result.height ?? 0,
  }
}

export async function deleteImage(publicId: string): Promise<boolean> {
  if (!publicId || !isCloudinaryConfigured()) return false
  ensureCloudinaryConfig()
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
    return true
  } catch (err) {
    console.error('[cloudinary] delete', publicId, err)
    return false
  }
}

/** Signed URL สำหรับ LINE / HR (ไม่ใช้ public URL ตรง) */
export function getSignedUrl(
  publicId: string,
  options?: { expiresInSec?: number; format?: string },
): string | null {
  if (!publicId || !isCloudinaryConfigured()) return null
  ensureCloudinaryConfig()
  const expiresIn = options?.expiresInSec ?? 60 * 15
  const format = options?.format ?? 'jpg'
  try {
    return cloudinary.utils.private_download_url(publicId, format, {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    })
  } catch (err) {
    console.error('[cloudinary] getSignedUrl', err)
    return null
  }
}

/** URL พร้อม optimization (ยังเป็น signed authenticated) */
export function optimizeImage(
  publicId: string,
  options?: { width?: number; height?: number; expiresInSec?: number },
): string | null {
  if (!publicId || !isCloudinaryConfigured()) return null
  ensureCloudinaryConfig()
  const expiresIn = options?.expiresInSec ?? 60 * 15
  try {
    const url = cloudinary.url(publicId, {
      type: 'authenticated',
      secure: true,
      sign_url: true,
      resource_type: 'image',
      transformation: [
        {
          width: options?.width ?? 800,
          height: options?.height,
          crop: 'limit',
          quality: 'auto',
          fetch_format: 'auto',
        },
      ],
      auth_token: {
        key: process.env.CLOUDINARY_API_KEY!.trim(),
        expiration: Math.floor(Date.now() / 1000) + expiresIn,
      },
    })
    return url
  } catch {
    return getSignedUrl(publicId, { expiresInSec: expiresIn })
  }
}

export async function fetchImageBuffer(publicId: string): Promise<{
  buffer: Buffer
  mime: string
} | null> {
  const url = getSignedUrl(publicId, { expiresInSec: 120 })
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mime: res.headers.get('content-type') ?? 'image/jpeg',
    }
  } catch (err) {
    console.error('[cloudinary] fetch', err)
    return null
  }
}

export async function getImageRetentionDays(): Promise<number> {
  try {
    const s = await prisma.companySettings.findUnique({
      where: { id: 'singleton' },
      select: { imageRetentionDays: true },
    })
    if (s?.imageRetentionDays && s.imageRetentionDays > 0) return s.imageRetentionDays
  } catch {
    /* column may not exist yet */
  }
  return DEFAULT_RETENTION_DAYS
}

export async function runImageRetentionCleanup(): Promise<{
  scanned: number
  deleted: number
  errors: number
  retentionDays: number
}> {
  const days = await getImageRetentionDays()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  let scanned = 0
  let deleted = 0
  let errors = 0

  const oldScans = await prisma.attendanceFaceScan.findMany({
    where: {
      scanTime: { lt: cutoff },
      cloudinaryPublicId: { not: null },
    },
    select: { id: true, cloudinaryPublicId: true, objectKey: true },
    take: 200,
  })

  for (const row of oldScans) {
    scanned++
    const pid = row.cloudinaryPublicId ?? row.objectKey
    if (!pid) continue
    const ok = await deleteImage(pid)
    if (ok) {
      deleted++
      await prisma.attendanceFaceScan.update({
        where: { id: row.id },
        data: {
          cloudinaryPublicId: null,
          objectKey: null,
          imageUrl: null,
          secureUrl: null,
          imageData: '',
        },
      })
    } else {
      errors++
    }
  }

  return { scanned, deleted, errors, retentionDays: days }
}
