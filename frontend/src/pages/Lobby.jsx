import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, LANGUAGES } from "../lib/api";
import { Mic, MicOff, Video, VideoOff, ArrowRight, Copy, ShieldAlert, RefreshCw } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function Lobby() {
  const { code } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [name, setName] = useState(user?.name || localStorage.getItem("bridge:name") || "");
  const [room, setRoom] = useState(null);
  const [lang, setLang] = useState(localStorage.getItem("bridge:lang") || "en");
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [devices, setDevices] = useState({ audioIn: [], videoIn: [] });
  const [selected, setSelected] = useState({ audioIn: "", videoIn: "" });
  const [joining, setJoining] = useState(false);
  const [permError, setPermError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/rooms/${code}`);
        setRoom(data);
      } catch {
        toast.error("Room not found");
        nav("/");
      }
    })();
  }, [code, nav]);

  const requestMedia = async () => {
    setPermError(null);
    try {
      // Requires HTTPS + user gesture on mobile browsers.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selected.audioIn ? { deviceId: { exact: selected.audioIn } } : true,
        video: selected.videoIn ? { deviceId: { exact: selected.videoIn } } : { facingMode: "user" },
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        audioIn: list.filter((d) => d.kind === "audioinput"),
        videoIn: list.filter((d) => d.kind === "videoinput"),
      });
    } catch (e) {
      console.warn("gum failed", e);
      const msg = e?.name === "NotAllowedError"
        ? "Camera & microphone access was denied. Please allow permissions in your browser settings."
        : e?.name === "NotFoundError"
        ? "No camera or microphone found on this device."
        : e?.name === "NotReadableError"
        ? "Camera / mic is being used by another app. Close it and retry."
        : "Could not access camera or microphone.";
      setPermError(msg);
    }
  };

  useEffect(() => {
    requestMedia();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.audioIn, selected.videoIn]);

  useEffect(() => { streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = audioOn)); }, [audioOn]);
  useEffect(() => { streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = videoOn)); }, [videoOn]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/j/${code}`);
    toast.success("Invite link copied");
  };

  const join = async () => {
    if (!name.trim()) return toast.error("Enter your name");
    setJoining(true);
    localStorage.setItem("bridge:name", name.trim());
    localStorage.setItem("bridge:lang", lang);
    localStorage.setItem("bridge:audioOn", audioOn ? "1" : "0");
    localStorage.setItem("bridge:videoOn", videoOn ? "1" : "0");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    nav(`/m/${code}`);
  };

  return (
    <div className="min-h-screen w-full px-4 sm:px-8 lg:px-14 py-6 sm:py-8 flex flex-col" data-testid="lobby-page">
      <div className="flex items-center justify-between mb-6 sm:mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white text-void flex items-center justify-center">
            <Video className="w-5 h-5" strokeWidth={2} />
          </div>
          <div>
            <div className="h-brand text-lg sm:text-xl font-medium">bridge</div>
            <div className="text-[10px] sm:text-xs text-white/40 tracking-widest uppercase">room · {code}</div>
          </div>
        </div>
        <button className="btn-ghost text-xs sm:text-sm flex items-center gap-2" onClick={copyLink} data-testid="copy-invite-btn">
          <Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Copy invite</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 flex-1">
        {/* Camera preview */}
        <div className="lg:col-span-8 flex flex-col animate-fade-in">
          <div className="relative rounded-3xl overflow-hidden bg-black aspect-video border border-white/10 shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-300 ${videoOn && !permError ? "opacity-100" : "opacity-0"}`}
              data-testid="lobby-video-preview"
            />
            {(!videoOn || permError) && !permError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 sm:w-32 h-24 sm:h-32 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-3xl sm:text-4xl h-brand">
                  {(name.trim()[0] || "?").toUpperCase()}
                </div>
              </div>
            )}
            {permError && (
              <div className="absolute inset-0 flex items-center justify-center p-6" data-testid="perm-error">
                <div className="max-w-md text-center">
                  <ShieldAlert className="w-10 h-10 text-signal mx-auto mb-3" />
                  <div className="h-brand text-lg font-medium mb-2">Camera & mic blocked</div>
                  <p className="text-sm text-white/60 mb-4">{permError}</p>
                  <div className="text-xs text-white/50 mb-4 leading-relaxed">
                    <span className="block sm:inline">iOS: <b>Settings ▸ Safari ▸ Camera & Microphone ▸ Allow</b></span>
                    <span className="hidden sm:inline"> · </span>
                    <span className="block sm:inline">Android: Tap the lock icon ▸ Permissions ▸ Camera / Mic ▸ Allow</span>
                  </div>
                  <button onClick={requestMedia} className="btn-primary text-sm inline-flex items-center gap-2" data-testid="retry-permissions-btn">
                    <RefreshCw className="w-4 h-4" /> Retry
                  </button>
                </div>
              </div>
            )}
            <div className="absolute bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-3">
              <button onClick={() => setAudioOn((v) => !v)} className={`ctrl-btn ${!audioOn ? "muted" : ""}`} data-testid="lobby-mic-toggle">
                {audioOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button onClick={() => setVideoOn((v) => !v)} className={`ctrl-btn ${!videoOn ? "muted" : ""}`} data-testid="lobby-cam-toggle">
                {videoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {devices.audioIn.length + devices.videoIn.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mt-4 sm:mt-6">
              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Microphone</label>
                <select className="input-field mt-1 text-sm" value={selected.audioIn} onChange={(e) => setSelected((s) => ({ ...s, audioIn: e.target.value }))} data-testid="lobby-mic-select">
                  <option value="">Default</option>
                  {devices.audioIn.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-white/40">Camera</label>
                <select className="input-field mt-1 text-sm" value={selected.videoIn} onChange={(e) => setSelected((s) => ({ ...s, videoIn: e.target.value }))} data-testid="lobby-cam-select">
                  <option value="">Default</option>
                  {devices.videoIn.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="milled rounded-3xl p-5 sm:p-6 animate-slide-up">
            <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3 sm:mb-4">Your identity</div>
            <input className="input-field" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} data-testid="lobby-name-input" maxLength={64} />
            {room && <div className="mt-3 text-xs text-white/40">Host: <span className="text-white/70">{room.host_name}</span></div>}
          </div>

          <div className="milled rounded-3xl p-5 sm:p-6 animate-slide-up" style={{ animationDelay: "60ms" }}>
            <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3 sm:mb-4">I want to listen in</div>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`px-3 py-2 rounded-xl border text-xs sm:text-sm transition-colors duration-200 ${
                    lang === l.code ? "border-active bg-active/10 text-active" : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25"
                  }`}
                  data-testid={`lang-option-${l.code}`}
                >
                  <span className="text-[10px] tracking-widest opacity-60 mr-2 hidden sm:inline">{l.flag}</span>
                  {l.name}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-white/40 mt-3 leading-relaxed">
              Translated into <span className="text-white/70">{LANGUAGES.find((l) => l.code === lang)?.name}</span> in real time.
            </div>
          </div>

          <button onClick={join} disabled={joining || !name.trim()} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 h-14" data-testid="lobby-join-btn">
            {joining ? "Joining…" : "Join meeting"} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
