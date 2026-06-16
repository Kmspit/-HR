/** Login + test authenticated APIs (run while npm run dev is up) */
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const EMAIL = process.env.TEST_EMAIL
const PASSWORD = process.env.TEST_PASSWORD

if (!EMAIL || !PASSWORD) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD env vars before running.')
  process.exit(1)
}

const jar = new Map()

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? []
  for (const line of raw) {
    const [pair] = line.split(';')
    const i = pair.indexOf('=')
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

async function fetchJson(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
    },
    redirect: 'manual',
  })
  storeCookies(res)
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text.slice(0, 200) }
  }
  return { ok: res.ok, status: res.status, data }
}

async function login() {
  const csrf = await fetchJson('/api/auth/csrf')
  if (!csrf.ok) throw new Error(`csrf failed ${csrf.status}`)

  const body = new URLSearchParams({
    csrfToken: csrf.data.csrfToken,
    email: EMAIL,
    password: PASSWORD,
    redirect: 'false',
    json: 'true',
  })

  const signIn = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(),
    },
    body,
    redirect: 'manual',
  })
  storeCookies(signIn)
  console.log('login status:', signIn.status)

  const session = await fetchJson('/api/auth/session')
  console.log('session:', session.ok ? session.data?.user?.email : session.data)
  if (!session.data?.user) throw new Error('no session after login')
  return session.data.user
}

async function main() {
  const user = await login()

  const leave = await fetchJson('/api/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'SICK',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      days: 1,
      reason: 'test script',
    }),
  })
  console.log('leave:', leave.status, leave.data)

  const fd = new FormData()
  fd.append('lat', '13.7563')
  fd.append('lng', '100.5018')
  fd.append('address', 'test')
  fd.append('locationType', 'outside')

  const checkin = await fetchJson('/api/attendance/checkin', { method: 'POST', body: fd })
  console.log('checkin:', checkin.status, checkin.data)

  const register = await fetchJson('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prefix: 'นาย',
      firstName: 'ทด',
      lastName: 'สอบ',
      email: `api${Date.now()}@test.com`,
      phone: '0899999999',
      role: 'EMPLOYEE',
      department: 'IT',
      startDate: '2026-05-01',
      socialSecurity: true,
      password: 'testpass123',
      name: 'นายทด สอบ',
    }),
  })
  console.log('register:', register.status, register.data?.message ?? register.data?.error)

  console.log('OK — APIs work. user:', user.email)
}

main().catch((e) => {
  console.error('FAIL:', e)
  process.exit(1)
})
