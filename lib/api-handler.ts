import { NextResponse } from 'next/server'

export function apiError(err: unknown, fallback = 'เกิดข้อผิดพลาดในระบบ') {
  console.error('[API Error]', err)
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: string }).code)
    if (code === 'P2002') {
      const target = String((err as { meta?: { target?: string[] } }).meta?.target ?? '')
      if (target.includes('email')) return NextResponse.json({ error: 'อีเมลนี้มีการลงทะเบียนแล้ว' }, { status: 409 })
      if (target.includes('phone')) return NextResponse.json({ error: 'เบอร์โทรนี้มีการลงทะเบียนแล้ว' }, { status: 409 })
      if (target.includes('nationalId')) return NextResponse.json({ error: 'เลขบัตรประชาชนนี้มีในระบบแล้ว' }, { status: 409 })
      return NextResponse.json({ error: 'ข้อมูลซ้ำในระบบ' }, { status: 409 })
    }
    if (code === 'P2025') return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })
  }
  const message =
    err instanceof Error && err.message && !err.message.toLowerCase().includes('prisma')
      ? err.message
      : fallback
  return NextResponse.json({ error: message }, { status: 500 })
}

/** Run notification side-effects without failing the main request */
export async function runNotify(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (err) {
    console.error('[notify]', err)
  }
}
