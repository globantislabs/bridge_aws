import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getOpenAITranslateKey, getOpenAITranslateModel } from '@/lib/system-settings'
import ZAI from 'z-ai-web-dev-sdk'

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', pl: 'Polish', tr: 'Turkish',
  ar: 'Arabic', hi: 'Hindi', bn: 'Bengali', zh: 'Chinese', ja: 'Japanese',
  ko: 'Korean', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian',
}

/** GET — recent chat messages */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const since = new URL(req.url).searchParams.get('since')
  const where: any = { meetingId: id }
  if (since) where.createdAt = { gt: new Date(since) }
  const chats = await db.meetingChat.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return NextResponse.json({ chats })
}

/** POST — send a chat message (auto-translated if targetLang provided) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const meeting = await db.meeting.findUnique({ where: { id } })
  if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!meeting.allowChat) {
    return NextResponse.json({ error: 'Chat disabled' }, { status: 403 })
  }
  const body = await req.json()
  const { message, targetLang, translate } = body as {
    message: string
    targetLang?: string
    translate?: boolean
  }
  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: 'message too long' }, { status: 413 })
  }

  let translated: string | null = null
  let tgt = targetLang ?? null
  if (translate && tgt && tgt !== meeting.transcriptLang) {
    const srcName = LANG_NAMES[meeting.transcriptLang] ?? meeting.transcriptLang
    const tgtName = LANG_NAMES[tgt] ?? tgt
    // Try admin-configured OpenAI key first, then fall back to ZAI SDK
    try {
      const openaiKey = await getOpenAITranslateKey()
      if (openaiKey) {
        const model = await getOpenAITranslateModel()
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 1000,
            messages: [
              {
                role: 'system',
                content: `You are a professional real-time meeting translator. Translate the user's text from ${srcName} to ${tgtName}. Output ONLY the translated text with no quotes or notes. Preserve proper nouns.`,
              },
              { role: 'user', content: message },
            ],
          }),
        })
        if (r.ok) {
          const data = await r.json()
          translated = (data?.choices?.[0]?.message?.content ?? '').trim()
        }
      }
    } catch {
      // OpenAI failed — fall through to ZAI
    }
    if (!translated) {
      try {
        const zai = await ZAI.create()
        const c = await zai.chat.completions.create({
          model: 'glm-4.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are a professional real-time meeting translator. Translate the user's text from ${srcName} to ${tgtName}. Output ONLY the translated text with no quotes or notes. Preserve proper nouns.`,
            },
            { role: 'user', content: message },
          ],
          temperature: 0.2,
          max_tokens: 1000,
        })
        translated = (c?.choices?.[0]?.message?.content ?? '').trim()
      } catch {
        translated = null
      }
    }
  }

  const chat = await db.meetingChat.create({
    data: {
      meetingId: id,
      userId: user.id,
      displayName: user.name,
      message: message.trim(),
      translated,
      targetLang: tgt,
    },
  })
  return NextResponse.json({ chat })
}
