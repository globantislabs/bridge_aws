import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'

/**
 * Whiteboard strokes persistence.
 *
 * GET  /api/meetings/[id]/whiteboard?since=ISO
 *      Returns strokes created after `since` (optional, for polling).
 *
 * POST /api/meetings/[id]/whiteboard
 *      Body: WhiteboardStroke JSON
 *      Persists a stroke. Stored in SystemSetting under key
 *      `whiteboard:{meetingId}` as a JSON array — no schema change needed.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const since = req.nextUrl.searchParams.get('since') || ''
  const key = `whiteboard:${id}`
  const setting = await db.systemSetting.findUnique({ where: { key } })
  if (!setting) {
    return NextResponse.json({ strokes: [] })
  }
  let allStrokes: any[] = []
  try {
    allStrokes = JSON.parse(setting.value)
  } catch {
    allStrokes = []
  }
  const strokes = since
    ? allStrokes.filter((s) => s.createdAt > since)
    : allStrokes
  return NextResponse.json({ strokes })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const stroke = {
    id: body.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tool: body.tool || 'pen',
    color: body.color || '#000',
    size: body.size || 4,
    points: Array.isArray(body.points) ? body.points : [],
    author: body.author || user.name,
    createdAt: body.createdAt || new Date().toISOString(),
  }
  const key = `whiteboard:${id}`
  const existing = await db.systemSetting.findUnique({ where: { key } })
  let strokes: any[] = []
  if (existing) {
    try {
      strokes = JSON.parse(existing.value)
    } catch {
      strokes = []
    }
  }
  strokes.push(stroke)
  // Cap at 1000 strokes to avoid unbounded growth
  if (strokes.length > 1000) strokes = strokes.slice(-1000)
  const value = JSON.stringify(strokes)
  if (existing) {
    await db.systemSetting.update({ where: { key }, data: { value } })
  } else {
    await db.systemSetting.create({ data: { key, value } })
  }
  return NextResponse.json({ ok: true, stroke })
}
