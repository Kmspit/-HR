/** One-shot: copy production runtime env from hrflow-app to hrflow-hr / hrflow-legal via Vercel API. */

export const DEPLOY_ENV_SOURCE_KEYS = [
  'ANTHROPIC_API_KEY',
  'NEXT_PUBLIC_LINE_OA_BASIC_ID',
  'NEXT_PUBLIC_APP_NAME',
  'NEXT_PUBLIC_APP_URL',
  'CRON_SECRET',
  'CLOUDINARY_URL',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'TURSO_AUTH_TOKEN',
  'TURSO_DATABASE_URL',
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'NEXTAUTH_URL',
] as const

const KEY_TARGETS: Record<string, ('production' | 'preview' | 'development')[]> = {
  ANTHROPIC_API_KEY: ['production', 'preview'],
}

const DEPLOY_TARGETS = [
  { project: 'hrflow-hr', profile: 'hr', appUrl: 'https://hrflow-hr.vercel.app' },
  { project: 'hrflow-legal', profile: 'legal', appUrl: 'https://hrflow-legal.vercel.app' },
] as const

const TEAM_ID = 'team_OKrjtthcy182pcreEuAkfT4P'

type SyncResult = {
  project: string
  profile: string
  copied: string[]
  skipped: string[]
  errors: { key: string; message: string }[]
}

async function upsertProjectEnv(
  vercelToken: string,
  project: string,
  key: string,
  value: string,
  target: ('production' | 'preview' | 'development')[],
): Promise<void> {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/env?upsert=true&teamId=${TEAM_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
        type: 'encrypted',
        target,
      }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || res.statusText)
  }
}

export async function syncDeployEnvFromRuntime(vercelToken: string): Promise<SyncResult[]> {
  const meRes = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${vercelToken}` },
  })
  if (!meRes.ok) {
    throw new Error('Invalid Vercel token')
  }

  const results: SyncResult[] = []

  for (const deploy of DEPLOY_TARGETS) {
    const result: SyncResult = {
      project: deploy.project,
      profile: deploy.profile,
      copied: [],
      skipped: [],
      errors: [],
    }

    for (const key of DEPLOY_ENV_SOURCE_KEYS) {
      let value = process.env[key]?.trim()
      if (!value) {
        result.skipped.push(key)
        continue
      }

      if (key === 'NEXTAUTH_URL' || key === 'NEXT_PUBLIC_APP_URL') {
        value = deploy.appUrl
      }

      const target = KEY_TARGETS[key] ?? ['production']

      try {
        await upsertProjectEnv(vercelToken, deploy.project, key, value, target)
        result.copied.push(key)
      } catch (err) {
        result.errors.push({
          key,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    try {
      await upsertProjectEnv(
        vercelToken,
        deploy.project,
        'NEXT_PUBLIC_DEPLOY_PROFILE',
        deploy.profile,
        ['production', 'preview', 'development'],
      )
      result.copied.push('NEXT_PUBLIC_DEPLOY_PROFILE')
    } catch (err) {
      result.errors.push({
        key: 'NEXT_PUBLIC_DEPLOY_PROFILE',
        message: err instanceof Error ? err.message : String(err),
      })
    }

    results.push(result)
  }

  return results
}
