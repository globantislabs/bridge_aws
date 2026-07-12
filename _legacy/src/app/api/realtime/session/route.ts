import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import {
  getOpenAIRealtimeKey,
  getOpenAIRealtimeModel,
} from '@/lib/system-settings'
import { getClientIp } from '@/lib/crypto'

/**
 * POST /api/realtime/session
 *
 * Creates an ephemeral OpenAI Realtime API session token for the
 * authenticated user. The client then connects directly to OpenAI's
 * Realtime WebSocket endpoint using this token — no API key is exposed
 * to the browser.
 *
 * Body:
 *   - sourceLang: ISO-639-1 (e.g. "en")
 *   - targetLang: ISO-639-1 (e.g. "es")
 *   - voice: optional voice preset
 *
 * Returns:
 *   - sessionId: ephemeral session id from OpenAI
 *   - token: ephemeral client secret (1 min TTL)
 *   - model: the model used
 *   - wsUrl: wss endpoint to connect to
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 })
  }

  const apiKey = await getOpenAIRealtimeKey()
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'OpenAI Realtime API key not configured. Super-admin must add it in Admin Panel → System settings.',
        code: 'no_api_key',
      },
      { status: 503 }
    )
  }

  const model = await getOpenAIRealtimeModel()
  const body = await req.json().catch(() => ({}))
  const sourceLang: string = body.sourceLang || 'en'
  const targetLang: string = body.targetLang || 'es'
  const voice: string = body.voice || 'alloy'

  // Build Realtime session instructions — the model is told to:
  //   1. Listen to the user's spoken sourceLang utterances
  //   2. Respond with a near-simultaneous translation in targetLang
  //   3. Be terse — no chit-chat, just translate
  const instructions = `You are a real-time interpreter. The user speaks ${sourceLang}. You must translate everything they say into ${targetLang} as faithfully and quickly as possible.

Rules:
- Output ONLY the translation in ${targetLang}. Never add commentary.
- Maintain the speaker's tone, register, and intent.
- If the speaker pauses mid-sentence, output the partial translation so far.
- If you hear filler ("um", "uh"), drop it.
- Never refuse to translate; if a word is untranslatable, transliterate.
- Keep latency as low as possible — prefer a short partial over a long complete sentence.`

  try {
    const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1',
      },
      body: JSON.stringify({
        model,
        voice,
        instructions,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        input_audio_transcription: {
          model: 'whisper-1',
        },
      }),
    })

    if (!r.ok) {
      const text = await r.text()
      console.error('Realtime session error', r.status, text)
      return NextResponse.json(
        { error: `OpenAI error: ${r.status}`, detail: text.slice(0, 500) },
        { status: 502 }
      )
    }

    const data = await r.json()

    await db.activityLog
      .create({
        data: {
          userId: user.id,
          action: 'realtime.session.create',
          metaJson: JSON.stringify({
            model,
            sourceLang,
            targetLang,
            voice,
            sessionId: data.id,
          }),
          ipAddress: getClientIp(req),
          severity: 'info',
        },
      })
      .catch(() => {})

    return NextResponse.json({
      sessionId: data.id,
      token: data.client_secret?.value,
      expiresAt: data.client_secret?.expires_at,
      model,
      wsUrl: `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      sourceLang,
      targetLang,
      voice,
    })
  } catch (e: any) {
    console.error('Realtime session exception', e)
    return NextResponse.json(
      { error: 'Failed to create realtime session', detail: String(e?.message || e) },
      { status: 500 }
    )
  }
}

/** GET — admin can test whether the API key is configured. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 })
  }
  const apiKey = await getOpenAIRealtimeKey()
  const model = await getOpenAIRealtimeModel()
  return NextResponse.json({
    configured: !!apiKey,
    model,
    mode: apiKey ? 'live' : 'fallback',
  })
}
