import { saveUpload } from '@/lib/save-upload'

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
): Promise<{ profileImage: string; profileImageBase64: string | null } | null> {
  if (!file?.size || !isAvatarFile(file)) return null
  if (file.size > MAX_AVATAR_BYTES) throw new Error('AVATAR_TOO_LARGE')

  const localPath = await saveUpload(file, 'avatar', userId)
  if (localPath) {
    return { profileImage: localPath, profileImageBase64: null }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  return {
    profileImage: '/api/profile/avatar',
    profileImageBase64: buffer.toString('base64'),
  }
}

export { resolveProfileImageUrl } from '@/lib/profile-avatar-url'
