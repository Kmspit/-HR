import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { fetchAiContext } from '@/lib/ai-context'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

export async function POST(req: NextRequest) {
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

  const userId = session.user.id
  const role   = session.user.role as string

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
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemWithContext,
      messages,
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    return NextResponse.json({ reply: text })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AI error'
    console.error('[AI chat]', msg)
    return NextResponse.json({ error: 'AI service error' }, { status: 500 })
  }
}
