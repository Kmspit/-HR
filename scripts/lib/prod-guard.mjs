/**
 * ตัวกันไม่ให้เครื่อง dev แตะ Turso production โดยไม่ตั้งใจ
 *
 * กติกา:
 *   - ค่าเริ่มต้นของทุกอย่างในเครื่องนี้ = local SQLite (DATABASE_URL=file:./prisma/dev.db)
 *   - TURSO_* ต้องไม่อยู่ใน .env / .env.local — loadLocalEnv() จะทิ้ง TURSO_* ที่อ่าน
 *     จากไฟล์เสมอ แม้จะมีคนเผลอใส่กลับเข้าไป
 *   - สคริปต์ที่ต้องใช้ prod จริง: ต้องใส่ --prod + ตั้ง TURSO_* ใน shell เฉพาะคำสั่งนั้น
 *     + พิมพ์ชื่อ database ยืนยัน ไม่มีทางลัดอื่น
 *   - ถ้า NODE_ENV ไม่ใช่ production แต่เจอ TURSO_* ใน env → หยุดทันที เว้นแต่ ALLOW_PROD=1
 *
 * รันกับ prod (ตัวอย่าง PowerShell):
 *   node --env-file=$HOME\.hrflow-prod.env scripts/purge-user.mjs --prod --dry-run user@example.com
 *
 * ใช้ได้ทั้งจาก .mjs และ .ts (ผ่าน tsx)
 */
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'
import { parseEnv } from 'util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** @typedef {Record<string, string | undefined>} Env */

export const PROD_ENV_KEYS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() !== ''
}

/** มี TURSO_* (ที่ไม่ใช่ค่าว่าง) อยู่ใน env หรือไม่ @param {Env} [env] */
export function hasProdCreds(env = process.env) {
  return PROD_ENV_KEYS.some((k) => nonEmpty(env[k]))
}

/**
 * runtime ที่ "ควร" ต่อ prod ได้: NODE_ENV=production หรือรันบน Vercel
 * (VERCEL_ENV=production|preview — ตั้งโดย Vercel เท่านั้น, `vercel env pull`
 * เขียนเป็น "development") ต้องยกเว้น Vercel ด้วยเพราะ postbuild-ensure-schema
 * import lib/prisma ระหว่าง build ซึ่ง NODE_ENV อาจยังไม่ใช่ production
 * @param {Env} [env]
 */
export function isProductionRuntime(env = process.env) {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview'
}

export function strayProdCredsMessage(context) {
  return [
    '',
    `⛔ [prod-guard] ${context}: พบ TURSO_DATABASE_URL/TURSO_AUTH_TOKEN ใน environment`,
    '   แต่ NODE_ENV ไม่ใช่ production — หยุดทำงานเพื่อกันการแตะ production DB โดยไม่ตั้งใจ',
    '   • ถ้าไม่ได้ตั้งใจ: ลบ TURSO_* ออกจาก shell / .env / .env.local แล้วรันใหม่ (จะใช้ prisma/prisma/dev.db)',
    '   • ถ้าตั้งใจจริง: ตั้ง ALLOW_PROD=1 เฉพาะคำสั่งนั้น',
    '',
  ].join('\n')
}

/**
 * ตัวกันข้อ 5: เจอ TURSO_* นอก production โดยไม่มี ALLOW_PROD=1 → throw
 * @param {string} context
 * @param {Env} [env]
 */
export function assertNoStrayProdCreds(context, env = process.env) {
  if (!hasProdCreds(env) || isProductionRuntime(env) || env.ALLOW_PROD === '1') return
  throw new Error(strayProdCredsMessage(context))
}

/**
 * โหลด .env.local แล้ว .env (ไม่ทับค่าที่มีอยู่แล้วใน shell) แต่ทิ้ง TURSO_* เสมอ
 * — TURSO_* มาได้จาก shell (หรือ node --env-file) อย่างเดียว
 */
