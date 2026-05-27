/** Client-safe URL helper for profile images */
export function resolveProfileImageUrl(
  profileImage: string | null | undefined,
  baseUrl = '',
): string | null {
  if (!profileImage) return null
  if (profileImage.startsWith('http') || profileImage.startsWith('data:') || profileImage.startsWith('blob:'))
    return profileImage
  if (profileImage === '/api/profile/avatar') {
    const base = baseUrl.replace(/\/$/, '')
    return `${base}/api/profile/avatar`
  }
  const base = baseUrl.replace(/\/$/, '')
  return `${base}${profileImage.startsWith('/') ? profileImage : `/${profileImage}`}`
}
