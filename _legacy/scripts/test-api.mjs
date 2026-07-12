#!/usr/bin/env node
/**
 * Bridge — API Smoke Test
 * ========================
 *
 * Starts the production server (or assumes it's already running on PORT),
 * then hits every public API endpoint with realistic payloads and reports
 * pass/fail. Exits 0 if all green, 1 otherwise.
 *
 * Usage:
 *   node scripts/test-api.mjs                 # tests against http://localhost:3000
 *   PORT=4000 node scripts/test-api.mjs       # custom port
 *   BASE_URL=https://staging.example.com node scripts/test-api.mjs
 *
 * Tests cover:
 *   - /api/health
 *   - /api/auth/login (with built-in admin account)
 *   - /api/auth/me
 *   - /api/meetings (list + create + get-by-code)
 *   - /api/admin?view=overview (as admin)
 *   - /api/admin/providers (as admin)
 *   - /api/translate (sandbox fallback)
 *   - /api/auth/logout
 */

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

let passed = 0
let failed = 0
const failures = []

async function req(method, path, body, opts = {}) {
  const url = `${BASE}${path}`
  const headers = { ...(opts.headers || {}) }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...opts,
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json, headers: res.headers }
}

function assert(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ${C.green}✓${C.reset} ${name}${detail ? ` ${C.dim}— ${detail}${C.reset}` : ''}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  ${C.red}✗${C.reset} ${C.bold}${name}${C.reset}`)
  }
}

function section(title) {
  console.log(`\n${C.bold}${title}${C.reset}`)
}

// Cookie jar for the test session
let cookie = ''

// ============================================================================
console.log(`${C.bold}Bridge API Smoke Test${C.reset}`)
console.log(`Target: ${C.cyan}${BASE}${C.reset}\n`)

// 1. Health (no auth)
section('1. Health endpoint')
try {
  const r = await req('GET', '/api/health')
  assert('GET /api/health returns 200', r.status === 200, `got ${r.status}`)
  assert('health status=ok', r.json?.status === 'ok', `got ${r.json?.status}`)
  assert('DB check passes', r.json?.checks?.find(c => c.name === 'database')?.ok === true)
} catch (e) {
  assert('GET /api/health reachable', false, e.message)
  console.log(`\n${C.red}Server not running at ${BASE}. Start it first with: bun run dev${C.reset}`)
  process.exit(1)
}

// 2. Auth — login as admin
section('2. Login (admin@bridge.app)')
{
  const r = await req('POST', '/api/auth/login', {
    email: 'admin@bridge.app',
    password: 'admin1234',
  })
  assert('login returns 200', r.status === 200, `got ${r.status} ${r.json?.error || ''}`)
  assert('login returns user', !!r.json?.user?.id)
  // Capture cookie
  const setCookie = r.headers.get('set-cookie') || ''
  cookie = setCookie.split(';')[0]
  assert('session cookie set', cookie.startsWith('pm_session='))
}

// 3. /api/auth/me
section('3. Session validation (/api/auth/me)')
{
  const r = await req('GET', '/api/auth/me', null, {
    headers: { Cookie: cookie },
  })
  assert('/me returns 200', r.status === 200)
  assert('/me returns admin user', r.json?.user?.role === 'admin')
}

// 4. Meetings — create + list + lookup by code
section('4. Meetings')
let meetingCode = ''
{
  const r = await req('POST', '/api/meetings', {
    title: 'API Test Meeting',
    transcriptLang: 'en',
    targetLangs: 'en,es,fr',
  }, { headers: { Cookie: cookie } })
  assert('POST /api/meetings returns 200', r.status === 200, `got ${r.status} ${r.json?.error || ''}`)
  assert('meeting has joinCode', !!r.json?.meeting?.joinCode)
  meetingCode = r.json?.meeting?.joinCode || ''
  assert('meeting has id', !!r.json?.meeting?.id)
}
{
  const r = await req('GET', '/api/meetings', null, { headers: { Cookie: cookie } })
  assert('GET /api/meetings returns 200', r.status === 200)
  assert('list contains meetings', Array.isArray(r.json?.meetings) && r.json.meetings.length > 0)
}
{
  const r = await req('GET', `/api/meetings?code=${encodeURIComponent(meetingCode)}`, null, {
    headers: { Cookie: cookie },
  })
  assert('GET /api/meetings?code= finds meeting', r.status === 200 && !!r.json?.meeting)
}
{
  const r = await req('GET', '/api/meetings?share=FAKE-CODE', null, {
    headers: { Cookie: cookie },
  })
  assert('GET /api/meetings?share=FAKE returns 404', r.status === 404, `got ${r.status}`)
}

// 5. Admin endpoints
section('5. Admin panel')
{
  const r = await req('GET', '/api/admin?view=overview', null, {
    headers: { Cookie: cookie },
  })
  assert('GET /api/admin?view=overview returns 200', r.status === 200, `got ${r.status} ${r.json?.error || ''}`)
  assert('overview has totalUsers field', typeof r.json?.overview?.totalUsers === 'number')
}
{
  const r = await req('GET', '/api/admin?view=users', null, {
    headers: { Cookie: cookie },
  })
  assert('GET /api/admin?view=users returns 200', r.status === 200)
  assert('users list is array', Array.isArray(r.json?.users))
}
{
  const r = await req('GET', '/api/admin/providers', null, {
    headers: { Cookie: cookie },
  })
  assert('GET /api/admin/providers returns 200', r.status === 200, `got ${r.status} ${r.json?.error || ''}`)
  assert('providers list is array', Array.isArray(r.json?.providers))
}

// 6. Translation (sandbox fallback)
section('6. Translation (sandbox)')
{
  const r = await req('POST', '/api/translate', {
    text: 'Hello',
    targetLang: 'es',
  }, { headers: { Cookie: cookie } })
  // 200 or 5xx — we just want it to not crash
  assert('POST /api/translate responds', r.status < 500, `got ${r.status}`)
}

// 7. 2FA — setup + verify (round-trip; we don't actually enable it for admin)
section('7. Two-factor auth')
{
  const r = await req('POST', '/api/auth/2fa/setup', {}, {
    headers: { Cookie: cookie },
  })
  assert('POST /api/auth/2fa/setup returns 200', r.status === 200, `got ${r.status} ${r.json?.error || ''}`)
  assert('setup returns QR code', !!r.json?.qr)
  assert('setup returns backup codes', Array.isArray(r.json?.backupCodes) && r.json.backupCodes.length === 8)

  // We won't verify (would need a real TOTP code) — just check the endpoint exists
  // and rejects bad input.
  const v = await req('POST', '/api/auth/2fa/verify', { code: '000000' }, {
    headers: { Cookie: cookie },
  })
  assert('verify rejects bad code with 401', v.status === 401, `got ${v.status}`)

  // Disable (cleanup) — needs password
  const d = await req('POST', '/api/auth/2fa/disable', { password: 'admin1234' }, {
    headers: { Cookie: cookie },
  })
  assert('disable returns 200', d.status === 200, `got ${d.status} ${d.json?.error || ''}`)
}

// 8. Logout
section('8. Logout')
{
  const r = await req('POST', '/api/auth/logout', {}, {
    headers: { Cookie: cookie },
  })
  assert('POST /api/auth/logout returns 200', r.status === 200)
}

// ============================================================================
console.log('')
if (failed === 0) {
  console.log(`${C.green}${C.bold}✓ All ${passed} tests passed${C.reset}`)
  process.exit(0)
} else {
  console.log(`${C.red}${C.bold}✗ ${failed} test(s) failed${C.reset} (${passed} passed)`)
  console.log(`\nFailed: ${failures.join(', ')}`)
  process.exit(1)
}
