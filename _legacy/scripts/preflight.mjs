#!/usr/bin/env node
/**
 * Bridge — Pre-flight Configuration Check
 * ========================================
 *
 * Run BEFORE starting the production server. Verifies that every external
 * dependency and required config value is in place so the app can actually
 * serve traffic. Fails fast with a clear error message if anything is wrong.
 *
 * Usage:
 *   node scripts/preflight.mjs            # full check
 *   node scripts/preflight.mjs --quiet    # only print on failure
 *
 * Exit codes:
 *   0  — all checks passed, safe to start
 *   1  — one or more checks failed, do NOT start
 *
 * What it checks:
 *   1. .env file loaded + DATABASE_URL set
 *   2. DB is reachable
 *   3. All required tables exist (Session, TwoFactorSecret, User, Meeting, ...)
 *   4. At least one admin user exists
 *   5. Critical env vars set (NODE_ENV, NEXT_PUBLIC_APP_URL)
 *   6. Optional providers flagged if missing (OpenAI, SMTP, TURN)
 *   7. next/ standalone build exists (production only)
 */

import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')
const require = createRequire(import.meta.url)

const isQuiet = process.argv.includes('--quiet')

// ANSI colors
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
const warnings = []

function pass(name, detail = '') {
  passed++
  if (!isQuiet) {
    console.log(`  ${C.green}✓${C.reset} ${name}${detail ? ` ${C.dim}— ${detail}${C.reset}` : ''}`)
  }
}

function fail(name, detail, fix) {
  failed++
  console.log(`  ${C.red}✗${C.reset} ${C.bold}${name}${C.reset}`)
  console.log(`    ${C.red}Issue:${C.reset} ${detail}`)
  if (fix) console.log(`    ${C.cyan}Fix:${C.reset}   ${fix}`)
}

function warn(name, detail) {
  warnings.push(`${name}: ${detail}`)
  if (!isQuiet) {
    console.log(`  ${C.yellow}!${C.reset} ${name} ${C.dim}— ${detail}${C.reset}`)
  }
}

function section(title) {
  if (!isQuiet) console.log(`\n${C.bold}${title}${C.reset}`)
}

// ============================================================================
// 1. Load .env
// ============================================================================
section('1. Environment configuration')

const envPath = resolve(projectRoot, '.env')
if (!existsSync(envPath)) {
  fail(
    '.env file missing',
    `No .env file found at ${envPath}`,
    'Copy .env.example to .env and fill in the values.'
  )
  console.log(`\n${C.red}Pre-flight failed. Fix the issues above and re-run.${C.reset}`)
  process.exit(1)
}

// Load .env manually (so we don't require dotenv as a dep)
const envContent = readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) {
    // Strip surrounding quotes ("value" or 'value')
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[m[1]] = val
  }
}
pass('.env file loaded')

