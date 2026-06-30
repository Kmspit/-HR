#!/usr/bin/env node
/**
 * List API route files that may lack auth() — manual review required.
 * Usage: node scripts/audit-api-auth.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const API_ROOT = join(process.cwd(), 'app', 'api')

const PUBLIC_ALLOWLIST = [
  '/api/auth/',
  '/api/register',
  '/api/branches/public',
  '/api/webhook/',
  '/api/line/webhook',
  '/api/cron/',
  '/api/client-portal/auth/',
  '/api/forgot-password',
  '/api/holidays/check',
  '/api/security/2fa/',
]

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (name === 'route.ts') acc.push(p)
  }
  return acc
}

const routes = walk(API_ROOT)
const suspects = []

for (const file of routes) {
  const rel = file.replace(process.cwd(), '').replace(/\\/g, '/')
  const content = readFileSync(file, 'utf8')
  if (PUBLIC_ALLOWLIST.some((p) => rel.includes(p.replace(/\//g, '\\').replace('\\api\\', '/api/')) || rel.includes(p))) {
    continue
  }
  const hasAuth =
    content.includes("from '@/lib/auth'") ||
    content.includes('from "@/lib/auth"') ||
    content.includes('cronRequestAuthorized') ||
    content.includes('getPortalSession') ||
    content.includes('portal-auth') ||
    content.includes('isPrototypeBridgeEnabled')

  if (!hasAuth) {
    suspects.push(rel)
  }
}

console.log(`Scanned ${routes.length} route handlers`)
console.log(`Suspects without obvious auth (${suspects.length}):`)
for (const s of suspects.sort()) console.log(`  ${s}`)

process.exit(suspects.length > 0 ? 1 : 0)
