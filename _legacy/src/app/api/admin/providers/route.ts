import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

/** Lightweight reversible obfuscation. Swap for AES in production. */
function obfuscate(key: string): string {
  return Buffer.from(key.split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 0x5a)).join('')).toString('base64')
}

/**
 * Mirror an API provider key into the SystemSetting table so the legacy
 * realtime/translate endpoints (which read from SystemSetting) can find it.
 *
 * This unifies the two storage systems:
 *   - ApiProvider table: rich UI with multi-provider vault, monitoring, etc.
 *   - SystemSetting table: simple key-value store read by getOpenAIRealtimeKey()
 *     and getOpenAITranslateKey()
 *
 * When admin adds/updates a primary provider, we mirror it to SystemSetting
 * so the actual translation features pick it up automatically.
 */
async function mirrorToSystemSetting(
  type: string,
  isPrimary: boolean,
  apiKeyPlain: string | null,
  model: string | null
): Promise<void> {
  // Map provider type → SystemSetting keys
  const mapping: Record<string, { keyField: string; modelField: string }> = {
    openai_realtime: {
      keyField: 'openai_realtime_api_key',
      modelField: 'openai_realtime_model',
    },
    openai_translate: {
      keyField: 'openai_translate_api_key',
      modelField: 'openai_translate_model',
    },
  }
  const m = mapping[type]
  if (!m) return // other provider types don't have SystemSetting mirrors

  if (isPrimary && apiKeyPlain) {
    await db.systemSetting.upsert({
      where: { key: m.keyField },
      create: { key: m.keyField, value: apiKeyPlain },
      update: { value: apiKeyPlain },
    })
    if (model) {
      await db.systemSetting.upsert({
        where: { key: m.modelField },
        create: { key: m.modelField, value: model },
        update: { value: model },
      })
    }
  } else if (!isPrimary) {
    // If this was the primary and admin un-checked primary, check if any other
    // primary exists for this type. If not, clear the SystemSetting.
    const otherPrimary = await db.apiProvider.findFirst({
      where: { type, isPrimary: true, isActive: true },
    })
    if (!otherPrimary) {
      await db.systemSetting.deleteMany({
        where: { key: { in: [m.keyField, m.modelField] } },
      }).catch(() => {})
    }
  }
}
function deobfuscate(enc: string): string {
  const decoded = Buffer.from(enc, 'base64').toString('utf8')
  return decoded.split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 0x5a)).join('')
}

async function requireAdmin(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user || user.role !== 'admin') return null
  return user
}

