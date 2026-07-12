import { db } from './db'

/**
 * Server-only system settings helper.
 *
 * All sensitive values (OpenAI keys, SMTP creds, etc.) are stored in the
 * SystemSetting table. Values are encrypted at rest by the database layer
 * (in production, swap SQLite for Postgres + column-level encryption).
 *
 * Settings are cached in-process for 30 seconds to avoid hammering the DB
 * on every meeting packet.
 */

export type SettingKey =
  | 'openai_realtime_api_key'
  | 'openai_realtime_model'
  | 'openai_translate_api_key'
  | 'openai_translate_model'
  | 'smtp_host'
  | 'smtp_port'
  | 'smtp_user'
  | 'smtp_pass'
  | 'smtp_from'
  | 'turn_url'
  | 'turn_user'
  | 'turn_pass'
  | 'stun_url'
  | 'default_plan_tier'
  | 'signup_mode' // 'open' | 'invite'
  | 'maintenance_mode' // 'false' | 'true'
  | 'default_source_lang'
  | 'default_target_langs'

interface CacheEntry {
  value: string
  expires: number
}

const TTL_MS = 30_000
const cache = new Map<string, CacheEntry>()

async function fetchSetting(key: string): Promise<string | null> {
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.value
  const row = await db.systemSetting.findUnique({ where: { key } })
  const value = row?.value ?? null
  if (value !== null) cache.set(key, { value, expires: Date.now() + TTL_MS })
  return value
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  return fetchSetting(key)
}

export async function getSettings(
  keys: SettingKey[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(
    keys.map(async (k) => {
      const v = await fetchSetting(k)
      if (v !== null) out[k] = v
    })
  )
  return out
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
  cache.delete(key)
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.systemSetting.findMany()
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

/**
 * Returns the OpenAI Realtime API key, checking first the database (so the
 * super-admin can update it live from the control panel) and falling back
 * to the OPENAI_API_KEY environment variable.
 */
export async function getOpenAIRealtimeKey(): Promise<string | null> {
  const fromDb = await getSetting('openai_realtime_api_key')
  if (fromDb && fromDb.trim().length > 0) return fromDb.trim()
  return process.env.OPENAI_API_KEY ?? null
}

export async function getOpenAIRealtimeModel(): Promise<string> {
  const m = await getSetting('openai_realtime_model')
  if (m && m.trim().length > 0) return m.trim()
  return process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17'
}

export async function getOpenAITranslateKey(): Promise<string | null> {
  const fromDb = await getSetting('openai_translate_api_key')
  if (fromDb && fromDb.trim().length > 0) return fromDb.trim()
  return process.env.OPENAI_API_KEY ?? null
}

export async function getOpenAITranslateModel(): Promise<string> {
  const m = await getSetting('openai_translate_model')
  if (m && m.trim().length > 0) return m.trim()
  return process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini'
}

export async function getTurnServers(): Promise<RTCIceServer[]> {
  const stunUrl = (await getSetting('stun_url')) || 'stun:stun.l.google.com:19302'
  const servers: RTCIceServer[] = [{ urls: stunUrl }]
  const turnUrl = await getSetting('turn_url')
  const turnUser = await getSetting('turn_user')
  const turnPass = await getSetting('turn_pass')
  if (turnUrl && turnUser && turnPass) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPass,
    })
  }
  return servers
}
