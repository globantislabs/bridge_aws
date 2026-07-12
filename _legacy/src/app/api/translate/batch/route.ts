import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { getClientIp, rateLimit } from '@/lib/crypto'
import { getOpenAITranslateKey, getOpenAITranslateModel } from '@/lib/system-settings'
import ZAI from 'z-ai-web-dev-sdk'

/**
 * Batch translation endpoint.
 *
 * Accepts up to 50 items in a single request, sends them all to ONE LLM
 * call (numbered list), then parses the response back into individual
 * translations. This is critical for chat translation — currently every
 * chat message fires a separate /api/translate call, which means 10 messages
 * in a busy chat = 10 LLM calls. Batching collapses that to 1.
 *
 * Request:
 *   POST { items: [{ text, sourceLang, targetLang }] }
 *   - Up to 50 items
 *   - Each item's text max 1000 chars (50 * 1000 = 50k chars total)
 *
 * Response:
 *   { results: [{ index, translated, engine }] }
 *
 * Rate limit: 10 batch calls/min for authed users.
 *
 * Falls back to ZAI SDK if no OpenAI key is configured.
 */
const MAX_ITEMS = 50
const MAX_CHARS_PER_ITEM = 1000

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', pl: 'Polish', tr: 'Turkish',
  ar: 'Arabic', hi: 'Hindi', bn: 'Bengali', zh: 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)', ja: 'Japanese', ko: 'Korean',
  vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', ms: 'Malay', sv: 'Swedish',
  no: 'Norwegian', da: 'Danish', fi: 'Finnish', cs: 'Czech', el: 'Greek',
  uk: 'Ukrainian', ro: 'Romanian', hu: 'Hungarian', sw: 'Swahili',
  fa: 'Persian', ur: 'Urdu', he: 'Hebrew',
}

function langName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code
}

