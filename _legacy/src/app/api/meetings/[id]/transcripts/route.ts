import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/** GET — list transcripts (caption history) for a meeting */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const since = new URL(req.url).searchParams.get('since')
  const targetLang = new URL(req.url).searchParams.get('lang')
  const where: any = { meetingId: id }
  if (since) where.createdAt = { gt: new Date(since) }
  if (targetLang) where.targetLang = targetLang
  const transcripts = await db.transcriptMessage.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 500,
  })
  return NextResponse.json({ transcripts })
}

/** POST — store a transcript (caption) entry. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const {
    speakerName,
    sourceLang,
    sourceText,
    targetLang,
    targetText,
    confidence,
  } = body as {
    speakerName: string
    sourceLang: string
    sourceText: string
    targetLang: string
    targetText: string
    confidence?: number
  }
  if (!speakerName || !sourceText || !targetText) {
    return NextResponse.json(
      { error: 'speakerName, sourceText, targetText required' },
      { status: 400 }
    )
  }
  const t = await db.transcriptMessage.create({
    data: {
      meetingId: id,
      userId: user.id,
      speakerName,
      sourceLang,
      sourceText,
      targetLang,
      targetText,
      confidence: confidence ?? 0.95,
    },
  })
  return NextResponse.json({ transcript: t })
}
