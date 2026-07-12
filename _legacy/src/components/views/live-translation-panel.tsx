'use client'

import * as React from 'react'
import {
  Languages,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Trash2,
  AlertTriangle,
  Loader2,
  Radio,
  Wifi,
  WifiOff,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * LiveTranslationPanel — production real-time voice translation.
 *
 * Pipeline (low-latency):
 *   1. Mic → AudioWorklet (24kHz mono PCM16)
 *   2. PCM16 chunks → OpenAI Realtime WebSocket (input_audio_buffer.append)
 *   3. Server VAD detects end-of-utterance → fires input_audio_buffer.commit
 *   4. Realtime model produces translation in target language
 *   5. response.audio.delta → decoded back to PCM16 → played via <audio>
 *   6. conversation.item.input_audio_transcription.completed → source caption
 *   7. response.audio_transcript.delta → target caption (incremental)
 *
 * Falls back to Web Speech API if no OpenAI key is configured by the admin.
 */

const LANGUAGES = [
  ['en', 'English', 'en-US'],
  ['es', 'Spanish', 'es-ES'],
  ['fr', 'French', 'fr-FR'],
  ['de', 'German', 'de-DE'],
  ['it', 'Italian', 'it-IT'],
  ['pt', 'Portuguese', 'pt-PT'],
  ['nl', 'Dutch', 'nl-NL'],
  ['ru', 'Russian', 'ru-RU'],
  ['pl', 'Polish', 'pl-PL'],
  ['tr', 'Turkish', 'tr-TR'],
  ['ar', 'Arabic', 'ar-SA'],
  ['hi', 'Hindi', 'hi-IN'],
  ['bn', 'Bengali', 'bn-IN'],
  ['zh', 'Chinese', 'zh-CN'],
  ['ja', 'Japanese', 'ja-JP'],
  ['ko', 'Korean', 'ko-KR'],
  ['vi', 'Vietnamese', 'vi-VN'],
  ['th', 'Thai', 'th-TH'],
  ['id', 'Indonesian', 'id-ID'],
  ['sv', 'Swedish', 'sv-SE'],
] as const

const VOICES = [
  ['alloy', 'Alloy'],
  ['ash', 'Ash'],
  ['ballad', 'Ballad'],
  ['coral', 'Coral'],
  ['echo', 'Echo'],
  ['sage', 'Sage'],
  ['shimmer', 'Shimmer'],
  ['verse', 'Verse'],
] as const

export interface TranslationEntry {
  id: string
  speakerName: string
  sourceLang: string
  sourceText: string
  targetLang: string
  targetText: string
  confidence: number
  createdAt: number
}

interface Props {
  meetingId: string
  transcriptLang: string
  userName: string
  onPersist?: (entry: TranslationEntry) => void
  /**
   * Called when the speaker enables "Broadcast translation".
   *
   * When called with a non-null MediaStreamTrack, the parent should call
   * `sender.replaceTrack(track)` on every peer connection's audio sender
   * so listeners hear the translated voice instead of the speaker's
   * original mic audio. When called with null, the parent should restore
   * the original mic track on every audio sender.
   *
   * The track comes from a `MediaStreamAudioDestinationNode` whose stream
   * is fed by the OpenAI Realtime `response.audio.delta` PCM16 chunks —
   * i.e. the same audio that plays locally via ctx.destination.
   */
  onBroadcastTrack?: (track: MediaStreamTrack | null) => void
}

type Engine = 'realtime' | 'fallback' | 'loading' | 'error'

export function LiveTranslationPanel({
  meetingId,
  transcriptLang,
  userName,
  onPersist,
  onBroadcastTrack,
}: Props) {
  const [targetLang, setTargetLang] = React.useState<string>('es')
  const [voice, setVoice] = React.useState<string>('alloy')
  const [listening, setListening] = React.useState(false)
  const [interimSource, setInterimSource] = React.useState('')
  const [interimTarget, setInterimTarget] = React.useState('')
  const [entries, setEntries] = React.useState<TranslationEntry[]>([])
  const [speakIt, setSpeakIt] = React.useState(true)
  const [engine, setEngine] = React.useState<Engine>('loading')
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null)
  const [connected, setConnected] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{
    state: 'idle' | 'testing' | 'ok' | 'fail'
    detail?: string
    engine?: string
  }>({ state: 'idle' })
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  // Broadcast mode: when true, the translated audio track is sent to all
  // listeners via onBroadcastTrack, replacing the speaker's mic track on
  // every peer connection's audio sender. The speaker still hears the
  // translation locally (via ctx.destination).
  const [broadcastMode, setBroadcastMode] = React.useState(false)

  const wsRef = React.useRef<WebSocket | null>(null)
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  // MediaStreamAudioDestinationNode — when broadcastMode is on, every
  // AudioBufferSource is connected to this node IN ADDITION to ctx.destination.
  // Its stream's audio track becomes the outgoing WebRTC audio track.
  const destRef = React.useRef<MediaStreamAudioDestinationNode | null>(null)
  const workletNodeRef = React.useRef<AudioWorkletNode | null>(null)
  const micStreamRef = React.useRef<MediaStream | null>(null)
  const audioQueueRef = React.useRef<ArrayBuffer[]>([])
  const pendingSourceRef = React.useRef('')
  const pendingTargetRef = React.useRef('')
  const utterStartRef = React.useRef<number>(0)
  const listeningRef = React.useRef(false)
  const retryCountRef = React.useRef<number>(0)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  // Keep broadcastMode in a ref so drainQueue (which is a useCallback) always
  // sees the latest value without needing to be re-created.
  const broadcastModeRef = React.useRef(false)

  // Native fallback refs (Web Speech API)
  const recognitionRef = React.useRef<any>(null)

  React.useEffect(() => {
    listeningRef.current = listening
  }, [listening])

  // Keep broadcastModeRef in sync, AND notify the parent when broadcast mode
  // or the available dest track changes. When broadcastMode is ON and we have
  // a dest node, hand the track to the parent. When broadcastMode is OFF (or
  // we lose the dest), hand back null so the parent restores the mic track.
  React.useEffect(() => {
    broadcastModeRef.current = broadcastMode
    if (!onBroadcastTrack) return
    if (broadcastMode) {
      const track = destRef.current?.stream.getAudioTracks()[0] ?? null
      onBroadcastTrack(track)
    } else {
      onBroadcastTrack(null)
    }
  }, [broadcastMode, onBroadcastTrack])

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, interimSource, interimTarget])

  // Determine engine on mount
  React.useEffect(() => {
    let cancelled = false
    fetch('/api/realtime/session', { method: 'GET' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d.configured) setEngine('realtime')
        else setEngine('fallback')
      })
      .catch(() => !cancelled && setEngine('fallback'))
    return () => {
      cancelled = true
    }
  }, [])

  /* ============ AUDIO OUTPUT QUEUE (PCM16 24kHz → AudioBufferSource) ============ */
  // We schedule each chunk back-to-back using ctx.currentTime + the chunk's
  // duration. This produces gapless playback even if the WS messages arrive
  // with small jitter — no audible "click" between chunks.
  const nextPlayTimeRef = React.useRef<number>(0)

  const playPcm16 = React.useCallback((pcm16: ArrayBuffer) => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const view = new Int16Array(pcm16)
    const float = new Float32Array(view.length)
    for (let i = 0; i < view.length; i++) float[i] = view[i] / 32768
    const buf = ctx.createBuffer(1, float.length, 24000)
    buf.copyToChannel(float, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    // When broadcast is ON, also route to the MediaStreamDestination so the
    // translated audio is sent to listeners via the WebRTC audio sender.
    const dest = destRef.current
    if (broadcastModeRef.current && dest) {
      try { src.connect(dest) } catch {}
    }
    src.start()
  }, [])

  const drainQueue = React.useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx) {
      audioQueueRef.current = []
      return
    }
    const dest = destRef.current
    while (audioQueueRef.current.length > 0) {
      const next = audioQueueRef.current.shift()!
      const view = new Int16Array(next)
      const float = new Float32Array(view.length)
      for (let i = 0; i < view.length; i++) float[i] = view[i] / 32768
      const buf = ctx.createBuffer(1, float.length, 24000)
      buf.copyToChannel(float, 0)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      // When broadcast is ON, also route to the MediaStreamDestination so the
      // translated audio is sent to listeners via the WebRTC audio sender.
      if (broadcastModeRef.current && dest) {
        try { src.connect(dest) } catch {}
      }
      // Schedule back-to-back: if ctx.currentTime has lapped nextPlayTime,
      // start immediately; otherwise chain after the previous chunk.
      const startAt = Math.max(ctx.currentTime + 0.005, nextPlayTimeRef.current)
      src.start(startAt)
      nextPlayTimeRef.current = startAt + buf.duration
      // If the queue falls behind by > 2s, drop stale chunks to keep latency low.
      if (nextPlayTimeRef.current - ctx.currentTime > 2.0) {
        nextPlayTimeRef.current = ctx.currentTime + 0.005
      }
    }
  }, [])

  /* ============ REALTIME START (OpenAI) ============ */
  const startRealtime = React.useCallback(async () => {
    setErrorMsg(null)
    setConnected(false)

    // 1. Get ephemeral session token from our server
    const sessRes = await fetch('/api/realtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceLang: transcriptLang,
        targetLang,
        voice,
      }),
    })
    if (!sessRes.ok) {
      const d = await sessRes.json().catch(() => ({}))
      setErrorMsg(d.error || d.detail || `Session error (${sessRes.status})`)
      setEngine('error')
      return
    }
    const sess = await sessRes.json()

    // 2. Open WebSocket to OpenAI Realtime.
    //    OpenAI requires exactly two subprotocols:
    //      - openai-insecure-api-key.<ephemeral-token>
    //      - openai-beta.realtime-v1
    //    Adding any extra subprotocol (e.g. 'realtime') makes the server reject
    //    the handshake with HTTP 400. The model name MUST be in the query string.
    const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(sess.model)}`
    const ws = new WebSocket(wsUrl, [
      'openai-insecure-api-key.' + sess.token,
      'openai-beta.realtime-v1',
    ])
    wsRef.current = ws

    ws.onopen = async () => {
      setConnected(true)
      retryCountRef.current = 0

      // Configure turn detection for lowest-latency interpretation.
      // We also explicitly disable server VAD's "create_response_on" so the
      // model responds the instant it detects end-of-utterance.
      try {
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 200,
              silence_duration_ms: 350,
              create_response: true,
            },
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
          },
        }))
      } catch {}

      // 3. Capture mic + set up AudioWorklet
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 24000,
          },
        })
        micStreamRef.current = stream

        const ctx = new AudioContext({ sampleRate: 24000 })
        audioCtxRef.current = ctx
        // Create a MediaStreamDestination node — when broadcastMode is ON,
        // every AudioBufferSource is connected here IN ADDITION to
        // ctx.destination. Its stream's audio track becomes the outgoing
        // WebRTC audio track (via onBroadcastTrack).
        const dest = ctx.createMediaStreamDestination()
        destRef.current = dest
        // If broadcastMode is already on (e.g. user toggled it during a
        // previous session that crashed and reconnected), notify the parent
        // immediately that a fresh track is available.
        if (broadcastModeRef.current && onBroadcastTrack) {
          const track = dest.stream.getAudioTracks()[0] ?? null
          onBroadcastTrack(track)
        }
        await ctx.audioWorklet.addModule(workletURL)
        const src = ctx.createMediaStreamSource(stream)
        const node = new AudioWorkletNode(ctx, 'pcm-16-worklet')
        node.port.onmessage = (e) => {
          if (e.data?.type === 'pcm16' && ws.readyState === WebSocket.OPEN) {
            // Base64-encode the PCM16 chunk and send
            const chunk: ArrayBuffer = e.data.buffer
            const b64 = arrayBufferToBase64(chunk)
            ws.send(
              JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: b64,
              })
            )
          }
        }
        src.connect(node)
        // Do NOT connect node to destination — we don't want to hear ourselves
        workletNodeRef.current = node
        setListening(true)
      } catch (e: any) {
        setErrorMsg(
          'Microphone access failed: ' + (e?.message || e) + '. Please allow mic permission.'
        )
        ws.close()
      }
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        switch (msg.type) {
          case 'error':
            setErrorMsg(msg.error?.message || 'Realtime error')
            break
          case 'input_audio_buffer.speech_started':
            utterStartRef.current = Date.now()
            pendingSourceRef.current = ''
            pendingTargetRef.current = ''
            setInterimSource('')
            setInterimTarget('')
            break
          case 'input_audio_buffer.speech_stopped':
            // Server VAD will commit automatically; nothing to do.
            break
          case 'conversation.item.input_audio_transcription.completed':
            pendingSourceRef.current = msg.transcript || ''
            setInterimSource(pendingSourceRef.current)
            break
          case 'response.audio_transcript.delta':
            pendingTargetRef.current += msg.delta || ''
            setInterimTarget(pendingTargetRef.current)
            break
          case 'response.audio.delta':
            if (speakItRef.current) {
              const bin = base64ToArrayBuffer(msg.delta)
              audioQueueRef.current.push(bin)
              drainQueue()
            }
            break
          case 'response.audio_transcript.done':
            // Finalize entry
            if (pendingSourceRef.current || pendingTargetRef.current) {
              const lat = Date.now() - utterStartRef.current
              setLatencyMs(lat)
              const entry: TranslationEntry = {
                id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                speakerName: userName,
                sourceLang: transcriptLang,
                sourceText: pendingSourceRef.current || '(no transcript)',
                targetLang,
                targetText: pendingTargetRef.current || '(no translation)',
                confidence: 0.95,
                createdAt: Date.now(),
              }
              setEntries((prev) => [...prev.slice(-49), entry])
              if (onPersist) onPersist(entry)
              pendingSourceRef.current = ''
              pendingTargetRef.current = ''
              setInterimSource('')
              setInterimTarget('')
            }
            break
          case 'response.done':
            // No-op; entry is finalized on transcript.done
            break
        }
      } catch {}
    }

    ws.onerror = (e) => {
      setErrorMsg('WebSocket error — check network and try again.')
      setConnected(false)
    }
    ws.onclose = (ev) => {
      setConnected(false)
      // 4401 / 4403 = auth failure — do NOT retry, surface the error.
      // 1011 = server error — retry with backoff, capped at 3 attempts.
      if (ev.code === 4401 || ev.code === 4403) {
        setErrorMsg(
          'OpenAI Realtime authentication failed. Ask your admin to verify the API key in Admin Panel → System settings.'
        )
        setEngine('error')
        setListening(false)
        // Realtime is gone — turn off broadcast so listeners hear the
        // speaker's mic again instead of silence.
        if (broadcastModeRef.current) setBroadcastMode(false)
        return
      }
      if (listeningRef.current) {
        retryCountRef.current += 1
        if (retryCountRef.current > 3) {
          setErrorMsg('Connection lost. Click Start to retry.')
          setEngine('error')
          setListening(false)
          // Same — give up broadcasting until the user reconnects.
          if (broadcastModeRef.current) setBroadcastMode(false)
          return
        }
        setTimeout(() => {
          if (listeningRef.current) startRealtime().catch(() => {})
        }, 1500 * retryCountRef.current)
      }
    }
  }, [transcriptLang, targetLang, voice, userName, onPersist, drainQueue])

  // Keep speakIt in a ref so the WS handler always sees the latest value
  const speakItRef = React.useRef(speakIt)
  React.useEffect(() => {
    speakItRef.current = speakIt
  }, [speakIt])

  /* ============ REALTIME STOP ============ */
  const stopRealtime = React.useCallback(() => {
    setListening(false)
    // Turning off broadcast restores listeners to the original mic track.
    // Do this BEFORE tearing down the audio context so the parent's
    // replaceTrack call lands while the dest track is still alive (it
    // doesn't strictly need to be alive — replaceTrack with a stopped
    // track is allowed — but this is cleaner).
    if (broadcastModeRef.current && onBroadcastTrack) {
      onBroadcastTrack(null)
    }
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {}
      wsRef.current = null
    }
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect()
      } catch {}
      workletNodeRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    if (destRef.current) {
      // Stop the dest's audio tracks (otherwise the broadcast stream stays
      // alive even after the audio context is closed).
      try {
        destRef.current.stream.getTracks().forEach((t) => t.stop())
      } catch {}
      destRef.current = null
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close()
      } catch {}
      audioCtxRef.current = null
    }
    audioQueueRef.current = []
    nextPlayTimeRef.current = 0
  }, [onBroadcastTrack])

  /* ============ FALLBACK START (Web Speech API) ============ */
  const startFallback = React.useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    if (!SR) {
      setErrorMsg(
        'Browser does not support speech recognition. Use Chrome, Edge, or Safari.'
      )
      setEngine('error')
      return
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
    }
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang =
      LANGUAGES.find((l) => l[0] === transcriptLang)?.[2] || 'en-US'

    recognition.onresult = async (event: any) => {
      let interimText = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interimText += transcript
      }
      setInterimSource(interimText)
      if (finalText.trim().length > 0) {
        const sourceText = finalText.trim()
        let targetText = sourceText
        if (targetLang !== transcriptLang) {
          try {
            const r = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: sourceText,
                sourceLang: transcriptLang,
                targetLang,
              }),
            })
            const data = await r.json()
            if (r.ok && data.translated) targetText = data.translated
          } catch {}
        }
        const entry: TranslationEntry = {
          id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          speakerName: userName,
          sourceLang: transcriptLang,
          sourceText,
          targetLang,
          targetText,
          confidence: 0.9,
          createdAt: Date.now(),
        }
        setEntries((prev) => [...prev.slice(-49), entry])
        setInterimSource('')
        if (onPersist) onPersist(entry)
        if (speakIt && 'speechSynthesis' in window) {
          const utter = new SpeechSynthesisUtterance(targetText)
          utter.lang =
            LANGUAGES.find((l) => l[0] === targetLang)?.[2] || targetLang
          utter.rate = 1
          window.speechSynthesis.speak(utter)
        }
      }
    }
    recognition.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        setErrorMsg('Microphone access denied. Please allow mic access.')
        setListening(false)
      }
    }
    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start()
        } catch {}
      }
    }
    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {}
  }, [transcriptLang, targetLang, userName, speakIt, onPersist])

  const stopFallback = React.useCallback(() => {
    setListening(false)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  /* ============ UNIFIED START/STOP ============ */
  const handleStart = React.useCallback(() => {
    if (engine === 'realtime') startRealtime()
    else if (engine === 'fallback') startFallback()
  }, [engine, startRealtime, startFallback])
  const handleStop = React.useCallback(() => {
    stopRealtime()
    stopFallback()
  }, [stopRealtime, stopFallback])

  // Restart on lang/voice change while listening
  React.useEffect(() => {
    if (listening) {
      handleStop()
      const t = setTimeout(() => handleStart(), 300)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLang, voice])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stopRealtime()
      stopFallback()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearHistory() {
    setEntries([])
    setInterimSource('')
    setInterimTarget('')
  }

  async function testTranslation() {
    setTestResult({ state: 'testing' })
    try {
      // POST actually creates a throwaway Realtime session with the
      // configured key + model — proves end-to-end that OpenAI will accept
      // the key, the model is available, and we can mint ephemeral tokens.
      const r = await fetch('/api/translate/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceLang: transcriptLang, targetLang }),
      })
      const d = await r.json()
      if (d.ok) {
        setTestResult({
          state: 'ok',
          engine: 'realtime',
          detail: `${d.detail} (model: ${d.model}, ${d.latencyMs}ms)`,
        })
      } else {
        setTestResult({ state: 'fail', detail: d.detail || d.error || 'Test failed' })
      }
    } catch (e: any) {
      setTestResult({ state: 'fail', detail: e.message })
    }
  }

  async function copyEntry(e: TranslationEntry) {
    try {
      const text = e.targetLang !== e.sourceLang
        ? `${e.sourceText}\n→ ${e.targetText}`
        : e.sourceText
      await navigator.clipboard.writeText(text)
      setCopiedId(e.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  const targetLangInfo = LANGUAGES.find((l) => l[0] === targetLang)
  const sourceLangInfo = LANGUAGES.find((l) => l[0] === transcriptLang)

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`size-7 rounded-lg grid place-items-center ${
                listening
                  ? 'bg-primary/15 text-primary live-pulse'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Languages className="size-4" />
            </div>
            <div>
              <div className="text-[13px] font-semibold leading-none flex items-center gap-1.5">
                Live translation
                {engine === 'realtime' && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-3.5 px-1 font-semibold text-primary border-primary/30"
                  >
                    REALTIME
                  </Badge>
                )}
                {engine === 'fallback' && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-3.5 px-1 font-semibold text-amber-600 border-amber-500/30"
                  >
                    BASIC
                  </Badge>
                )}
                {engine === 'loading' && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                {engine === 'realtime' && (
                  <>
                    {connected ? (
                      <>
                        <Wifi className="size-2.5 text-emerald-500" />
                        Connected
                        {latencyMs !== null && (
                          <span className="nums">
                            · {latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <Loader2 className="size-2.5 animate-spin" />
                        Connecting…
                      </>
                    )}
                  </>
                )}
                {engine === 'fallback' && (
                  <>{listening ? 'Listening…' : 'Paused'}</>
                )}
                {engine === 'error' && (
                  <span className="text-rose-500">Error</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={testTranslation}
              disabled={testResult.state === 'testing'}
              title="Test if translation backend is working"
            >
              {testResult.state === 'testing' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : testResult.state === 'ok' ? (
                <CheckCircle2 className="size-3.5 text-emerald-500" />
              ) : testResult.state === 'fail' ? (
                <XCircle className="size-3.5 text-rose-500" />
              ) : (
                <FlaskConical className="size-3.5" />
              )}
              <span className="hidden sm:inline">Test</span>
            </Button>
            <Button
              size="sm"
              variant={listening ? 'destructive' : 'default'}
              className="h-8 gap-1.5"
              onClick={() => (listening ? handleStop() : handleStart())}
              disabled={engine === 'loading' || engine === 'error'}
            >
              {listening ? (
                <>
                  <Pause className="size-3.5" /> Stop
                </>
              ) : (
                <>
                  <Play className="size-3.5" /> Start
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Test result banner */}
        {testResult.state !== 'idle' && (
          <div
            className={`flex items-start gap-2 px-2.5 py-2 rounded-md text-[11px] border ${
              testResult.state === 'testing'
                ? 'bg-muted/50 border-border text-muted-foreground'
                : testResult.state === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-600'
            }`}
          >
            {testResult.state === 'testing' ? (
              <Loader2 className="size-3.5 shrink-0 mt-0.5 animate-spin" />
            ) : testResult.state === 'ok' ? (
              <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-3.5 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 leading-relaxed">
              {testResult.state === 'testing'
                ? 'Testing translation backend…'
                : testResult.detail}
            </div>
            <button
              onClick={() => setTestResult({ state: 'idle' })}
              className="text-xs opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Language pickers */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Speaker
            </div>
            <Select value={transcriptLang} disabled>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Translate to
            </div>
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Voice picker (realtime only) */}
        {engine === 'realtime' && (
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Interpreter voice
            </div>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICES.map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* TTS toggle (realtime = speak the translated audio stream, fallback = browser TTS) */}
        <button
          onClick={() => setSpeakIt((v) => !v)}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
            speakIt
              ? 'bg-primary/10 text-primary'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {speakIt ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            Speak translations aloud
          </span>
          <span
            className={`size-7 rounded-full grid place-items-center text-[10px] font-semibold ${
              speakIt ? 'bg-primary text-primary-foreground' : 'bg-background'
            }`}
          >
            {speakIt ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Broadcast translated voice to listeners — only meaningful in
            realtime mode (the fallback Web Speech API can't produce a clean
            audio track we can route to WebRTC). Disabled until the realtime
            WS is connected so users get a clear "you need to start first"
            signal. When ON, shows a red "LIVE • translated" pill. */}
        <button
          onClick={() => setBroadcastMode((v) => !v)}
          disabled={engine !== 'realtime' || !listening}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
            broadcastMode
              ? 'bg-rose-500/15 text-rose-700 border border-rose-500/30'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'
          } ${engine !== 'realtime' || !listening ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={
            engine !== 'realtime' || !listening
              ? 'Start realtime translation first, then enable broadcast'
              : 'When ON, listeners hear the translated voice instead of your original mic audio'
          }
        >
          <span className="flex items-center gap-1.5">
            <Radio className={`size-3.5 ${broadcastMode ? 'live-pulse text-rose-600' : ''}`} />
            Broadcast translated voice to listeners
          </span>
          {broadcastMode ? (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center gap-1 uppercase tracking-wide">
              <span className="size-1.5 rounded-full bg-white live-pulse" />
              LIVE · translated
            </span>
          ) : (
            <span
              className={`size-7 rounded-full grid place-items-center text-[10px] font-semibold ${
                broadcastMode ? 'bg-rose-600 text-white' : 'bg-background'
              }`}
            >
              OFF
            </span>
          )}
        </button>

        {/* Broadcast warning — clear UX that the speaker's original voice is
            NOT sent to listeners while broadcasting. */}
        {broadcastMode && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-700 text-[11px]">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <strong>Listeners will hear translated audio instead of your voice.</strong>{' '}
              Your original voice is muted for them. They will hear the
              interpreter's voice in {targetLangInfo?.[1] ?? targetLang}. Turn
              this off to restore your original mic audio.
            </div>
          </div>
        )}

        {/* Error banner */}
        {errorMsg && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-600 text-[11px]">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* Engine hint when no key configured */}
        {engine === 'fallback' && !errorMsg && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[11px]">
            <Radio className="size-3.5 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              Using basic browser STT. Ask your admin to add an OpenAI Realtime
              API key in <strong>Admin Panel → System settings</strong> to
              enable low-latency voice interpretation.
            </div>
          </div>
        )}
      </div>

      {/* Live caption stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3"
      >
        {entries.length === 0 && !interimSource && !interimTarget && (
          <div className="text-center py-10 px-4">
            <div className="size-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto mb-3">
              <Mic className="size-5" />
            </div>
            <div className="text-sm font-medium mb-1">
              {engine === 'realtime'
                ? 'Click Start to begin live interpretation'
                : 'Listening will start when you press Start'}
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Speak naturally. Your speech will be{' '}
              {engine === 'realtime' ? 'interpreted in real time' : 'transcribed'}{' '}
              to{' '}
              <span className="font-medium text-foreground">
                {targetLangInfo?.[1] ?? targetLang}
              </span>{' '}
              and shown to everyone in the meeting.
            </div>
          </div>
        )}

        {entries.map((e) => (
          <div key={e.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {e.speakerName}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => copyEntry(e)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                  title="Copy translation"
                >
                  {copiedId === e.id ? (
                    <><CheckCircle2 className="size-3 text-emerald-500" /> Copied</>
                  ) : (
                    <><Copy className="size-3" /> Copy</>
                  )}
                </button>
                <span className="text-[10px] text-muted-foreground nums">
                  {new Date(e.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2 space-y-1.5">
              <div className="text-[13px] text-foreground/80 leading-relaxed">
                {e.sourceText}
              </div>
              {e.targetLang !== e.sourceLang && (
                <div className="text-[13px] font-medium text-foreground leading-relaxed border-t border-border/60 pt-1.5 mt-1.5">
                  <Badge
                    variant="outline"
                    className="mr-1.5 text-[9px] h-4 px-1 font-semibold"
                  >
                    {e.targetLang.toUpperCase()}
                  </Badge>
                  {e.targetText}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Live interim captions */}
        {(interimSource || interimTarget) && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary live-pulse" />
              {userName} · speaking now
            </span>
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 space-y-1.5">
              {interimSource && (
                <div className="text-[13px] text-foreground/60 italic">
                  {interimSource}
                </div>
              )}
              {interimTarget && (
                <div className="text-[13px] font-medium text-foreground border-t border-primary/20 pt-1.5 mt-1.5 flex items-start gap-1.5">
                  <Languages className="size-3 mt-0.5 text-primary" />
                  {interimTarget}
                  <span className="inline-block w-1 h-3 bg-primary ml-0.5 animate-pulse" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2.5 border-t border-border flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground nums">
          {entries.length} {entries.length === 1 ? 'caption' : 'captions'}
          {latencyMs !== null && engine === 'realtime' && (
            <span className="ml-2">
              · last: {latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={clearHistory}
        >
          <Trash2 className="size-3 mr-1" /> Clear
        </Button>
      </div>
    </div>
  )
}

/* ============ AudioWorklet — capture mic as 24kHz mono PCM16 ============ */
const workletURL = URL.createObjectURL(
  new Blob(
    [
      `
class PCM16Worklet extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = []
    this._chunksPerMessage = 2 // ~85ms at 24kHz / 128-sample blocks — low latency
    this._count = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const ch0 = input[0]
    // Convert float32 [-1,1] to int16
    const pcm = new Int16Array(ch0.length)
    for (let i = 0; i < ch0.length; i++) {
      let s = Math.max(-1, Math.min(1, ch0[i]))
      s = s < 0 ? s * 0x8000 : s * 0x7fff
      pcm[i] = s
    }
    this._buf.push(pcm)
    this._count++
    if (this._count >= this._chunksPerMessage) {
      const total = this._buf.reduce((a, b) => a + b.length, 0)
      const out = new Int16Array(total)
      let off = 0
      for (const c of this._buf) { out.set(c, off); off += c.length }
      this._buf = []
      this._count = 0
      this.port.postMessage({ type: 'pcm16', buffer: out.buffer }, [out.buffer])
    }
    return true
  }
}
registerProcessor('pcm-16-worklet', PCM16Worklet)
`,
    ],
    { type: 'application/javascript' }
  )
)

/* ============ Helpers ============ */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[]
    )
  }
  return btoa(binary)
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
