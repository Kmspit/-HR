/**
 * กันเครื่อง dev ต่อ Turso production โดยไม่ตั้งใจ — ถ้า NODE_ENV ไม่ใช่ production
 * แต่เจอ TURSO_* ใน env ให้หยุดทันที เว้นแต่ ALLOW_PROD=1
 *
 * ตรรกะเดียวกับ scripts/lib/prod-guard.mjs (สคริปต์ .mjs import ไฟล์ .ts ตรง ๆ ไม่ได้)
 * — แก้ที่หนึ่งต้องแก้อีกที่ด้วย
 */

type Env = Record<string, string | undefined>

const PROD_ENV_KEYS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const

export function hasProdCreds(env: Env = process.env): boolean {
  return PROD_ENV_KEYS.some((k) => (env[k] ?? '').trim() !== '')
}

/**
 * NODE_ENV=production หรือรันบน Vercel (VERCEL_ENV=production|preview) — ต้องยกเว้น
 * Vercel ด้วยเพราะ postbuild-ensure-schema import lib/prisma ระหว่าง build ซึ่ง
 * NODE_ENV อาจยังไม่ใช่ production (`vercel env pull` เขียน VERCEL_ENV="development")
 */
export function isProductionRuntime(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview'
}

export function assertNoStrayProdCreds(context: string, env: Env = process.env): void {
  if (!hasProdCreds(env) || isProductionRuntime(env) || env.ALLOW_PROD === '1') return
  throw new Error(
    [
      '',
      `⛔ [prod-guard] ${context}: พบ TURSO_DATABASE_URL/TURSO_AUTH_TOKEN ใน environment`,
      `   แต่ NODE_ENV=${env.NODE_ENV ?? '(ไม่ได้ตั้ง)'} ไม่ใช่ production — หยุดทำงานเพื่อกันการแตะ production DB โดยไม่ตั้งใจ`,
      '   • ถ้าไม่ได้ตั้งใจ: ลบ TURSO_* ออกจาก shell / .env / .env.local แล้วรันใหม่ (จะใช้ prisma/prisma/dev.db)',
      '   • ถ้าตั้งใจจริง: ตั้ง ALLOW_PROD=1 เฉพาะคำสั่งนั้น',
      '',
    ].join('\n'),
  )
}