export async function POST(req: NextRequest) {
  const started = Date.now()
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }
  const rl = rateLimit(`translate-batch:${user.id}`, 10)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limited', resetIn: rl.resetIn },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const items: Array<{ text: string; sourceLang?: string; targetLang?: string }> =
    body?.items ?? []
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items[] required' }, { status: 400 })
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Too many items (max ${MAX_ITEMS})` },
      { status: 413 }
    )
  }

  // Validate + normalize items
  const normalized = items.map((it, i) => {
    const text = String(it?.text ?? '').slice(0, MAX_CHARS_PER_ITEM)
    const sourceLang = it?.sourceLang || 'en'
    const targetLang = it?.targetLang || 'es'
    return { index: i, text, sourceLang, targetLang }
  })

  // Items where sourceLang === targetLang → passthrough, no LLM call needed.
  const passthrough = normalized.filter((it) => it.sourceLang === it.targetLang || !it.text.trim())
  const needTranslate = normalized.filter(
    (it) => it.sourceLang !== it.targetLang && it.text.trim()
  )

  const results: Array<{ index: number; translated: string; engine: string }> = []
  for (const it of passthrough) {
    results.push({ index: it.index, translated: it.text, engine: 'passthrough' })
  }

  if (needTranslate.length > 0) {
    let engine = 'zai'
    try {
      const apiKey = await getOpenAITranslateKey()
      if (apiKey) {
        const model = await getOpenAITranslateModel()
        const out = await batchWithOpenAI(apiKey, model, needTranslate)
        for (const r of out) results.push({ ...r, engine: 'openai' })
        engine = 'openai'
      } else {
        const out = await batchWithZAI(needTranslate)
        for (const r of out) results.push({ ...r, engine: 'zai' })
      }
    } catch (e: any) {
      console.error('[translate/batch] error:', e?.message ?? e)
      // Best-effort fallback: try ZAI if OpenAI failed
      if (engine === 'openai') {
        try {
          const out = await batchWithZAI(needTranslate)
          for (const r of out) results.push({ ...r, engine: 'zai-fallback' })
        } catch (e2: any) {
          // Last resort: passthrough original text
          for (const it of needTranslate) {
            results.push({ index: it.index, translated: it.text, engine: 'passthrough-fallback' })
          }
        }
      } else {
        // ZAI failed too — passthrough original
        for (const it of needTranslate) {
          results.push({ index: it.index, translated: it.text, engine: 'passthrough-fallback' })
        }
      }
    }
  }

  // Sort results by original index for caller convenience
  results.sort((a, b) => a.index - b.index)

  return NextResponse.json({
    results,
    count: results.length,
    latencyMs: Date.now() - started,
    engine: results[0]?.engine ?? 'passthrough',
  })
}

/**
 * Sends all items to OpenAI in ONE chat completion call using a numbered list.
 * Parses the response back into individual translations by line number.
 *
 * The system prompt is cached (cache_control: ephemeral) so subsequent batch
 * calls within ~5-10 min are much cheaper.
 */
async function batchWithOpenAI(
  apiKey: string,
  model: string,
  items: Array<{ index: number; text: string; sourceLang: string; targetLang: string }>
): Promise<Array<{ index: number; translated: string }>> {
  // Group items by (sourceLang, targetLang) so each group can be batched
  // in a single LLM call with consistent instructions.
  const groups = new Map<string, typeof items>()
  for (const it of items) {
    const key = `${it.sourceLang}→${it.targetLang}`
    const g = groups.get(key) ?? []
    g.push(it)
    groups.set(key, g)
  }

  const out: Array<{ index: number; translated: string }> = []

  for (const [groupKey, groupItems] of groups) {
    const [src, tgt] = groupKey.split('→')
    const srcName = langName(src)
    const tgtName = langName(tgt)

    // Build the user prompt as a numbered list. Each line is wrapped in
    // «...» so the model can't accidentally merge items even if an item
    // contains a newline.
    const lines = groupItems.map(
      (it, i) => `[${i + 1}] «${it.text.replace(/»/g, '').replace(/\n/g, ' ')}»`
    )
    const userPrompt = `Translate each of the following ${groupItems.length} snippets from ${srcName} to ${tgtName}. Output ONE line per input, using the SAME numbering [1], [2], [3]... and wrap each translation in «...». Do not add any other commentary. Preserve meaning, tone, and proper nouns. If a snippet is already in ${tgtName}, return it unchanged.\n\n${lines.join('\n')}`

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: Math.min(4000, groupItems.length * 200),
        stream: false,
        store: false,
        logprobs: false,
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: `You are a professional real-time meeting translator. You will receive a numbered list of short text snippets. For each snippet, output the translation in the target language on a separate line, preserving the [N] numbering and wrapping the translation in «...» guillemets. Output ONLY the numbered translations — no preamble, no notes, no commentary. Preserve the original meaning, tone, and any proper nouns. Keep formatting (line breaks) if present within a single item.`,
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      throw new Error(`OpenAI ${r.status}: ${errText.slice(0, 200)}`)
    }
    const data = await r.json()
    const content: string = (data?.choices?.[0]?.message?.content ?? '').trim()

    // Parse the response — each line should look like `[N] «translation»`
    const parsed = new Map<number, string>()
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*\[(\d+)\]\s*«([\s\S]*?)»\s*$/)
      if (m) {
        const n = parseInt(m[1], 10) - 1
        const translated = m[2].trim()
        parsed.set(n, translated)
      }
    }

    // If parsing failed for some items (model broke format), fall back to
    // passthrough so the UI doesn't break.
    for (let i = 0; i < groupItems.length; i++) {
      const it = groupItems[i]
      const translated = parsed.get(i) ?? it.text
      out.push({ index: it.index, translated })
    }
  }

  return out
}

/**
 * ZAI SDK fallback (GLM model) — same numbered-list batching approach.
 */
async function batchWithZAI(
  items: Array<{ index: number; text: string; sourceLang: string; targetLang: string }>
): Promise<Array<{ index: number; translated: string }>> {
  const groups = new Map<string, typeof items>()
  for (const it of items) {
    const key = `${it.sourceLang}→${it.targetLang}`
    const g = groups.get(key) ?? []
    g.push(it)
    groups.set(key, g)
  }

  const out: Array<{ index: number; translated: string }> = []
  const zai = await ZAI.create()

  for (const [groupKey, groupItems] of groups) {
    const [src, tgt] = groupKey.split('→')
    const srcName = langName(src)
    const tgtName = langName(tgt)

    const lines = groupItems.map(
      (it, i) => `[${i + 1}] «${it.text.replace(/»/g, '').replace(/\n/g, ' ')}»`
    )
    const userPrompt = `Translate each of the following ${groupItems.length} snippets from ${srcName} to ${tgtName}. Output ONE line per input, using the SAME numbering [1], [2], [3]... and wrap each translation in «...». Do not add any other commentary. Preserve meaning, tone, and proper nouns.\n\n${lines.join('\n')}`

    const completion = await zai.chat.completions.create({
      model: 'glm-4.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are a professional real-time meeting translator. You will receive a numbered list of short text snippets. For each snippet, output the translation on a separate line, preserving the [N] numbering and wrapping the translation in «...» guillemets. Output ONLY the numbered translations — no preamble, no notes.`,
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: Math.min(4000, groupItems.length * 200),
    })
    const content: string = (completion?.choices?.[0]?.message?.content ?? '').trim()

    const parsed = new Map<number, string>()
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*\[(\d+)\]\s*«([\s\S]*?)»\s*$/)
      if (m) {
        const n = parseInt(m[1], 10) - 1
        parsed.set(n, m[2].trim())
      }
    }
    for (let i = 0; i < groupItems.length; i++) {
      const it = groupItems[i]
      const translated = parsed.get(i) ?? it.text
      out.push({ index: it.index, translated })
    }
  }

  return out
}
