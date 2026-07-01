#!/usr/bin/env node
/**
 * Production smoke checks (no credentials required).
 * Usage: node scripts/smoke-production.mjs [baseUrl]
 *
 * Optional env:
 *   SMOKE_HR_URL=https://hrflow-hr.vercel.app — profile-specific checks
 */
const BASE = process.argv[2] ?? 'https://hrflow-app-gamma.vercel.app'
const HR_BASE = process.env.SMOKE_HR_URL ?? 'https://hrflow-hr.vercel.app'

const checks = [
  {
    name: 'login rejects empty body',
    method: 'POST',
    path: '/api/auth/login',
    body: {},
    expectStatus: 400,
  },
  {
    name: 'prototype bridge disabled',
    method: 'POST',
    path: '/api/leave/prototype',
    body: {},
    expectStatus: 403,
    expectJson: (j) => j.error === 'PROTOTYPE_BRIDGE_DISABLED',
  },
  {
    name: 'approvals API requires POST',
    method: 'GET',
    path: '/api/approvals',
    expectStatus: 405,
  },
  {
    name: 'announcements SSE requires session',
    method: 'GET',
    path: '/api/announcements/sse',
    expectStatus: 401,
  },
  {
    name: 'approval-center page requires login',
    method: 'GET',
    path: '/approval-center',
    expectStatus: [302, 307],
    expectRedirectLogin: true,
  },
  {
    name: 'payroll page requires login',
    method: 'GET',
    path: '/payroll',
    expectStatus: [302, 307],
    expectRedirectLogin: true,
  },
  {
    name: 'line webhook GET is minimal (no fingerprints)',
    method: 'GET',
    path: '/api/line/webhook',
    expectStatus: 200,
    expectJson: (j) => j.ok === true && j.envSecretFingerprint === undefined,
  },
  {
    name: 'health requires auth',
    method: 'GET',
    path: '/api/system/health',
    expectStatus: 401,
  },
  {
    name: 'org hierarchy-gaps requires auth',
    method: 'GET',
    path: '/api/org/hierarchy-gaps',
    expectStatus: 401,
  },
]

const profileChecks = [
  {
    name: 'hr profile hides /api/cases',
    base: HR_BASE,
    method: 'GET',
    path: '/api/cases',
    expectStatus: 404,
  },
  {
    name: 'hr profile allows /api/leave (auth still required)',
    base: HR_BASE,
    method: 'GET',
    path: '/api/leave',
    expectStatus: 401,
  },
]

let passed = 0
let failed = 0

async function runCheck(c, base = BASE) {
  try {
    const res = await fetch(`${base}${c.path}`, {
      method: c.method ?? 'GET',
      headers: c.body ? { 'Content-Type': 'application/json' } : undefined,
      body: c.body ? JSON.stringify(c.body) : undefined,
      redirect: 'manual',
    })
    const json = res.headers.get('content-type')?.includes('json')
      ? await res.json().catch(() => ({}))
      : {}

    const expected = Array.isArray(c.expectStatus) ? c.expectStatus : [c.expectStatus]
    const statusOk = expected.includes(res.status)
    const jsonOk = c.expectJson ? c.expectJson(json) : true
    const redirectOk = !c.expectRedirectLogin || (res.headers.get('location') ?? '').includes('/login')

    if (statusOk && jsonOk && redirectOk) {
      console.log(`✅ ${c.name}`)
      passed += 1
    } else {
      console.log(
        `❌ ${c.name} — status ${res.status} (expected ${expected.join('|')})` +
          (c.expectRedirectLogin && !redirectOk ? ' no login redirect' : ''),
      )
      failed += 1
    }
  } catch (err) {
    console.log(`❌ ${c.name} — ${err instanceof Error ? err.message : err}`)
    failed += 1
  }
}

for (const c of checks) {
  await runCheck(c)
}

console.log(`\n— HR deploy profile (${HR_BASE}) —`)
for (const c of profileChecks) {
  await runCheck(c, c.base)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
