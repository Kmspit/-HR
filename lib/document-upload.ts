/**
 * Shared document-upload constraints for server-side Cloudinary uploads
 * (client-companies/debtors file attachments). Mirrors the allowlist already
 * enforced for direct-to-Cloudinary uploads in app/api/upload/sign/route.ts —
 * same formats, same 20MB cap — just checked server-side here since these
 * routes call cloudinary.uploader.upload() themselves instead of signing a
 * client-side upload.
 */

export const MAX_DOCUMENT_UPLOAD_BYTES = 20 * 1024 * 1024 // 20MB

// Keyed by the validated file.type (never the client-supplied filename) —
// same reasoning as EXT_BY_TYPE in outside-work/upload: a spoofed filename
// extension must not be trusted for what gets stored/served.
export const DOCUMENT_MIME_ALLOWLIST: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'text/plain': 'txt',
}

export const DOCUMENT_ALLOWED_FORMATS = Array.from(new Set(Object.values(DOCUMENT_MIME_ALLOWLIST)))
