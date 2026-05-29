/** Client-safe URL helper for profile images (no Node / Cloudinary SDK) */
export function resolveProfileImageUrl(
  profileImage: string | null | undefined,
  baseUrl = '',
): string | null {
  if (!profileImage) return null
  if (
    profileImage.startsWith('http') ||
    profileImage.startsWith('data:') ||
    profileImage.startsWith('blob:')
  ) {
    return profileImage
  }

  const base = baseUrl.replace(/\/$/, '')

  if (
    profileImage === '/api/profile/avatar' ||
    profileImage.startsWith('hr-system/') ||
    (profileImage.includes('/') && !profileImage.startsWith('/uploads'))
  ) {
    return `${base}/api/profile/avatar`
  }

  return `${base}${profileImage.startsWith('/') ? profileImage : `/${profileImage}`}`
}
