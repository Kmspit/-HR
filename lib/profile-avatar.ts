import {
  isCloudinaryConfigured,
  loadUserImageContext,
  profileFolder,
  requireCloudinary,
  uploadImage,
} from '@/lib/cloudinary-service'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function isAvatarFile(file: File) {
  const name = file.name.toLowerCase()
  return (
    ALLOWED_TYPES.has(file.type) ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  )
}

export async function storeProfileAvatar(
  userId: string,
  file: File,
): Promise<{
  profileImage: string
  profileImageBase64: null
  profileCloudinaryPublicId: string
  profileSecureUrl: string
} | null> {
  if (!file?.size || !isAvatarFile(file)) return null
  if (file.size > MAX_AVATAR_BYTES) throw new Error('AVATAR_TOO_LARGE')

  if (!isCloudinaryConfigured()) {
    throw new Error('CLOUDINARY_NOT_CONFIGURED')
  }

  requireCloudinary()
  const buffer = Buffer.from(await file.arrayBuffer())
  const ctx = await loadUserImageContext(userId)
  const uploaded = await uploadImage(buffer, {
    folder: profileFolder(ctx),
    publicId: 'avatar',
    mime: file.type || 'image/jpeg',
  })

  return {
    profileImage: uploaded.publicId,
    profileImageBase64: null,
    profileCloudinaryPublicId: uploaded.publicId,
    profileSecureUrl: uploaded.secureUrl,
  }
}

export { resolveProfileImageUrl } from '@/lib/profile-avatar-url'
