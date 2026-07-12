#!/usr/bin/env node
/**
 * Bridge — NEW Endpoint Smoke Tests (added in upgrade-1)
 * Tests the 3 newly created endpoints + cost optimization features.
 *
 * Run AFTER scripts/test-api.mjs (which sets up the admin user).
 */

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3199}`

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

let passed = 0, failed = 0
const failures = []

async function req(method, path, body, opts = {}) {
  const url = `${BASE}${path}`
  const headers = { ...(opts.headers || {}) }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    ...opts,
  })
  let data = null
  try { data = await res.json() } catch {}
  return { status: res.status, data, headers: res.headers }
}

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ${C.green}✓${C.reset} ${name}${detail ? ' ' + C.dim + detail + C.reset : ''}`)
    passed++
  } else {
    console.log(`  ${C.red}✗${C.reset} ${name}${detail ? ' — ' + C.red + detail + C.reset : ''}`)
    failed++
    failures.push(name)
  }
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log(`${C.bold}${C.cyan}Bridge NEW Endpoint Tests${C.reset}`)
  console.log(`Target: ${C.dim}${BASE}${C.reset}\n`)

  /* ── 1. Login as admin first ───────────────────────────────────── */
  console.log(`${C.bold}1. Login as admin${C.reset}`)
  const loginRes = await req('POST', '/api/auth/login', {
    email: 'admin@bridge.app',
    password: 'admin1234',
  })
  const cookie = loginRes.headers.get('set-cookie') || ''
  const sessionCookie = cookie.split(';')[0]
  check('login succeeds', loginRes.status === 200, `got ${loginRes.status}`)

  const authHeaders = { Cookie: sessionCookie }

  /* ── 2. /api/translate/test ────────────────────────────────────── */
  console.log(`\n${C.bold}2. /api/translate/test (NEW)${C.reset}`)
  
  // 2a. GET — should return whether key is configured
  const testGetRes = await req('GET', '/api/translate/test', null, { headers: authHeaders })
  check('GET /api/translate/test returns 200', testGetRes.status === 200, `got ${testGetRes.status}`)
  check('GET returns configured boolean', typeof testGetRes.data?.configured === 'boolean')
  
  // 2b. POST — should attempt to mint Realtime session
  const testPostRes = await req('POST', '/api/translate/test', {
    sourceLang: 'en', targetLang: 'es',
  }, { headers: authHeaders })
  check('POST /api/translate/test returns 200', testPostRes.status === 200, `got ${testPostRes.status}`)
  check('response has ok field', typeof testPostRes.data?.ok === 'boolean')
  // Will be ok:false since no OpenAI key is configured in test env — that's expected
  if (testPostRes.data?.ok === false) {
    check('returns clear detail message when key missing', 
      typeof testPostRes.data?.detail === 'string' && testPostRes.data.detail.length > 10,
      `got: ${testPostRes.data?.detail?.slice(0, 80)}`)
  } else if (testPostRes.data?.ok === true) {
    check('returns model + latency on success', 
      typeof testPostRes.data?.model === 'string' && typeof testPostRes.data?.latencyMs === 'number')
  }

  /* ── 3. /api/admin/providers/test ──────────────────────────────── */
  console.log(`\n${C.bold}3. /api/admin/providers/test (NEW)${C.reset}`)
  
  // 3a. POST without providerId/type — should 400
  const badProviderRes = await req('POST', '/api/admin/providers/test', {}, { headers: authHeaders })
  check('POST without body returns 400', badProviderRes.status === 400, `got ${badProviderRes.status}`)
  
  // 3b. POST with type=openai_realtime — should test the key (will fail gracefully since no key)
  const providerTestRes = await req('POST', '/api/admin/providers/test', {
    type: 'openai_realtime',
    apiKey: 'sk-test-invalid-key-for-smoke-test-only',
  }, { headers: authHeaders })
  check('POST with type=openai_realtime returns 200', providerTestRes.status === 200, `got ${providerTestRes.status}`)
  check('returns ok:boolean', typeof providerTestRes.data?.ok === 'boolean')
  // Should fail since key is invalid — that proves the endpoint is actually testing
  if (providerTestRes.data?.ok === false) {
    check('returns detail on failure', typeof providerTestRes.data?.detail === 'string')
  }
  
  // 3c. GET — pipeline test
  const pipelineRes = await req('GET', '/api/admin/providers/test', null, { headers: authHeaders })
  check('GET /api/admin/providers/test returns 200', pipelineRes.status === 200, `got ${pipelineRes.status}`)

  /* ── 4. /api/translate/batch ───────────────────────────────────── */
  console.log(`\n${C.bold}4. /api/translate/batch (NEW)${C.reset}`)
  
  // 4a. POST with empty items
  const emptyBatchRes = await req('POST', '/api/translate/batch', { items: [] }, { headers: authHeaders })
  check('POST with empty items returns 400', emptyBatchRes.status === 400, `got ${emptyBatchRes.status}`)
  
  // 4b. POST with too many items
  const tooMany = Array(51).fill({ text: 'hello', sourceLang: 'en', targetLang: 'es' })
  const tooManyRes = await req('POST', '/api/translate/batch', { items: tooMany }, { headers: authHeaders })
  check('POST with 51 items returns 413 (or 400)', tooManyRes.status === 413 || tooManyRes.status === 400, `got ${tooManyRes.status}`)
  
  // 4c. POST with valid batch
  const validBatchRes = await req('POST', '/api/translate/batch', {
    items: [
      { text: 'Hello, how are you?', sourceLang: 'en', targetLang: 'es' },
      { text: 'Nice to meet you', sourceLang: 'en', targetLang: 'es' },
    ],
  }, { headers: authHeaders })
  check('POST with valid batch returns 200', validBatchRes.status === 200, `got ${validBatchRes.status}`)
  check('response has results array', Array.isArray(validBatchRes.data?.results))
  if (validBatchRes.data?.results) {
    check('results has 2 items', validBatchRes.data.results.length === 2, `got ${validBatchRes.data.results.length}`)
    check('each result has translated field', 
      validBatchRes.data.results.every(r => typeof r.translated === 'string'))
    check('each result has engine field',
      validBatchRes.data.results.every(r => typeof r.engine === 'string'))
  }

  /* ── 5. Cost optimization: cache + prompt caching ──────────────── */
  console.log(`\n${C.bold}5. Translation cache (NEW)${C.reset}`)
  
  // Translate same text twice — second should be cached
  const cacheTestText = `Cache test ${Date.now()} — hello world`
  const t1 = await req('POST', '/api/translate', {
    text: cacheTestText, sourceLang: 'en', targetLang: 'es',
  }, { headers: authHeaders })
  check('first translate call returns 200', t1.status === 200, `got ${t1.status}`)
  check('first call cached=false', t1.data?.cached === false, `got cached=${t1.data?.cached}`)
  
  const t2 = await req('POST', '/api/translate', {
    text: cacheTestText, sourceLang: 'en', targetLang: 'es',
  }, { headers: authHeaders })
  check('second call cached=true', t2.data?.cached === true, `got cached=${t2.data?.cached}`)
  check('cached result matches first call', t1.data?.translated === t2.data?.translated)

  /* ── 6. Activity log throttling ────────────────────────────────── */
  console.log(`\n${C.bold}6. Activity log throttling (NEW)${C.reset}`)
  // We can't easily verify this from the API surface, but we can verify the translate endpoint still works
  // when called rapidly (which would have caused DB write contention before)
  const rapidCalls = await Promise.all([
    req('POST', '/api/translate', { text: 'rapid1', sourceLang: 'en', targetLang: 'es' }, { headers: authHeaders }),
    req('POST', '/api/translate', { text: 'rapid2', sourceLang: 'en', targetLang: 'es' }, { headers: authHeaders }),
    req('POST', '/api/translate', { text: 'rapid3', sourceLang: 'en', targetLang: 'es' }, { headers: authHeaders }),
    req('POST', '/api/translate', { text: 'rapid4', sourceLang: 'en', targetLang: 'es' }, { headers: authHeaders }),
    req('POST', '/api/translate', { text: 'rapid5', sourceLang: 'en', targetLang: 'es' }, { headers: authHeaders }),
  ])
  check('5 rapid calls all succeed', rapidCalls.every(r => r.status === 200), 
    `got statuses: ${rapidCalls.map(r => r.status).join(',')}`)

  /* ── 7. Health endpoint still reports DB ok ────────────────────── */
  console.log(`\n${C.bold}7. Final health check${C.reset}`)
  const finalHealth = await req('GET', '/api/health')
  check('health endpoint still 200', finalHealth.status === 200)
  check('DB still healthy', finalHealth.data?.checks?.find(c => c.name === 'database')?.ok === true)

  /* ── Summary ───────────────────────────────────────────────────── */
  console.log('\n' + '═'.repeat(60))
  if (failed === 0) {
    console.log(`${C.green}${C.bold}✓ All ${passed} tests passed${C.reset}`)
  } else {
    console.log(`${C.red}${C.bold}✗ ${failed}/${passed + failed} tests failed${C.reset}`)
    console.log(`\nFailures:`)
    failures.forEach(f => console.log(`  ${C.red}-${C.reset} ${f}`))
  }
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => {
  console.error(C.red + 'Fatal error:' + C.reset, e)
  process.exit(1)
})
