#!/usr/bin/env node
/**
 * Production smoke checks (no credentials required).
 * Usage: node scripts/smoke-production.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'https://hrflow-app-gamma.vercel.app'

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
    name: 'approvals requires POST',
    method: 'GET',
    path: '/api/approvals',
    expectStatus: 405,
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

let passed = 0
let failed = 0

for (const c of checks) {
  try {
    const res = await fetch(`${BASE}${c.path}`, {
      method: c.method ?? 'GET',
      headers: c.body ? { 'Content-Type': 'application/json' } : undefined,
      body: c.body ? JSON.stringify(c.body) : undefined,
    })
    const json = res.headers.get('content-type')?.includes('json')
      ? await res.json().catch(() => ({}))
      : {}

    const statusOk = res.status === c.expectStatus
    const jsonOk = c.expectJson ? c.expectJson(json) : true

    if (statusOk && jsonOk) {
      console.log(`✅ ${c.name}`)
      passed += 1
    } else {
      console.log(`❌ ${c.name} — status ${res.status} (expected ${c.expectStatus})`)
      failed += 1
    }
  } catch (err) {
    console.log(`❌ ${c.name} — ${err instanceof Error ? err.message : err}`)
    failed += 1
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
