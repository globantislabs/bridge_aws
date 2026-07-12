import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientIp } from '@/lib/crypto'
import { validateApiToken, hasScope, recordTokenUsage, enforceRateLimit } from '@/lib/api-auth'
import ZAI from 'z-ai-web-dev-sdk'

const LANGS: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', ar: 'Arabic', hi: 'Hindi',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', th: 'Thai',
}

/** POST /api/v1/translate — translate text via API token */
export async function POST(req: NextRequest) {
  const token = await validateApiToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Invalid or expired API token' }, { status: 401 })
  }
  if (!hasScope(token, 'translate:use')) {
    return NextResponse.json(
      { error: 'Insufficient scope (translate:use required)' },
      { status: 403 }
    )
  }
  const rl = await enforceRateLimit(token)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limited' },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
    )
  }
  // Increment usage minutes (1 per request, can be tuned)
  await db.apiToken.update({
    where: { id: token.id },
    data: {
      usedMinutes: { increment: 1 },
      lastUsedAt: new Date(),
      lastUsedIp: getClientIp(req),
      requestCount: { increment: 1 },
    },
  })
  const body = await req.json()
  const { text, sourceLang = 'en', targetLang = 'es' } = body
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'text too long' }, { status: 413 })

  try {
    const zai = await ZAI.create()
    const c = await zai.chat.completions.create({
      model: 'glm-4.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate from ${LANGS[sourceLang] ?? sourceLang} to ${LANGS[targetLang] ?? targetLang}. Output ONLY the translated text.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
    })
    const translated = (c?.choices?.[0]?.message?.content ?? '').trim()
    return NextResponse.json({
      translated,
      sourceLang,
      targetLang,
      rateLimit: { limit: token.rateLimitPerMin, remaining: rl.remaining },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Translation failed', detail: e?.message },
      { status: 503 }
    )
  }
}
