/**
 * One-command setup for Bridge.
 *
 * Run with: `bun run setup`  (or `npm run setup` / `pnpm setup`)
 *
 * What it does:
 *   1. Removes any stale / read-only SQLite db file (Windows zip extracts
 *      often leave the file read-only, causing "Error code 14: CANTOPEN").
 *   2. Creates the db/ directory if missing.
 *   3. Runs `prisma generate`  — builds the Prisma Client.
 *   4. Runs `prisma db push`   — creates all tables in the SQLite file.
 *   5. Prints next steps.
 *
 * Safe to run multiple times.
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync, chmodSync } from 'node:fs'
import { resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(dirname(__filename), '..')

function log(step, msg) {
  console.log(`\n\x1b[36m[${step}]\x1b[0m ${msg}`)
}

function ok(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
}

function warn(msg) {
  console.log(`  \x1b[33m!\x1b[0m ${msg}`)
}

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', cwd: __dirname, ...opts })
    return true
  } catch {
    return false
  }
}

// 1. Resolve the SQLite target path from DATABASE_URL (fallback to default)
const envUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
const pathPart = envUrl.startsWith('file:')
  ? envUrl.slice('file:'.length).split('?')[0]
  : envUrl
const absDbPath = isAbsolute(pathPart)
  ? pathPart
  : resolve(__dirname, pathPart)
const absDbDir = dirname(absDbPath)

log('1/5', 'Preparing database directory')
try {
  if (!existsSync(absDbDir)) {
    mkdirSync(absDbDir, { recursive: true })
    ok(`Created ${absDbDir}`)
  } else {
    ok(`Directory exists: ${absDbDir}`)
  }
} catch (e) {
  warn(`Could not create directory: ${e.message}`)
}

// 2. Remove stale / read-only DB file so Prisma can create a fresh one
log('2/5', 'Checking existing database file')
if (existsSync(absDbPath)) {
  try {
    // Try to make it writable first (Windows zip extracts often set read-only)
    chmodSync(absDbPath, 0o644)
    ok(`Existing DB file is writable: ${absDbPath}`)
  } catch {
    warn(`Existing DB file is read-only — removing it so Prisma can recreate.`)
    try {
      rmSync(absDbPath, { force: true })
      ok(`Removed stale DB file.`)
    } catch (e) {
      warn(`Could not remove: ${e.message}`)
      warn(`Try deleting ${absDbPath} manually, then re-run setup.`)
    }
  }
} else {
  ok(`No existing DB file — Prisma will create one.`)
}

// 3. Prisma generate
log('3/5', 'Generating Prisma Client')
if (!run('bunx prisma generate') && !run('npx prisma generate')) {
  warn(`prisma generate failed. Try running it manually: bunx prisma generate`)
  process.exit(1)
}
ok('Prisma Client generated.')

// 4. Prisma db push (creates tables)
log('4/5', 'Creating database schema')
if (!run('bunx prisma db push --skip-generate') && !run('npx prisma db push --skip-generate')) {
  warn(`prisma db push failed. Try running it manually: bunx prisma db push`)
  process.exit(1)
}
ok('Schema pushed to database.')

// 5. Done
log('5/5', 'Setup complete')
console.log(`
  \x1b[32m──────────────────────────────────────────────\x1b[0m
  \x1b[1mBridge is ready.\x1b[0m

  Start the dev server:
    \x1b[36mbun run dev\x1b[0m

  Then open http://localhost:3000

  Demo accounts (auto-create on first login):
    \x1b[2m•\x1b[0m demo@bridge.app  / demo1234    (consumer)
    \x1b[2m•\x1b[0m admin@bridge.app / admin1234   (SaaS owner)

  \x1b[32m──────────────────────────────────────────────\x1b[0m
`)
