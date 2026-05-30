/**
 * lib/cloudinary.ts — Reusable Cloudinary helper for the HR attendance system.
 *
 * Environment variables required:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Optional:
 *   CLOUDINARY_ROOT_FOLDER  (default: "hr-system")
 *
 * Security guarantees enforced here:
 *   - Signed / authenticated upload only (never public)
 *   - Max 5 MB per image
 *   - Accepted formats: jpg, jpeg, png, webp
 *   - overwrite: false  — each scan produces a unique, immutable file
 */

import { v2 as cloudinary } from 'cloudinary'

// ── Constants ──────────────────────────────────────────────────────────────────

const ROOT = (process.env.CLOUDINARY_ROOT_FOLDER ?? 'hr-system').replace(/^\/|\/$/g, '')

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'] as const
type AllowedFormat = (typeof ALLOWED_FORMATS)[number]

// ── Singleton config ───────────────────────────────────────────────────────────

let _configured = false

function configure(): void {
  if (_configured) return
  const name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const key  = process.env.CLOUDINARY_API_KEY?.trim()
  const sec  = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!name || !key || !sec) {
    throw new Error(
      'Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
    )
  }
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true })
  _configured = true
}

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
    process.env.CLOUDINARY_API_KEY?.trim() &&
    process.env.CLOUDINARY_API_SECRET?.trim()
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────

/** Scan types accepted by the attendance system */
export type AttendanceScanType = 'checkin' | 'checkout' | 'lunch_out' | 'lunch_in'

const SCAN_TYPE_SLUG: Record<AttendanceScanType, string> = {
  checkin:   'checkin',
  checkout:  'checkout',
  lunch_out: 'lunch-start',
  lunch_in:  'lunch-end',
}

export type UploadAttendancePhotoInput = {
  /** Raw image bytes */
  buffer: Buffer
  /** MIME type, e.g. "image/jpeg" */
  mime: string
  /** Employee's unique ID (used as folder segment) */
  employeeId: string
  /** Scan action */
  scanType: AttendanceScanType
  /** Exact time of scan (used for date folder + unique public_id) */
  scanTime: Date
  /**
   * Optional suffix appended to the public_id.
   * Defaults to a timestamp so the same employee can scan multiple days
   * without collision and files are never overwritten.
   */
  publicIdSuffix?: string
}

export type AttendancePhotoUploadResult = {
  /** Cloudinary public_id — store in DB as image_public_id */
  publicId: string
  /** Authenticated secure_url — store in DB as image_url */
  secureUrl: string
  /** Plain (non-https) url */
  imageUrl: string
  format: string
  fileSize: number
  width: number
  height: number
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateImage(buffer: Buffer, mime: string): void {
  if (buffer.length > MAX_BYTES) {
    const mb = (buffer.length / 1024 / 1024).toFixed(1)
    throw new Error(`Image size ${mb} MB exceeds the 5 MB limit.`)
  }
  const ext = mime.split('/')[1]?.toLowerCase().replace('jpeg', 'jpg') as AllowedFormat
  if (!ALLOWED_FORMATS.includes(ext)) {
    throw new Error(
      `Unsupported image format "${mime}". Accepted: ${ALLOWED_FORMATS.join(', ')}.`,
    )
  }
}

// ── Folder helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the Cloudinary folder path for an attendance photo:
 *   {ROOT}/attendance/{employeeId}/{YYYY-MM-DD}/{scanType}
 */
export function attendancePhotoFolder(
  employeeId: string,
  scanTime: Date,
  scanType: AttendanceScanType,
): string {
  const dateStr = scanTime.toISOString().slice(0, 10) // YYYY-MM-DD
  return `${ROOT}/attendance/${employeeId}/${dateStr}/${SCAN_TYPE_SLUG[scanType]}`
}

// ── Upload ─────────────────────────────────────────────────────────────────────

/**
 * Uploads an attendance face-scan photo to Cloudinary.
 *
 * Security:
 *   - type: "authenticated"  → private, not publicly accessible
 *   - overwrite: false        → each scan file is immutable
 *   - allowed_formats         → jpg / jpeg / png / webp only
 *   - max 5 MB enforced before network call
 */
export async function uploadAttendancePhoto(
  input: UploadAttendancePhotoInput,
): Promise<AttendancePhotoUploadResult> {
  validateImage(input.buffer, input.mime)
  configure()

  const folder   = attendancePhotoFolder(input.employeeId, input.scanTime, input.scanType)
  const ts       = Math.floor(input.scanTime.getTime() / 1000)
  const publicId = input.publicIdSuffix ?? String(ts)
  const dataUri  = `data:${input.mime};base64,${input.buffer.toString('base64')}`

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id:       publicId,
    resource_type:   'image',
    type:            'authenticated', // private — requires signed URL to access
    overwrite:       false,           // prevent overwriting existing scan images
    allowed_formats: [...ALLOWED_FORMATS],
  })

  return {
    publicId:  result.public_id,
    secureUrl: result.secure_url,
    imageUrl:  result.url,
    format:    result.format   ?? 'jpg',
    fileSize:  result.bytes    ?? input.buffer.length,
    width:     result.width    ?? 0,
    height:    result.height   ?? 0,
  }
}

// ── Signed URL (internal access only) ─────────────────────────────────────────

/**
 * Generates a time-limited signed URL for an authenticated Cloudinary image.
 * Default expiry: 15 minutes. Use for LINE OA image sharing or HR dashboard.
 */
export function getAttendancePhotoSignedUrl(
  publicId: string,
  options?: { expiresInSec?: number; format?: string },
): string | null {
  if (!publicId || !isCloudinaryConfigured()) return null
  configure()
  const expiresIn = options?.expiresInSec ?? 60 * 15
  const format    = options?.format ?? 'jpg'
  try {
    return cloudinary.utils.private_download_url(publicId, format, {
      resource_type: 'image',
      type:          'authenticated',
      expires_at:    Math.floor(Date.now() / 1000) + expiresIn,
    })
  } catch {
    return null
  }
}

/**
 * Returns a signed, optimized delivery URL (resized + auto-format).
 * Falls back to `getAttendancePhotoSignedUrl` if transformation fails.
 */
export function getOptimizedAttendancePhotoUrl(
  publicId: string,
  options?: { width?: number; expiresInSec?: number },
): string | null {
  if (!publicId || !isCloudinaryConfigured()) return null
  configure()
  const expiresIn = options?.expiresInSec ?? 60 * 15
  try {
    return cloudinary.url(publicId, {
      type:          'authenticated',
      secure:        true,
      sign_url:      true,
      resource_type: 'image',
      transformation: [
        {
          width:        options?.width ?? 800,
          crop:         'limit',
          quality:      'auto',
          fetch_format: 'auto',
        },
      ],
      auth_token: {
        key:        process.env.CLOUDINARY_API_KEY!.trim(),
        expiration: Math.floor(Date.now() / 1000) + expiresIn,
      },
    })
  } catch {
    return getAttendancePhotoSignedUrl(publicId, { expiresInSec: expiresIn })
  }
}

/** Deletes an image from Cloudinary by public_id. Returns true on success. */
export async function deleteAttendancePhoto(publicId: string): Promise<boolean> {
  if (!publicId || !isCloudinaryConfigured()) return false
  configure()
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      type:          'authenticated',
    })
    return true
  } catch (err) {
    console.error('[cloudinary] delete failed', publicId, err)
    return false
  }
}