/** GET — list all providers (key never returned in full) */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const rows = await db.apiProvider.findMany({
      orderBy: [{ type: 'asc' }, { isPrimary: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({
      providers: rows.map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label,
        apiKey: r.apiKeyMasked,
        model: r.model,
        endpoint: r.endpoint,
        isActive: r.isActive,
        isPrimary: r.isPrimary,
        requestCount: r.requestCount,
        errorCount: r.errorCount,
        avgLatencyMs: r.avgLatencyMs,
        lastUsedAt: r.lastUsedAt,
        createdAt: r.createdAt,
      })),
    })
  } catch (err: any) {
    console.error('[/api/admin/providers GET] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/** POST — create new provider */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json()
    const { type, label, apiKey, model, endpoint, isActive, isPrimary } = body as {
      type: string
      label: string
      apiKey: string
      model?: string
      endpoint?: string
      isActive?: boolean
      isPrimary?: boolean
    }

    if (!type || !label || !apiKey) {
      return NextResponse.json({ error: 'type, label, apiKey required' }, { status: 400 })
    }

    // If isPrimary, demote any existing primary of the same type
    if (isPrimary) {
      await db.apiProvider.updateMany({
        where: { type, isPrimary: true },
        data: { isPrimary: false },
      })
    }

    const created = await db.apiProvider.create({
      data: {
        type,
        label,
        apiKeyEnc: obfuscate(apiKey),
        apiKeyMasked: maskKey(apiKey),
        model: model || null,
        endpoint: endpoint || null,
        isActive: isActive ?? true,
        isPrimary: isPrimary ?? false,
      },
    })

    // Mirror to SystemSetting so realtime/translate endpoints can find it
    if (isActive !== false) {
      await mirrorToSystemSetting(type, isPrimary ?? false, apiKey, model || null)
    }

    await db.activityLog.create({
      data: {
        userId: admin.id,
        action: 'admin.provider.create',
        metaJson: JSON.stringify({ id: created.id, type, label }),
        ipAddress: getClientIp(req),
        severity: 'info',
      },
    })

    return NextResponse.json({ id: created.id })
  } catch (err: any) {
    console.error('[/api/admin/providers POST] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/** PATCH — update existing provider */
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const body = await req.json()
    const { label, apiKey, model, endpoint, isActive, isPrimary } = body as {
      label?: string
      apiKey?: string
      model?: string
      endpoint?: string
      isActive?: boolean
      isPrimary?: boolean
    }

    const existing = await db.apiProvider.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // If marking as primary, demote other primaries of the same type
    if (isPrimary) {
      await db.apiProvider.updateMany({
        where: { type: existing.type, isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      })
    }

    const data: any = {}
    if (label !== undefined) data.label = label
    if (apiKey) {
      data.apiKeyEnc = obfuscate(apiKey)
      data.apiKeyMasked = maskKey(apiKey)
    }
    if (model !== undefined) data.model = model || null
    if (endpoint !== undefined) data.endpoint = endpoint || null
    if (isActive !== undefined) data.isActive = isActive
    if (isPrimary !== undefined) data.isPrimary = isPrimary

    await db.apiProvider.update({ where: { id }, data })

    await db.activityLog.create({
      data: {
        userId: admin.id,
        action: 'admin.provider.update',
        metaJson: JSON.stringify({ id, fields: Object.keys(data) }),
        ipAddress: getClientIp(req),
        severity: 'info',
      },
    })

    // Mirror updated key/model to SystemSetting if this is the primary provider
    if (existing.isPrimary && existing.isActive) {
      const plainKey = apiKey ? apiKey : null
      await mirrorToSystemSetting(existing.type, true, plainKey, data.model ?? existing.model)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[/api/admin/providers PATCH] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/** DELETE — remove provider */
export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Fetch the provider before deleting so we can clean up SystemSetting
    const existing = await db.apiProvider.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.apiProvider.delete({ where: { id } })

    // If this was the primary OpenAI provider, clear the SystemSetting mirror
    if (existing.isPrimary) {
      const otherPrimary = await db.apiProvider.findFirst({
        where: { type: existing.type, isPrimary: true, isActive: true },
      })
      if (!otherPrimary) {
        const mapping: Record<string, string[]> = {
          openai_realtime: ['openai_realtime_api_key', 'openai_realtime_model'],
          openai_translate: ['openai_translate_api_key', 'openai_translate_model'],
        }
        const keys = mapping[existing.type]
        if (keys) {
          await db.systemSetting.deleteMany({
            where: { key: { in: keys } },
          }).catch(() => {})
        }
      }
    }

    await db.activityLog.create({
      data: {
        userId: admin.id,
        action: 'admin.provider.delete',
        metaJson: JSON.stringify({ id }),
        ipAddress: getClientIp(req),
        severity: 'warn',
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[/api/admin/providers DELETE] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/** Helper used internally by other server code to fetch the active primary
 *  key for a given provider type (e.g. 'openai_realtime'). */
export async function getPrimaryProviderKey(type: string): Promise<{ key: string; model?: string; endpoint?: string } | null> {
  const row = await db.apiProvider.findFirst({
    where: { type, isPrimary: true, isActive: true },
  })
  if (!row) {
    // fallback: any active provider of this type
    const any = await db.apiProvider.findFirst({
      where: { type, isActive: true },
    })
    if (!any) return null
    return { key: deobfuscate(any.apiKeyEnc), model: any.model || undefined, endpoint: any.endpoint || undefined }
  }
  return { key: deobfuscate(row.apiKeyEnc), model: row.model || undefined, endpoint: row.endpoint || undefined }
}
