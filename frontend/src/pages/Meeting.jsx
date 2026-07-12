import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  LiveKitRoom, useTracks, useLocalParticipant, useParticipants,
  useRoomContext, ParticipantTile, RoomAudioRenderer, useDataChannel,
  ConnectionStateToast,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff,
  MessageSquare, Users, Hand, Languages, PhoneOff, Send, X, Copy,
  Circle, ChevronDown, FileText, Download,
} from "lucide-react";
import { api, API, LANGUAGES, languageName } from "../lib/api";
import useTranslator from "../hooks/useTranslator";

export default function Meeting() {
  const { code } = useParams();
  const nav = useNavigate();
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [identity] = useState(
    () => `${localStorage.getItem("bridge:name") || "guest"}-${Math.random().toString(36).slice(2, 7)}`
  );
  const [name] = useState(localStorage.getItem("bridge:name") || "Guest");
  const [lang] = useState(localStorage.getItem("bridge:lang") || "en");
  const [isHost] = useState(localStorage.getItem(`bridge:host:${code}`) === "1");
  const audioOn = localStorage.getItem("bridge:audioOn") !== "0";
  const videoOn = localStorage.getItem("bridge:videoOn") !== "0";

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.post("/livekit/token", {
          room_code: code, identity, name, is_host: isHost,
        });
        setToken(data.token);
        setServerUrl(data.livekit_url);
      } catch { toast.error("Failed to join room"); nav("/"); }
    })();
  }, [code, identity, name, isHost, nav]);

  if (!token || !serverUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/60">
        <div className="text-center">
          <div className="w-3 h-3 rounded-full bg-active mx-auto animate-pulse mb-4" />
          Connecting…
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={videoOn} audio={audioOn} token={token} serverUrl={serverUrl}
      data-lk-theme="default" onDisconnected={() => nav("/")}
      style={{ height: "100dvh" }}
    >
      <RoomShell code={code} myLang={lang} myName={name} isHost={isHost} />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LiveKitRoom>
  );
}

/* ---------------- Room Shell ---------------- */

