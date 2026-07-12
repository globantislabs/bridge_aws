import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { getClientIp, rateLimit } from '@/lib/crypto'
import ZAI from 'z-ai-web-dev-sdk'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', pl: 'Polish', tr: 'Turkish',
  ar: 'Arabic', hi: 'Hindi', bn: 'Bengali', zh: 'Chinese', ja: 'Japanese',
  ko: 'Korean', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', ms: 'Malay',
  sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', cs: 'Czech',
  el: 'Greek', uk: 'Ukrainian', ro: 'Romanian', hu: 'Hungarian',
}

/**
 * Streaming translation endpoint using the ZAI SDK.
 * Returns a ReadableStream of Server-Sent-Events-style chunks:
 *   data: {"delta":"...","done":false}\n\n
 *   data: {"done":true,"latencyMs":123}\n\n
 */
export async function POST(req: NextRequest) {
  const started = Date.now()
  const user = await getSessionUser(req)
  const rateKey = `translate-stream:${user?.id ?? getClientIp(req)}`
  const rl = rateLimit(rateKey, user ? 30 : 5)
  if (!rl.ok) {
    return new Response('Rate limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetIn) },
    })
  }
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  const { text, sourceLang = 'en', targetLang = 'es' } = body as {
    text: string
    sourceLang?: string
    targetLang?: string
  }
  if (!text || typeof text !== 'string' || text.length > 4000) {
    return new Response('text required (max 4000 chars)', { status: 400 })
  }
  if (sourceLang === targetLang) {
    return streamResponse([
      { delta: text, done: false },
      { done: true, latencyMs: 0 },
    ])
  }

  const srcName = LANGUAGE_NAMES[sourceLang] ?? sourceLang
  const tgtName = LANGUAGE_NAMES[targetLang] ?? targetLang

  try {
    const zai = await ZAI.create()
    const completion: any = await zai.chat.completions.create({
      model: 'glm-4.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are a professional real-time meeting translator. Translate the user's text from ${srcName} to ${tgtName}. Output ONLY the translated text with no quotes, no preamble, no notes. Preserve the original meaning, tone, and any proper nouns. If the text is already in ${tgtName}, return it unchanged.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
      stream: true,
      max_tokens: Math.min(2000, text.length * 3),
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk?.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ delta, done: false })}\n\n`
                )
              )
            }
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                latencyMs: Date.now() - started,
              })}\n\n`
            )
          )
        } catch (e: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: e?.message ?? 'stream-error',
                done: true,
              })}\n\n`
            )
          )
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err: any) {
    console.error('[translate/stream] error:', err?.message ?? err)
    return new Response(
      JSON.stringify({ error: 'Translation service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

function streamResponse(messages: any[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const m of messages) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
