const SECRET_KEYS = [
  'lineChannelSecret',
  'lineAccessToken',
  'lineNotifyToken',
] as const

export function maskSettingsSecrets<T extends Record<string, unknown>>(
  settings: T,
  includeSecrets: boolean,
): T {
  if (includeSecrets) return settings
  const out: Record<string, unknown> = { ...settings }
  for (const key of SECRET_KEYS) {
    if (key in out && out[key]) {
      out[key] = '********'
    }
  }
  return out as T
}
