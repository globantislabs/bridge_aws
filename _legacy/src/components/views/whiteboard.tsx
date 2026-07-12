'use client'

import * as React from 'react'
import { Pen, Eraser, Trash2, Undo2, Download, Square, Circle, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Collaborative whiteboard for meetings.
 *
 * Uses HTML5 Canvas for drawing. Persistes strokes to a backing API
 * so participants can see each other's drawings in real time (polled).
 *
 * Tools: pen, eraser, line, rectangle, circle.
 * Colors: 8 preset swatches.
 */

export interface WhiteboardStroke {
  id: string
  tool: 'pen' | 'eraser' | 'line' | 'rect' | 'circle'
  color: string
  size: number
  points: number[] // flat [x1,y1,x2,y2,...]
  author: string
  createdAt: string
}

interface Props {
  meetingId: string
  userName: string
}

const COLORS = ['#0f172a', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
const SIZES = [2, 4, 6, 10]

export function Whiteboard({ meetingId, userName }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [tool, setTool] = React.useState<'pen' | 'eraser' | 'line' | 'rect' | 'circle'>('pen')
  const [color, setColor] = React.useState(COLORS[0])
  const [size, setSize] = React.useState(4)
  const [strokes, setStrokes] = React.useState<WhiteboardStroke[]>([])
  const [drawing, setDrawing] = React.useState(false)
  const [currentPoints, setCurrentPoints] = React.useState<number[]>([])
  const [startPoint, setStartPoint] = React.useState<{ x: number; y: number } | null>(null)
  const lastPollRef = React.useRef<string | null>(null)

  // Resize canvas to container
  React.useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
      redraw()
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, currentPoints, tool, color, size])

  // Fetch strokes from server
  const fetchStrokes = React.useCallback(async () => {
    try {
      const since = lastPollRef.current ?? ''
      const r = await fetch(
        `/api/meetings/${meetingId}/whiteboard?since=${encodeURIComponent(since)}`
      )
      if (!r.ok) return
      const data = await r.json()
      if (data.strokes?.length) {
        setStrokes((prev) => {
          const existingIds = new Set(prev.map((s) => s.id))
          const fresh = data.strokes.filter((s: WhiteboardStroke) => !existingIds.has(s.id))
          if (fresh.length === 0) return prev
          if (data.strokes[data.strokes.length - 1]?.createdAt) {
            lastPollRef.current = data.strokes[data.strokes.length - 1].createdAt
          }
          return [...prev, ...fresh]
        })
      }
    } catch {}
  }, [meetingId])

  React.useEffect(() => {
    fetchStrokes()
    const p = setInterval(fetchStrokes, 1500)
    return () => clearInterval(p)
  }, [fetchStrokes])

  // Redraw everything
  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    // Draw all committed strokes
    for (const s of strokes) drawStroke(ctx, s)
    // Draw current stroke in progress
    if (currentPoints.length >= 2 && tool === 'pen') {
      drawStroke(ctx, {
        id: 'current',
        tool: 'pen',
        color,
        size,
        points: currentPoints,
        author: userName,
        createdAt: new Date().toISOString(),
      })
    }
    if (startPoint && currentPoints.length >= 2) {
      const sx = startPoint.x
      const sy = startPoint.y
      const ex = currentPoints[currentPoints.length - 2]
      const ey = currentPoints[currentPoints.length - 1]
      ctx.strokeStyle = color
      ctx.lineWidth = size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      if (tool === 'line') {
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
      } else if (tool === 'rect') {
        ctx.rect(sx, sy, ex - sx, ey - sy)
      } else if (tool === 'circle') {
        const r = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
      }
      ctx.stroke()
    }
  }, [strokes, currentPoints, startPoint, tool, color, size, userName])

  // Mouse / touch handlers
  function getPos(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startDraw(e: React.PointerEvent) {
    e.preventDefault()
    const { x, y } = getPos(e)
    setDrawing(true)
    setStartPoint({ x, y })
    setCurrentPoints([x, y])
  }

  function moveDraw(e: React.PointerEvent) {
    if (!drawing) return
    e.preventDefault()
    const { x, y } = getPos(e)
    setCurrentPoints((prev) => [...prev, x, y])
  }

  async function endDraw() {
    if (!drawing) return
    setDrawing(false)
    if (currentPoints.length < 2) {
      setCurrentPoints([])
      setStartPoint(null)
      return
    }
    let finalPoints = currentPoints
    if (tool !== 'pen' && startPoint) {
      // For shapes, store start + end
      const sx = startPoint.x
      const sy = startPoint.y
      const ex = currentPoints[currentPoints.length - 2]
      const ey = currentPoints[currentPoints.length - 1]
      finalPoints = [sx, sy, ex, ey]
    }
    const stroke: WhiteboardStroke = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tool,
      color,
      size,
      points: finalPoints,
      author: userName,
      createdAt: new Date().toISOString(),
    }
    setStrokes((prev) => [...prev, stroke])
    setCurrentPoints([])
    setStartPoint(null)
    // Persist to server
    try {
      await fetch(`/api/meetings/${meetingId}/whiteboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stroke),
      })
    } catch {}
  }

  function undo() {
    setStrokes((prev) => prev.slice(0, -1))
  }

  function clearAll() {
    setStrokes([])
  }

  function downloadPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `whiteboard-${meetingId}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/30 flex-wrap">
        <div className="flex items-center gap-0.5 mr-2">
          {([
            ['pen', Pen],
            ['eraser', Eraser],
            ['line', Minus],
            ['rect', Square],
            ['circle', Circle],
          ] as const).map(([t, Icon]) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`size-8 rounded-md grid place-items-center transition-colors ${
                tool === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
              title={t}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 mr-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`size-5 rounded-full border-2 transition-transform ${
                color === c ? 'scale-110 border-foreground' : 'border-transparent'
              }`}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
        <div className="flex items-center gap-1 mr-2">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`size-8 rounded-md grid place-items-center transition-colors ${
                size === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
              title={`${s}px`}
            >
              <div className="rounded-full bg-current" style={{ width: s + 1, height: s + 1 }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" className="size-8" onClick={undo} title="Undo">
            <Undo2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={downloadPng} title="Download PNG">
            <Download className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-red-600" onClick={clearAll} title="Clear all">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 relative bg-white">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair touch-none"
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
      </div>
    </div>
  )
}

function drawStroke(ctx: CanvasRenderingContext2D, s: WhiteboardStroke) {
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = s.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.tool === 'eraser') {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = s.size * 4
  }
  ctx.beginPath()
  if (s.tool === 'pen' || s.tool === 'eraser') {
    if (s.points.length < 2) return
    ctx.moveTo(s.points[0], s.points[1])
    for (let i = 2; i < s.points.length; i += 2) {
      ctx.lineTo(s.points[i], s.points[i + 1])
    }
    ctx.stroke()
  } else if (s.tool === 'line') {
    if (s.points.length < 4) return
    ctx.moveTo(s.points[0], s.points[1])
    ctx.lineTo(s.points[2], s.points[3])
    ctx.stroke()
  } else if (s.tool === 'rect') {
    if (s.points.length < 4) return
    ctx.rect(s.points[0], s.points[1], s.points[2] - s.points[0], s.points[3] - s.points[1])
    ctx.stroke()
  } else if (s.tool === 'circle') {
    if (s.points.length < 4) return
    const r = Math.sqrt(
      (s.points[2] - s.points[0]) ** 2 + (s.points[3] - s.points[1]) ** 2
    )
    ctx.arc(s.points[0], s.points[1], r, 0, Math.PI * 2)
    ctx.stroke()
  }
}
