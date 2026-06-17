import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const MODEL    = 'claude-haiku-4-5-20251001'
const PROVIDER = 'anthropic'

const ALLOWED_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']

const DEPLOYMENT_CHECKLIST = [
  '1. Go to Vercel → your project → Settings → Environment Variables',
  '2. Click "Add New" → Name: ANTHROPIC_API_KEY',
  '3. Value: your Anthropic API key (starts with sk-ant-)',
  '4. Select environments: Production ✓  Preview ✓  Development ✓',
  '5. Click Save',
  '6. Go to Deployments → click ⋯ on latest → Redeploy',
  '7. Call this endpoint again — apiKeyConfigured should be true',
]

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKeyConfigured = !!process.env.ANTHROPIC_API_KEY

  if (apiKeyConfigured) {
    return NextResponse.json({
      provider:        PROVIDER,
      model:           MODEL,
      apiKeyConfigured: true,
      status:          'ok',
    })
  }

  return NextResponse.json({
    provider:        PROVIDER,
    model:           MODEL,
    apiKeyConfigured: false,
    status:          'error',
    error:           'ANTHROPIC_API_KEY is not set in this environment',
    deploymentChecklist: DEPLOYMENT_CHECKLIST,
  }, { status: 503 })
}
