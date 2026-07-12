#!/usr/bin/env node
/**
 * Bridge — Supabase Setup Helper
 * =================================
 *
 * Run: node scripts/check-supabase.mjs
 *
 * Validates that DATABASE_URL in .env is a real Supabase URL (not the
 * placeholder) and tells you exactly what to fix if it isn't.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const envPath = resolve(projectRoot, '.env')

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

console.log(`\n${C.bold}Bridge — Supabase Setup Check${C.reset}\n`)

if (!existsSync(envPath)) {
  console.log(`${C.red}✗ No .env file found at ${envPath}${C.reset}`)
  console.log(`  ${C.cyan}Fix:${C.reset} Run ${C.bold}cp .env.example .env${C.reset} then edit .env.\n`)
  process.exit(1)
}

const envContent = readFileSync(envPath, 'utf8')
let databaseUrl = null
for (const line of envContent.split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/)
  if (m) {
    let val = m[1].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    databaseUrl = val
    break
  }
}

if (!databaseUrl) {
  console.log(`${C.red}✗ DATABASE_URL is not set in .env${C.reset}`)
  console.log(`  ${C.cyan}Fix:${C.reset} Add this line to .env:\n`)
  console.log(`    DATABASE_URL=postgresql://postgres.REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`)
  console.log(`    (replaced with your real Supabase URL)\n`)
  process.exit(1)
}

// Mask password for display
const masked = databaseUrl.replace(/:[^:@]+@/, ':****@')
console.log(`${C.dim}Current DATABASE_URL:${C.reset} ${masked}\n`)

// Check for placeholder markers
const placeholderMarkers = ['REGION', 'REF', 'PASSWORD', 'your-password', 'YOUR_PASSWORD']
const found = placeholderMarkers.filter((m) => databaseUrl.includes(m))

if (found.length > 0) {
  console.log(`${C.red}✗ DATABASE_URL still contains placeholder text: ${found.join(', ')}${C.reset}\n`)
  console.log(`${C.bold}How to fix:${C.reset}\n`)
  console.log(`  1. Go to ${C.cyan}https://supabase.com/dashboard${C.reset} → your project`)
  console.log(`  2. Click ${C.bold}Project Settings${C.reset} (gear icon, bottom-left)`)
  console.log(`  3. Click ${C.bold}Database${C.reset}`)
  console.log(`  4. Under ${C.bold}Connection string${C.reset}, pick the ${C.bold}URI${C.reset} tab`)
  console.log(`  5. Pick ${C.bold}Session pooler${C.reset} (port 5432) — best for Prisma`)
  console.log(`  6. Click ${C.bold}Copy${C.reset}`)
  console.log(`  7. Paste it into .env, replacing the existing DATABASE_URL line`)
  console.log(`  8. Save .env and run: ${C.bold}bun run dev${C.reset}\n`)
  process.exit(1)
}

if (!databaseUrl.startsWith('postgresql://')) {
  console.log(`${C.red}✗ DATABASE_URL doesn't start with postgresql://${C.reset}`)
  console.log(`  Got: ${masked}\n`)
  process.exit(1)
}

if (!databaseUrl.includes('supabase.com')) {
  console.log(`${C.yellow}! DATABASE_URL doesn't look like a Supabase URL${C.reset}`)
  console.log(`  It will still work as long as it's a valid Postgres connection string.\n`)
}

console.log(`${C.green}✓ DATABASE_URL looks valid${C.reset}`)
console.log(`${C.dim}  Run ${C.reset}${C.bold}bun run dev${C.reset}${C.dim} to start the app.${C.reset}\n`)
process.exit(0)