function RoomShell({ code, myLang, myName, isHost }) {
  const room = useRoomContext();
  const nav = useNavigate();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();

  const [panel, setPanel] = useState(null); // null | 'chat' | 'people' | 'transcript'
  const [handsUp, setHandsUp] = useState({});
  const [screenOn, setScreenOn] = useState(false);
  const [translationOn, setTranslationOn] = useState(true);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [myPrefLang, setMyPrefLang] = useState(myLang);

  const [captions, setCaptions] = useState([]); // {id, from, sourceLang, text, translated, translatedLang, ts, self}
  const [transcript, setTranscript] = useState([]); // full log
  const [chat, setChat] = useState([]);
  const [micTrackMuted, setMicTrackMuted] = useState(!localParticipant.isMicrophoneEnabled);
  const [camTrackMuted, setCamTrackMuted] = useState(!localParticipant.isCameraEnabled);
  const [handRaised, setHandRaised] = useState(false);
  const [live, setLive] = useState(""); // in-progress live text for current speaker

  const micStreamRef = useRef(null);

  // Independent mic stream for translator (avoids fighting LiveKit's own mic).
  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = stream;
      } catch {}
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  /* LiveKit data channel */
  const { send: sendData } = useDataChannel((msg) => {
    try {
      const payload = JSON.parse(new TextDecoder().decode(msg.payload));
      handleIncoming(payload);
    } catch {}
  });

  const broadcast = useCallback((obj) => {
    try { sendData(new TextEncoder().encode(JSON.stringify(obj)), { reliable: true }); } catch {}
  }, [sendData]);

  const persistTranscript = useCallback(async (speaker, sourceLang, text, translations) => {
    try {
      await api.post(`/rooms/${code}/transcript`, {
        room_code: code, speaker, source_lang: sourceLang, text, translations: translations || {},
      });
    } catch {}
  }, [code]);

  const handleIncoming = useCallback(async (payload) => {
    if (payload.kind === "transcript-live") {
      // Streaming partial from a remote speaker.
      setLive(`${payload.name}: ${payload.text}`);
    } else if (payload.kind === "transcript") {
      setLive("");
      const cap = {
        id: payload.id, from: payload.name, sourceLang: payload.sourceLang,
        text: payload.text, ts: Date.now(), translated: null, translatedLang: null,
      };
      setCaptions((prev) => [...prev.slice(-20), cap]);
      setTranscript((t) => [...t, cap]);

      if (payload.sourceLang !== myPrefLang) {
        try {
          const { data } = await api.post("/translate", {
            text: payload.text, source_lang: payload.sourceLang,
            target_lang: myPrefLang, with_audio: true, room_code: code,
          });
          setCaptions((prev) => prev.map((c) => c.id === cap.id ? { ...c, translated: data.translated_text, translatedLang: data.target_lang } : c));
          setTranscript((t) => t.map((c) => c.id === cap.id ? { ...c, translated: data.translated_text, translatedLang: data.target_lang } : c));
          if (data.audio_url) {
            const audio = new Audio(`${process.env.REACT_APP_BACKEND_URL}${data.audio_url}`);
            audio.play().catch(() => {});
          }
        } catch {}
      }
    } else if (payload.kind === "hand") {
      setHandsUp((h) => {
        const next = { ...h };
        if (payload.raised) next[payload.identity] = Date.now();
        else delete next[payload.identity];
        return next;
      });
      if (payload.identity !== localParticipant.identity) {
        toast(`${payload.name} ${payload.raised ? "raised" : "lowered"} their hand`);
      }
    } else if (payload.kind === "chat") {
      setChat((c) => [...c, { id: payload.id, sender: payload.name, text: payload.text, ts: payload.ts }]);
    } else if (payload.kind === "kick" && payload.identity === localParticipant.identity) {
      toast.error("Removed by host"); setTimeout(() => nav("/"), 700);
    } else if (payload.kind === "muteAll") {
      if (localParticipant.identity !== payload.from && localParticipant.isMicrophoneEnabled) {
        localParticipant.setMicrophoneEnabled(false); setMicTrackMuted(true);
        toast("Muted by host");
      }
    } else if (payload.kind === "end") {
      toast.error("Meeting ended by host"); setTimeout(() => nav("/"), 700);
    }
  }, [myPrefLang, localParticipant, nav, code]);

  /* Translator hook (transcribes MY speech) */
  const onTranscript = useCallback(({ text, isFinal }) => {
    if (!text) return;
    if (!isFinal) {
      // Live partial — show locally & broadcast so remote listeners get streaming text.
      setLive(`${myName} (you): ${text}`);
      broadcast({ kind: "transcript-live", identity: localParticipant.identity, name: myName, sourceLang: myPrefLang, text });
      return;
    }
    if (text.length < 2) return;
    setLive("");
    const id = `${localParticipant.identity}-${Date.now()}`;
    const cap = { id, from: `${myName} (you)`, sourceLang: myPrefLang, text, ts: Date.now(), self: true };
    setCaptions((prev) => [...prev.slice(-20), cap]);
    setTranscript((t) => [...t, cap]);
    broadcast({ kind: "transcript", id, identity: localParticipant.identity, name: myName, sourceLang: myPrefLang, text });
    persistTranscript(myName, myPrefLang, text);
  }, [broadcast, localParticipant.identity, myName, myPrefLang, persistTranscript]);

  useTranslator({
    enabled: translationOn && !micTrackMuted && !!micStreamRef.current,
    micStream: micStreamRef.current,
    speakLang: myPrefLang,
    onTranscript,
  });

  /* Chat history */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/rooms/${code}/chat`);
        setChat(data.map((d) => ({ id: d.id, sender: d.sender, text: d.text, ts: d.created_at })));
      } catch {}
    })();
    (async () => {
      try {
        const { data } = await api.get(`/rooms/${code}/transcript`);
        setTranscript(data.map((d) => ({
          id: d.id, from: d.speaker, sourceLang: d.source_lang, text: d.text,
          translated: (d.translations || {})[myPrefLang] || null,
          translatedLang: (d.translations || {})[myPrefLang] ? myPrefLang : null,
          ts: d.created_at,
        })));
      } catch {}
    })();
  }, [code, myPrefLang]);

  /* Controls */
  const toggleMic = async () => {
    const next = !localParticipant.isMicrophoneEnabled;
    await localParticipant.setMicrophoneEnabled(next);
    setMicTrackMuted(!next);
  };
  const toggleCam = async () => {
    const next = !localParticipant.isCameraEnabled;
    await localParticipant.setCameraEnabled(next);
    setCamTrackMuted(!next);
  };
  const toggleScreen = async () => {
    try {
      const next = !localParticipant.isScreenShareEnabled;
      await localParticipant.setScreenShareEnabled(next);
      setScreenOn(next);
    } catch { toast.error("Screen share denied"); }
  };
  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    broadcast({ kind: "hand", identity: localParticipant.identity, name: myName, raised: next });
  };
  const leave = () => { room.disconnect(); nav("/"); };
  const endForAll = () => { broadcast({ kind: "end", from: localParticipant.identity }); setTimeout(leave, 300); };
  const muteAll = () => { broadcast({ kind: "muteAll", from: localParticipant.identity }); toast.success("Muted everyone"); };
  const kick = (identity, targetName) => { broadcast({ kind: "kick", identity }); toast(`Removing ${targetName}…`); };
  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/j/${code}`);
    toast.success("Invite link copied");
  };
  const downloadTranscript = () => {
    window.open(`${API}/rooms/${code}/transcript/download`, "_blank");
  };

  const sendChat = async (text) => {
    if (!text.trim()) return;
    try {
      const { data } = await api.post(`/rooms/${code}/chat`, { room_code: code, sender: myName, text: text.trim() });
      broadcast({ kind: "chat", id: data.id, name: myName, text: data.text, ts: data.created_at });
      setChat((c) => [...c, { id: data.id, sender: myName, text: data.text, ts: data.created_at }]);
    } catch { toast.error("Message failed"); }
  };

  const latestCaption = useMemo(() => captions[captions.length - 1], [captions]);

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-void overflow-hidden relative hide-lk-controls" data-testid="meeting-page">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3 border-b border-white/5 relative z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white text-void flex items-center justify-center flex-shrink-0">
            <Video className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium tracking-tight truncate">Bridge</div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-white/40 truncate">room · {code}</div>
          </div>
          <div className="ml-2 sm:ml-4 hidden sm:flex items-center gap-2 text-xs text-white/50">
            <Circle className="w-2 h-2 fill-signal text-signal animate-pulse-red rounded-full" />
            live · {participants.length}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyInvite} className="btn-ghost text-xs !py-2 !px-3 flex items-center gap-2" data-testid="copy-invite-in-meeting">
            <Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Invite</span>
          </button>
          <div className="relative">
            <button className="btn-ghost text-xs !py-2 !px-3 flex items-center gap-2" onClick={() => setShowLangPicker((v) => !v)} data-testid="lang-picker-btn">
              <Languages className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{languageName(myPrefLang)}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showLangPicker && (
              <div className="absolute right-0 top-11 milled rounded-2xl p-2 w-56 z-50 grid grid-cols-2 gap-1">
                {LANGUAGES.map((l) => (
                  <button key={l.code} onClick={() => { setMyPrefLang(l.code); localStorage.setItem("bridge:lang", l.code); setShowLangPicker(false); }} className={`text-left px-3 py-2 rounded-xl text-sm hover:bg-white/5 ${myPrefLang === l.code ? "bg-active/10 text-active" : "text-white/80"}`} data-testid={`meeting-lang-${l.code}`}>
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stage */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <VideoStage />

          {/* Live in-progress line */}
          {live && (
            <div className="absolute bottom-40 sm:bottom-44 left-1/2 -translate-x-1/2 max-w-3xl w-[92%] pointer-events-none z-30">
              <div className="caption-pill px-4 py-2 rounded-2xl text-center text-white/70 text-sm italic">
                <span className="inline-block w-1.5 h-1.5 bg-active rounded-full mr-2 animate-pulse" />
                {live}
              </div>
            </div>
          )}

          {/* Final caption */}
          {latestCaption && (
            <div className="absolute bottom-24 sm:bottom-32 left-1/2 -translate-x-1/2 max-w-3xl w-[92%] pointer-events-none z-40 animate-fade-in" data-testid="caption-overlay">
              <div className="caption-pill px-4 sm:px-6 py-3 rounded-2xl text-center">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-1">
                  {latestCaption.from} · {languageName(latestCaption.sourceLang)}
                  {latestCaption.translated && <> → {languageName(latestCaption.translatedLang)}</>}
                </div>
                <div className="text-white text-base sm:text-lg leading-snug">
                  {latestCaption.translated || latestCaption.text}
                </div>
                {latestCaption.translated && (
                  <div className="text-white/40 text-xs italic mt-1">"{latestCaption.text}"</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Side panels */}
        {panel === "chat" && <ChatPanel chat={chat} onClose={() => setPanel(null)} onSend={sendChat} myName={myName} />}
        {panel === "people" && (
          <PeoplePanel
            participants={participants} handsUp={handsUp} isHost={isHost}
            onClose={() => setPanel(null)} onKick={kick} onMuteAll={muteAll} onEnd={endForAll}
            localIdentity={localParticipant.identity}
          />
        )}
        {panel === "transcript" && (
          <TranscriptPanel transcript={transcript} onClose={() => setPanel(null)} onDownload={downloadTranscript} myPrefLang={myPrefLang} />
        )}
      </div>

      {/* Mobile-friendly control bar */}
      <div className="absolute bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[96%] sm:w-auto max-w-full">
        <div className="milled rounded-2xl px-2 sm:px-3 py-2 flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
          <button onClick={toggleMic} className={`ctrl-btn ${micTrackMuted ? "muted" : ""}`} data-testid="meeting-mic-btn" title={micTrackMuted ? "Unmute" : "Mute"}>
            {micTrackMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button onClick={toggleCam} className={`ctrl-btn ${camTrackMuted ? "muted" : ""}`} data-testid="meeting-cam-btn" title={camTrackMuted ? "Start video" : "Stop video"}>
            {camTrackMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>
          <button onClick={toggleScreen} className={`ctrl-btn ${screenOn ? "active" : ""} hidden sm:inline-flex`} data-testid="meeting-screen-btn" title={screenOn ? "Stop sharing" : "Share screen"}>
            {screenOn ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
          </button>
          <button onClick={toggleHand} className={`ctrl-btn ${handRaised ? "active" : ""}`} data-testid="meeting-hand-btn" title="Raise hand">
            <Hand className="w-5 h-5" />
          </button>
          <button onClick={() => setTranslationOn((v) => !v)} className={`ctrl-btn ${translationOn ? "active" : ""}`} data-testid="meeting-translate-btn" title="Translation">
            <Languages className="w-5 h-5" />
          </button>
          <div className="w-px h-8 bg-white/10 mx-0.5 sm:mx-1 hidden sm:block" />
          <button onClick={() => setPanel(panel === "chat" ? null : "chat")} className={`ctrl-btn ${panel === "chat" ? "active" : ""}`} data-testid="meeting-chat-btn" title="Chat">
            <MessageSquare className="w-5 h-5" />
          </button>
          <button onClick={() => setPanel(panel === "people" ? null : "people")} className={`ctrl-btn ${panel === "people" ? "active" : ""}`} data-testid="meeting-people-btn" title="Participants">
            <Users className="w-5 h-5" />
            <span className="text-xs font-semibold">{participants.length}</span>
          </button>
          <button onClick={() => setPanel(panel === "transcript" ? null : "transcript")} className={`ctrl-btn ${panel === "transcript" ? "active" : ""}`} data-testid="meeting-transcript-btn" title="Transcript">
            <FileText className="w-5 h-5" />
          </button>
          <div className="w-px h-8 bg-white/10 mx-0.5 sm:mx-1 hidden sm:block" />
          <button onClick={leave} className="ctrl-btn danger" data-testid="meeting-leave-btn" title="Leave">
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Stage ---------------- */
function VideoStage() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  const screens = tracks.filter((t) => t.source === Track.Source.ScreenShare);
  const cams = tracks.filter((t) => t.source === Track.Source.Camera);
  const ordered = [...screens, ...cams];
  const count = ordered.length;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;

  return (
    <div className="h-full w-full p-2 sm:p-4 pb-28 sm:pb-32 overflow-hidden" data-testid="video-stage">
      <div className="grid gap-2 sm:gap-4 h-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {ordered.map((tr) => (
          <div key={`${tr.participant.identity}-${tr.source}`} className="relative rounded-xl sm:rounded-2xl border border-white/10 bg-black overflow-hidden" data-testid={`tile-${tr.participant.identity}`}>
            <ParticipantTile trackRef={tr} disableSpeakingIndicator={false} style={{ height: "100%", width: "100%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Panels ---------------- */
function ChatPanel({ chat, onClose, onSend, myName }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [chat.length]);
  return (
    <aside className="absolute sm:relative right-0 top-0 bottom-0 w-full sm:w-80 h-full bg-surface1 border-l border-white/5 flex flex-col animate-fade-in z-40" data-testid="chat-panel">
      <PanelHeader title="Chat" onClose={onClose} testid="close-chat-btn" />
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {chat.length === 0 && <div className="text-xs text-white/40 text-center mt-6">No messages yet</div>}
        {chat.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{m.sender === myName ? "you" : m.sender}</div>
            <div className="bg-white/5 rounded-xl px-3 py-2 text-white/90 leading-snug">{m.text}</div>
          </div>
        ))}
      </div>
      <form className="p-3 border-t border-white/5 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); onSend(text); setText(""); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" className="input-field text-sm" data-testid="chat-input" />
        <button type="submit" className="ctrl-btn active" data-testid="chat-send-btn" disabled={!text.trim()}>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
}

function PeoplePanel({ participants, handsUp, isHost, onClose, onKick, onMuteAll, onEnd, localIdentity }) {
  return (
    <aside className="absolute sm:relative right-0 top-0 bottom-0 w-full sm:w-80 h-full bg-surface1 border-l border-white/5 flex flex-col animate-fade-in z-40" data-testid="people-panel">
      <PanelHeader title={`Participants · ${participants.length}`} onClose={onClose} testid="close-people-btn" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
        {participants.map((p) => {
          const meta = (() => { try { return JSON.parse(p.metadata || "{}"); } catch { return {}; } })();
          return (
            <div key={p.identity} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2">
              <div>
                <div className="text-sm text-white/90 flex items-center gap-2 flex-wrap">
                  {p.name || p.identity}
                  {p.identity === localIdentity && <span className="text-[10px] text-white/40">(you)</span>}
                  {meta.is_host && <span className="text-[10px] text-electric uppercase tracking-widest">host</span>}
                  {handsUp[p.identity] && <Hand className="w-3.5 h-3.5 text-electric" />}
                </div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest flex items-center gap-2 mt-0.5">
                  {p.isMicrophoneEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3 text-signal" />}
                  {p.isCameraEnabled ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3 text-white/40" />}
                </div>
              </div>
              {isHost && p.identity !== localIdentity && (
                <button onClick={() => onKick(p.identity, p.name || p.identity)} className="text-xs text-signal hover:underline" data-testid={`kick-${p.identity}`}>Remove</button>
              )}
            </div>
          );
        })}
      </div>
      {isHost && (
        <div className="p-3 border-t border-white/5 flex flex-col gap-2">
          <button onClick={onMuteAll} className="btn-ghost text-sm" data-testid="host-mute-all-btn">Mute everyone</button>
          <button onClick={onEnd} className="ctrl-btn danger justify-center" data-testid="host-end-btn">End meeting for all</button>
        </div>
      )}
    </aside>
  );
}

function TranscriptPanel({ transcript, onClose, onDownload, myPrefLang }) {
  const listRef = useRef(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [transcript.length]);
  return (
    <aside className="absolute sm:relative right-0 top-0 bottom-0 w-full sm:w-96 h-full bg-surface1 border-l border-white/5 flex flex-col animate-fade-in z-40" data-testid="transcript-panel">
      <PanelHeader title="Live transcript" onClose={onClose} testid="close-transcript-btn" />
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {transcript.length === 0 && <div className="text-xs text-white/40 text-center mt-6">Waiting for speech…</div>}
        {transcript.map((entry) => (
          <div key={entry.id} className="text-sm">
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1 flex items-center justify-between">
              <span>{entry.from}</span>
              <span>{languageName(entry.sourceLang)}{entry.translated && ` → ${languageName(entry.translatedLang || myPrefLang)}`}</span>
            </div>
            <TypedText text={entry.translated || entry.text} />
            {entry.translated && (
              <div className="text-white/40 text-xs italic mt-1">"{entry.text}"</div>
            )}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-white/5">
        <button onClick={onDownload} className="btn-ghost text-sm w-full flex items-center justify-center gap-2" data-testid="download-transcript-btn">
          <Download className="w-4 h-4" /> Download transcript (.txt)
        </button>
      </div>
    </aside>
  );
}

/**
 * Renders a caption with a subtle word-by-word reveal so live transcripts feel
 * incremental even when they arrive in one chunk.
 */
function TypedText({ text }) {
  const words = (text || "").split(/(\s+)/);
  return (
    <div className="bg-white/5 rounded-xl px-3 py-2 text-white/90 leading-snug">
      {words.map((w, i) => (
        <span
          key={i}
          style={{ animationDelay: `${Math.min(i * 40, 800)}ms` }}
          className="inline-block opacity-0 animate-fade-in"
        >
          {w}
        </span>
      ))}
    </div>
  );
}

function PanelHeader({ title, onClose, testid }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
      <div className="text-sm font-medium">{title}</div>
      <button onClick={onClose} className="p-1 rounded hover:bg-white/10" data-testid={testid}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