if (!process.env.DATABASE_URL) {
  fail('DATABASE_URL not set', 'Required for the app to function.', 'Add DATABASE_URL= to .env')
} else if (!process.env.DATABASE_URL.startsWith('postgresql://')) {
  fail(
    'DATABASE_URL must be a Supabase Postgres URL',
    `Got: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`,
    'Backend is PostgreSQL (Supabase). Set DATABASE_URL to your Supabase connection URL (postgresql://...). See DEPLOY.md §1.'
  )
} else if (process.env.DATABASE_URL.includes('REF') || process.env.DATABASE_URL.includes('PASSWORD') || process.env.DATABASE_URL.includes('REGION')) {
  fail(
    'DATABASE_URL is still the placeholder',
    'You have not replaced the placeholder Supabase URL with your actual project credentials.',
    'Open .env and replace DATABASE_URL with your real Supabase URL. Get it from: Supabase Dashboard → Project Settings → Database → Connection string → URI.'
  )
} else {
  pass('DATABASE_URL set (Supabase Postgres)', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'))
}

// DIRECT_URL is used by Prisma for migrations
if (!process.env.DIRECT_URL) {
  warn('DIRECT_URL not set', 'Prisma migrations may fail if DATABASE_URL is a pooler URL. Set DIRECT_URL to the direct connection string.')
} else if (!process.env.DIRECT_URL.startsWith('postgresql://')) {
  warn('DIRECT_URL is not a postgresql URL', `Got: ${process.env.DIRECT_URL.replace(/:[^:@]+@/, ':****@')}`)
} else {
  pass('DIRECT_URL set (for Prisma migrations)', process.env.DIRECT_URL.replace(/:[^:@]+@/, ':****@'))
}

if (!process.env.NODE_ENV) {
  warn('NODE_ENV not set', 'Defaulting to "development"')
  process.env.NODE_ENV = 'development'
} else {
  pass('NODE_ENV', process.env.NODE_ENV)
}

if (!process.env.NEXT_PUBLIC_APP_URL) {
  warn('NEXT_PUBLIC_APP_URL not set', 'Some absolute URLs (emails, share links) will be wrong.')
} else {
  pass('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL)
}

// ============================================================================
// 2. DB connection
// ============================================================================
section('2. Database connection')

let prisma = null
try {
  const { PrismaClient } = require('@prisma/client')
  prisma = new PrismaClient({ log: ['error'] })
  await prisma.$queryRaw`SELECT 1`
  pass('DB connection', 'reached')
} catch (e) {
  fail(
    'DB connection',
    e.message,
    `Check DATABASE_URL. If SQLite, ensure the parent directory exists. If Postgres, ensure the DB is reachable.`
  )
  console.log(`\n${C.red}Pre-flight failed. Fix the issues above and re-run.${C.reset}`)
  process.exit(1)
}

// ============================================================================
// 3. All required tables exist
// ============================================================================
section('3. Database schema (tables)')

const requiredTables = [
  'User',
  'Session',
  'TwoFactorSecret',
  'Meeting',
  'MeetingParticipant',
  'ApiToken',
  'ApiProvider',
  'ActivityLog',
  'Subscription',
  'Plan',
  'Invoice',
  'Organization',
]

for (const model of requiredTables) {
  try {
    await prisma[model].count()
    pass(`Table: ${model}`)
  } catch (e) {
    fail(
      `Table: ${model}`,
      e.message,
      'Run: bunx prisma db push && bunx prisma generate'
    )
  }
}

// ============================================================================
// 4. At least one admin user exists
// ============================================================================
section('4. Initial admin user')

try {
  const adminCount = await prisma.user.count({ where: { role: 'admin' } })
  if (adminCount === 0) {
    warn(
      'No admin users',
      'The first user to sign up will become admin, OR log in as admin@bridge.app / admin1234 to auto-bootstrap.'
    )
  } else {
    pass('Admin user exists', `${adminCount} admin(s)`)
  }
} catch (e) {
  fail('Admin check', e.message)
}

// ============================================================================
// 5. Optional providers (warnings only)
// ============================================================================
section('5. Optional service providers (warnings)')

if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR_OPENAI')) {
  warn('OpenAI API key', 'Live voice translation will be disabled. App falls back to mock translation.')
} else {
  pass('OpenAI API key set')
}

if (!process.env.SMTP_HOST || process.env.SMTP_USER === 'you@gmail.com') {
  warn('SMTP credentials', 'Email sending will be disabled.')
} else {
  pass('SMTP credentials set')
}

if (!process.env.TURN_URL || process.env.TURN_URL.includes('your-domain')) {
  warn('TURN server', 'WebRTC will only work on same-network. For prod, set up coturn.')
} else {
  pass('TURN server set')
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  // Not required — only used for Google OAuth. Email/password login works without it.
  warn('Supabase Auth (Google OAuth)', 'Optional. Email/password login works without it. Set NEXT_PUBLIC_SUPABASE_URL + ANON_KEY to enable Google login.')
} else {
  pass('Supabase Auth URL set')
}

if (!process.env.CRON_SECRET || process.env.CRON_SECRET.includes('CHANGE-ME')) {
  warn('CRON_SECRET', 'Set a unique value — protects the session-purge cron endpoint.')
} else {
  pass('CRON_SECRET set')
}

// ============================================================================
// 6. Production build exists (prod only)
// ============================================================================
if (process.env.NODE_ENV === 'production') {
  section('6. Production build artifacts')
  const standalone = resolve(projectRoot, '.next/standalone/server.js')
  if (!existsSync(standalone)) {
    fail(
      'Standalone build missing',
      `.next/standalone/server.js not found`,
      'Run: bun run build'
    )
  } else {
    pass('Standalone build exists')
  }
}

// ============================================================================
// Done
// ============================================================================
await prisma.$disconnect()

console.log('')
if (failed > 0) {
  console.log(
    `${C.red}${C.bold}✗ Pre-flight FAILED${C.reset} — ${failed} failed, ${passed} passed, ${warnings.length} warning(s)`
  )
  console.log(`\n${C.yellow}Fix the failures above before starting the server.${C.reset}`)
  process.exit(1)
}

console.log(
  `${C.green}${C.bold}✓ Pre-flight PASSED${C.reset} — ${passed} checks ok, ${warnings.length} warning(s)`
)
if (warnings.length > 0 && !isQuiet) {
  console.log(`\n${C.dim}Warnings (non-blocking):${C.reset}`)
  for (const w of warnings) console.log(`  ${C.yellow}!${C.reset} ${w}`)
}
console.log(`\n${C.green}Safe to start the server.${C.reset}`)
process.exit(0)
