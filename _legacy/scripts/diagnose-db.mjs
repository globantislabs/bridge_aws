#!/usr/bin/env node
/**
 * Bridge — Database Connection Diagnostic
 * =======================================
 *
 * Run: node scripts/diagnose-db.mjs
 *
 * Tests your database connection step-by-step and tells you EXACTLY what's
 * wrong and how to fix it. Works on Windows PowerShell, macOS, and Linux.
 *
 * Tests performed:
 *   1. .env file exists and DATABASE_URL is set
 *   2. URL is correctly formatted (no placeholder text)
 *   3. DNS resolution of the host
 *   4. IPv4 TCP connectivity to port 5432
 *   5. IPv6 TCP connectivity (Supabase free tier uses IPv6-only)
 *   6. Prisma can actually authenticate
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import net from 'net'
import dns from 'dns/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const require = createRequire(import.meta.url)

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
}

console.log(`\n${C.bold}${C.magenta}Bridge — Database Connection Diagnostic${C.reset}\n`)

// ─── Step 1: Load .env ──────────────────────────────────────────────────────
const envPath = resolve(projectRoot, '.env')
if (!existsSync(envPath)) {
  console.log(`${C.red}✗ No .env file at ${envPath}${C.reset}`)
  console.log(`  ${C.cyan}Fix:${C.reset} Run ${C.bold}cp .env.example .env${C.reset} and edit it.\n`)
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
  console.log(`${C.red}✗ DATABASE_URL is not set in .env${C.reset}\n`)
  process.exit(1)
}

// Parse the URL
let url
try {
  url = new URL(databaseUrl)
} catch (e) {
  console.log(`${C.red}✗ DATABASE_URL is not a valid URL${C.reset}`)
  console.log(`  ${C.dim}${databaseUrl}${C.reset}\n`)
  console.log(`  ${C.cyan}Fix:${C.reset} Make sure it looks like:`)
  console.log(`    postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres\n`)
  process.exit(1)
}

const host = url.hostname
const port = parseInt(url.port || '5432', 10)
const maskedUrl = databaseUrl.replace(/:[^:@]+@/, ':****@')

console.log(`${C.dim}URL:${C.reset} ${maskedUrl}`)
console.log(`${C.dim}Host:${C.reset} ${host}`)
console.log(`${C.dim}Port:${C.reset} ${port}`)
console.log(`${C.dim}Username:${C.reset} ${url.username}`)
console.log(`${C.dim}Password:${C.reset} ${url.password ? '(set, ' + url.password.length + ' chars)' : '(empty!)'}\n`)

// ─── Step 2: Check for placeholder text ─────────────────────────────────────
const placeholderMarkers = ['REGION', 'REF', 'PASSWORD', 'YOUR-PASSWORD', '[YOUR']
const foundPlaceholders = placeholderMarkers.filter((m) => databaseUrl.includes(m))
if (foundPlaceholders.length > 0) {
  console.log(`${C.red}✗ URL still contains placeholder text: ${foundPlaceholders.join(', ')}${C.reset}`)
  console.log(`  ${C.cyan}Fix:${C.reset} Replace these with your real Supabase credentials.\n`)
  process.exit(1)
}

// ─── Step 3: Check if password contains unencoded special chars ─────────────
// The URL parser will decode %40 to @, so if password contains @, it was either
// encoded correctly OR the URL was misparsed.
if (url.password.includes('@')) {
  console.log(`${C.yellow}! Your password contains an '@' character${C.reset}`)
  console.log(`  ${C.dim}Decoded password: ${url.password}${C.reset}`)
  console.log(`  ${C.dim}Host parsed as:   ${host}${C.reset}`)
  if (!host.endsWith('.supabase.co') && !host.endsWith('.pooler.supabase.com')) {
    console.log(`  ${C.red}✗ Host doesn't look like a Supabase host!${C.reset}`)
    console.log(`  ${C.cyan}Fix:${C.reset} URL-encode the '@' in your password as '%40'.`)
    console.log(`  Example: ${C.bold}postgresql://postgres:Credorafin%402026@db.XXX.supabase.co:5432/postgres${C.reset}\n`)
    process.exit(1)
  } else {
    console.log(`  ${C.green}✓ Host looks correct — password was URL-encoded properly${C.reset}\n`)
  }
}

// ─── Step 4: DNS resolution ─────────────────────────────────────────────────
console.log(`${C.bold}Step 1: DNS resolution${C.reset}`)
let addresses = []
try {
  addresses = await dns.resolve4(host) // IPv4
  console.log(`  ${C.green}✓ IPv4 addresses:${C.reset} ${addresses.join(', ')}`)
} catch (e) {
  console.log(`  ${C.yellow}! No IPv4 DNS records (this is normal for Supabase free tier)${C.reset}`)
}
let v6Addresses = []
try {
  v6Addresses = await dns.resolve6(host) // IPv6
  console.log(`  ${C.green}✓ IPv6 addresses:${C.reset} ${v6Addresses.join(', ')}`)
} catch (e) {
  console.log(`  ${C.yellow}! No IPv6 DNS records${C.reset}`)
}
if (addresses.length === 0 && v6Addresses.length === 0) {
  console.log(`  ${C.red}✗ DNS resolution failed completely${C.reset}`)
  console.log(`  ${C.cyan}Fix:${C.reset} Check your internet connection / DNS server.\n`)
  process.exit(1)
}
console.log()

// ─── Step 5: IPv4 TCP connectivity ──────────────────────────────────────────
console.log(`${C.bold}Step 2: IPv4 TCP connectivity to ${host}:${port}${C.reset}`)
if (addresses.length === 0) {
  console.log(`  ${C.yellow}! Host has no IPv4 address — skipping${C.reset}`)
  console.log(`  ${C.dim}This is the cause of your error: Supabase free-tier direct connection${C.reset}`)
  console.log(`  ${C.dim}is IPv6-only. Your network must support IPv6 to use this URL.${C.reset}\n`)
} else {
  const ipv4Result = await new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(5000)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, addresses[0])
  })
  if (ipv4Result) {
    console.log(`  ${C.green}✓ IPv4 TCP connection succeeded${C.reset}\n`)
  } else {
    console.log(`  ${C.red}✗ IPv4 TCP connection failed (firewall or ISP blocking port ${port})${C.reset}\n`)
  }
}

// ─── Step 6: IPv6 TCP connectivity ──────────────────────────────────────────
console.log(`${C.bold}Step 3: IPv6 TCP connectivity to ${host}:${port}${C.reset}`)
if (v6Addresses.length === 0) {
  console.log(`  ${C.yellow}! Host has no IPv6 address — skipping${C.reset}\n`)
} else {
  const ipv6Result = await new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(5000)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, v6Addresses[0])
  })
  if (ipv6Result) {
    console.log(`  ${C.green}✓ IPv6 TCP connection succeeded${C.reset}\n`)
  } else {
    console.log(`  ${C.red}✗ IPv6 TCP connection failed${C.reset}`)
    console.log(`  ${C.dim}This is the most common cause: Supabase free-tier direct URL${C.reset}`)
    console.log(`  ${C.dim}is IPv6-only, and your ISP/router does not route IPv6 traffic.${C.reset}\n`)
  }
}

// ─── Step 7: Try Prisma connection ──────────────────────────────────────────
console.log(`${C.bold}Step 4: Prisma authentication test${C.reset}`)
let prisma = null
try {
  const { PrismaClient } = require('@prisma/client')
  prisma = new PrismaClient({ log: ['error'], datasources: { db: { url: databaseUrl } } })
  await prisma.$queryRaw`SELECT 1`
  console.log(`  ${C.green}✓ Prisma connected and authenticated successfully!${C.reset}\n`)
  console.log(`${C.green}${C.bold}✓ Your database connection is fully working.${C.reset}`)
  console.log(`${C.dim}  Run ${C.reset}${C.bold}bun run dev${C.reset}${C.dim} to start the app.${C.reset}\n`)
  await prisma.$disconnect()
  process.exit(0)
} catch (e) {
  console.log(`  ${C.red}✗ Prisma connection failed${C.reset}`)
  console.log(`  ${C.dim}Error: ${e.message.split('\n')[0]}${C.reset}\n`)
  if (prisma) try { await prisma.$disconnect() } catch {}

  // ─── Diagnose & recommend ─────────────────────────────────────────────────
  console.log(`${C.bold}${C.magenta}Diagnosis & Fix${C.reset}\n`)

  const msg = e.message.toLowerCase()
  if (msg.includes('can\'t reach') || msg.includes('timed out') || msg.includes('econnrefused')) {
    console.log(`${C.yellow}PROBLEM: Network can't reach the database server.${C.reset}\n`)
    console.log(`${C.bold}Solutions (pick ONE):${C.reset}\n`)
    console.log(`  ${C.cyan}1. Enable IPv6 on your Windows machine${C.reset}`)
    console.log(`     ${C.dim}PowerShell (as Admin):${C.reset}`)
    console.log(`     ${C.dim}  Set-NetIPv6Protocol -DisabledState Enabled${C.reset}`)
    console.log(`     ${C.dim}  Restart your router if it doesn't support IPv6${C.reset}`)
    console.log(`     ${C.dim}  (most Jio/Airtel home routers do support IPv6 — enable it in router admin)${C.reset}\n`)
    console.log(`  ${C.cyan}2. Use a VPN${C.reset}`)
    console.log(`     ${C.dim}ProtonVPN (free), Cloudflare WARP, or any VPN with IPv6 support${C.reset}`)
    console.log(`     ${C.dim}Connect to VPN, then re-run: bun run db:push${C.reset}\n`)
    console.log(`  ${C.cyan}3. Try a different network${C.reset}`)
    console.log(`     ${C.dim}Mobile hotspot from a different carrier (Jio↔Airtel switch)${C.reset}`)
    console.log(`     ${C.dim}Office network, coffee shop Wi-Fi, etc.${C.reset}\n`)
    console.log(`  ${C.cyan}4. Switch to Session Pooler URL (recommended — uses IPv4)${C.reset}`)
    console.log(`     ${C.dim}Supabase Dashboard → Project Settings → Database → Connection string${C.reset}`)
    console.log(`     ${C.dim}→ Pick "Session pooler" (port 6543, host aws-0-REGION.pooler.supabase.com)${C.reset}`)
    console.log(`     ${C.dim}→ Append ?pgbouncer=true&connection_limit=1 to the URL${C.reset}\n`)
  } else if (msg.includes('authentication') || msg.includes('password') || msg.includes('role')) {
    console.log(`${C.yellow}PROBLEM: Database rejected your credentials.${C.reset}\n`)
    console.log(`${C.bold}Solutions:${C.reset}\n`)
    console.log(`  ${C.cyan}1. Verify your database password${C.reset}`)
    console.log(`     ${C.dim}Supabase Dashboard → Project Settings → Database → Database password${C.reset}`)
    console.log(`     ${C.dim}Reset it if unsure — avoid special chars like @ : / # ? in the new password${C.reset}\n`)
    console.log(`  ${C.cyan}2. Verify username${C.reset}`)
    console.log(`     ${C.dim}Direct URL uses 'postgres' as username${C.reset}`)
    console.log(`     ${C.dim}Pooler URL uses 'postgres.PROJECT_REF' as username${C.reset}\n`)
  } else if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema')) {
    console.log(`${C.yellow}PROBLEM: Database connected but schema is not set up.${C.reset}\n`)
    console.log(`${C.bold}Fix:${C.reset}`)
    console.log(`  ${C.cyan}bun run db:push${C.reset}\n`)
  } else {
    console.log(`${C.yellow}PROBLEM: Unknown error.${C.reset}`)
    console.log(`  ${C.dim}Full error:${C.reset}`)
    console.log(`  ${C.dim}${e.message}${C.reset}\n`)
  }
  process.exit(1)
}