export function loadLocalEnv(files = ['.env.local', '.env']) {
  for (const name of files) {
    const p = resolve(ROOT, name)
    if (!existsSync(p)) continue
    const parsed = parseEnv(readFileSync(p, 'utf8').replace(/^﻿/, ''))
    for (const [key, val] of Object.entries(parsed)) {
      if (PROD_ENV_KEYS.includes(key)) {
        console.warn(`[prod-guard] ข้าม ${key} จาก ${name} — ค่า prod ห้ามอยู่ในไฟล์ env ของเครื่องนี้`)
        continue
      }
      if (process.env[key] === undefined) process.env[key] = val
    }
  }
}

export function wantsProd(argv = process.argv) {
  return argv.includes('--prod')
}

function dbNameFromUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0]
  } catch {
    return url
  }
}

function readLine(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => {
    let answered = false
    rl.question(question, (answer) => {
      answered = true
      rl.close()
      res(answer.trim())
    })
    rl.on('close', () => {
      if (!answered) res('')
    })
  })
}

function die(msg) {
  console.error(msg)
  process.exit(1)
}

/**
 * สคริปต์ที่ต้องใช้ prod: บังคับ --prod + TURSO_* จาก shell + พิมพ์ชื่อ DB ยืนยัน
 * ผ่านแล้วตั้ง ALLOW_PROD=1 ให้ process นี้ (lib/prisma ที่ import ทีหลังจะได้ไม่ถูกบล็อก)
 * @param {string} script
 * @returns {Promise<{ url: string, authToken: string }>}
 */
export async function requireProdTarget(script, argv = process.argv) {
  if (!wantsProd(argv)) {
    die(
      `⛔ [prod-guard] ${script} เขียน/อ่าน production DB — ต้องสั่งแบบตั้งใจด้วย --prod\n` +
        `   ตัวอย่าง: node --env-file=$HOME/.hrflow-prod.env scripts/${script} --prod ...`,
    )
  }
  const url = process.env.TURSO_DATABASE_URL ?? ''
  const authToken = process.env.TURSO_AUTH_TOKEN ?? ''
  if (!nonEmpty(url) || !nonEmpty(authToken)) {
    die(
      `⛔ [prod-guard] --prod แต่ไม่มี TURSO_DATABASE_URL/TURSO_AUTH_TOKEN ใน shell\n` +
        '   (สคริปต์ไม่โหลดค่า prod จาก .env อัตโนมัติแล้ว) ใช้ node --env-file=<ไฟล์ creds นอก repo> หรือตั้งใน shell เฉพาะคำสั่งนั้น',
    )
  }
  const dbName = dbNameFromUrl(url)
  console.log('')
  console.log(`⚠️  [prod-guard] ${script} กำลังจะต่อ PRODUCTION: ${dbName}`)
  const typed = await readLine(`   พิมพ์ชื่อ database "${dbName}" เพื่อยืนยัน: `)
  if (typed !== dbName) die('ยกเลิก — ชื่อไม่ตรง ไม่ได้แตะ production')
  process.env.ALLOW_PROD = '1'
  return { url, authToken }
}

/**
 * สคริปต์ dual-mode: ไม่ใส่ --prod → local เสมอ (return null), ใส่ --prod → requireProdTarget
 * ไม่ใส่ --prod แต่มี TURSO_* ใน env → หยุด (ข้อ 5) เว้นแต่ ALLOW_PROD=1 ซึ่งก็ยังใช้ local อยู่ดี
 * @param {string} script
 * @returns {Promise<{ url: string, authToken: string } | null>}
 */
export async function resolveDbTarget(script, argv = process.argv) {
  if (wantsProd(argv)) return requireProdTarget(script, argv)
  if (hasProdCreds() && !isProductionRuntime()) {
    if (process.env.ALLOW_PROD !== '1') die(strayProdCredsMessage(script))
    console.warn(`[prod-guard] ${script}: ไม่ได้ใส่ --prod → ใช้ local DB (ไม่สน TURSO_* ใน env)`)
    for (const k of PROD_ENV_KEYS) delete process.env[k]
  }
  return null
}
