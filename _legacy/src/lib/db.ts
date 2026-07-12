import { PrismaClient } from '@prisma/client'
import { existsSync, mkdirSync } from 'fs'
import { dirname, resolve, isAbsolute } from 'path'

/**
 * In development we ALWAYS create a fresh client so schema changes (e.g. new
 * models added via prisma db:push) are picked up immediately without needing
 * to restart the dev server. The global cache is only used in production.
 *
 * Additionally, we ensure the SQLite target directory exists before Prisma
 * tries to open the file. This fixes "Error code 14: Unable to open the
 * database file" on Windows when the db/ folder is missing or read-only.
 */

function ensureDbDir() {
  const url = process.env.DATABASE_URL || 'file:./db/custom.db'
  // Only handle SQLite file: URLs
  if (!url.startsWith('file:')) return
  const pathPart = url.slice('file:'.length).split('?')[0]
  // Resolve relative to cwd (project root when running `bun run dev`)
  const abs = isAbsolute(pathPart) ? pathPart : resolve(process.cwd(), pathPart)
  const dir = dirname(abs)
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      // ignore — Prisma will throw a clearer error if it still can't write
    }
  }
}

ensureDbDir()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function makeClient() {
  // Silence the chatty `prisma:query` logger — keep console clean.
  return new PrismaClient()
}

export const db =
  process.env.NODE_ENV === 'production'
    ? (globalForPrisma.prisma ?? (globalForPrisma.prisma = makeClient()))
    : makeClient()
