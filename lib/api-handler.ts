import { NextResponse } from 'next/server'

export function apiError(err: unknown, fallback = 'เกิดข้อผิดพลาดในระบบ') {
  const errObj = err as Record<string, unknown>
  const prismaCode = errObj?.code ? String(errObj.code) : null
  const prismaMsg  = err instanceof Error ? err.message : String(err)
  const prismaMeta = errObj?.meta ? JSON.stringify(errObj.meta) : ''
  console.error('[API Error]', prismaCode ?? 'no-code', prismaMsg, prismaMeta)

  if (prismaCode === 'P2002') {
    const target = String((errObj as { meta?: { target?: string[] } }).meta?.target ?? '')
    if (target.includes('email')) return NextResponse.json({ error: 'อีเมลนี้มีการลงทะเบียนแล้ว' }, { status: 409 })
    if (target.includes('phone')) return NextResponse.json({ error: 'เบอร์โทรนี้มีการลงทะเบียนแล้ว' }, { status: 409 })
    if (target.includes('nationalId')) return NextResponse.json({ error: 'เลขบัตรประชาชนนี้มีในระบบแล้ว' }, { status: 409 })
    return NextResponse.json({ error: 'ข้อมูลซ้ำในระบบ' }, { status: 409 })
  }
  if (prismaCode === 'P2025') return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

  return NextResponse.json({ error: fallback }, { status: 500 })
}

/** Run notification side-effects without failing the main request */
export async function runNotify(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (err) {
    console.error('[notify]', err)
  }
}
