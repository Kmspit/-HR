import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import Anthropic, {
  APIError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  APIConnectionError,
  APIConnectionTimeoutError,
} from '@anthropic-ai/sdk'
import { fetchAiContext } from '@/lib/ai-context'

const MODEL    = 'claude-haiku-4-5-20251001'
const PROVIDER = 'anthropic'

// Fires once per cold start — visible in Vercel function logs
console.log('[AI ENV CHECK] ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY)

const SYSTEM_PROMPT = `คุณคือผู้ช่วย AI ของบริษัท KM Service Plus สำหรับระบบ HRFlow
คุณช่วยพนักงาน, ผู้จัดการ, HR และลูกค้าในด้านกฎหมายและ HR

กฎสำคัญ:
- ตอบเป็นภาษาไทยเสมอ
- ใช้ข้อมูลจริงจากบริบทที่ให้ไว้เท่านั้น
- อย่าสร้างข้อมูลปลอมหรือตัวอย่างสมมติ
- ถ้าไม่มีข้อมูลในบริบท ให้บอกตรงๆ ว่า "ไม่พบข้อมูลดังกล่าวในระบบ"
- ตอบอย่างกระชับและตรงประเด็น
- สำหรับลูกค้า: พูดถึงเฉพาะคดีของลูกค้านั้นเท่านั้น`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function classifyError(err: unknown): string {
  if (err instanceof AuthenticationError) {
    return 'Claude API key is invalid or not configured — check ANTHROPIC_API_KEY in Vercel environment variables'
  }
  if (err instanceof RateLimitError) {
    return 'Claude API rate limit exceeded — please try again in a moment'
  }
  if (err instanceof NotFoundError) {
    return 'Claude model not found — the model ID may be incorrect or unavailable in your plan'
  }
  if (err instanceof APIConnectionTimeoutError) {
    return 'Claude API request timed out — please try again'
  }
  if (err instanceof APIConnectionError) {
    return 'Cannot reach Claude API — network connectivity error'
  }
  if (err instanceof APIError) {
    const status = err.status ?? 0
    if (status === 403) return 'Claude API key does not have permission to use this model'
    if (status >= 500) return `Claude API server error (${status}) — please try again later`
    return `Claude API error (${status}): ${err.message}`
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase()
    if (m.includes('timeout') || m.includes('etimedout')) return 'Claude API request timed out — please try again'
    if (m.includes('fetch failed') || m.includes('econnrefused')) return 'Cannot reach Claude API — network error'
    return err.message
  }
  return String(err)
}

export async function POST(req: NextRequest) {
  console.log('[AI REQUEST START]')

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message: string; history?: ChatMessage[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { message, history = [] } = body
  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[AI ERROR] ANTHROPIC_API_KEY is not set — add it to Vercel → Settings → Environment Variables')
    return NextResponse.json({ error: 'Claude API key is not configured' }, { status: 500 })
  }

  const userId = session.user.id
  const role   = session.user.role as string

  console.log('[AI USER]', userId, role)
  console.log('[AI PROVIDER]', PROVIDER)
  console.log('[AI MODEL]', MODEL)

  const client = new Anthropic({ apiKey })

  const dbContext = await fetchAiContext(userId, role)

  const systemWithContext = `${SYSTEM_PROMPT}

=== ข้อมูลปัจจุบันจากระบบ ===
${dbContext}`

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((m): Anthropic.MessageParam => ({
      role:    m.role,
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  try {
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     systemWithContext,
      messages,
    })

    console.log('[AI RESPONSE STATUS] ok | stop_reason:', response.stop_reason)

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    return NextResponse.json({ reply: text })
  } catch (err: unknown) {
    const reason = classifyError(err)
    console.error('[AI ERROR]', reason)
    return NextResponse.json({ error: reason }, { status: 500 })
  }
}
