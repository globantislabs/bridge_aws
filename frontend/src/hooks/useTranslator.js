/**
 * useTranslator — hooks into OpenAI Realtime API via WebRTC.
 *
 * Uses the ephemeral client_secret returned by /api/realtime/session to open a
 * WebRTC PeerConnection directly with OpenAI. Streams the user's microphone
 * audio and receives text transcripts on the data channel.
 *
 *   onTranscript({ text, isFinal, sourceLang })
 *
 * Note: OpenAI Realtime does not currently expose detected-language explicitly
 * in transcription-only mode, so we tag transcripts with the caller's chosen
 * `speakLang`. In practice the user's spoken language matches this closely.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API } from "../lib/api";

export default function useTranslator({ enabled, micStream, speakLang, onTranscript }) {
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioSenderRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | connecting | live | error

  const stop = useCallback(() => {
    try {
      dcRef.current?.close();
      pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop());
      pcRef.current?.close();
    } catch (e) {}
    dcRef.current = null;
    pcRef.current = null;
    audioSenderRef.current = null;
    setState("idle");
  }, []);

  useEffect(() => {
    if (!enabled || !micStream) {
      stop();
      return;
    }
    let cancelled = false;

    const start = async () => {
      setState("connecting");
      try {
        const res = await fetch(`${API}/realtime/session`, { method: "POST" });
        if (!res.ok) throw new Error("session http " + res.status);
        const { client_secret, model } = await res.json();

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        // Silent audio sink — we only need transcripts.
        const remoteAudio = new Audio();
        remoteAudio.autoplay = true;
        remoteAudio.muted = true;
        pc.ontrack = (ev) => { remoteAudio.srcObject = ev.streams[0]; };

        // Send mic track
        const track = micStream.getAudioTracks()[0];
        if (!track) throw new Error("no mic track");
        audioSenderRef.current = pc.addTrack(track, micStream);

        // Data channel for events
        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.onopen = () => {
          setState("live");
          // Configure session: transcription-only in original language.
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                modalities: ["text"],
                input_audio_transcription: { model: "whisper-1" },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                },
                instructions:
                  "Transcribe the speaker's audio to text in the language they are speaking. Do not translate. Do not respond conversationally.",
              },
            })
          );
        };
        dc.onmessage = (e) => {
          try {
            const evt = JSON.parse(e.data);
            if (
              evt.type === "conversation.item.input_audio_transcription.completed" &&
              evt.transcript
            ) {
              onTranscript?.({
                text: evt.transcript.trim(),
                isFinal: true,
                sourceLang: speakLang,
              });
            } else if (
              evt.type === "conversation.item.input_audio_transcription.delta" &&
              evt.delta
            ) {
              onTranscript?.({
                text: evt.delta,
                isFinal: false,
                sourceLang: speakLang,
              });
            }
          } catch {}
        };
        dc.onerror = () => setState("error");

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpResp = await fetch(
          `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model || "gpt-4o-realtime-preview-2024-12-17")}`,
          {
            method: "POST",
            body: offer.sdp,
            headers: {
              Authorization: `Bearer ${client_secret}`,
              "Content-Type": "application/sdp",
            },
          }
        );
        if (!sdpResp.ok) throw new Error("sdp exchange " + sdpResp.status);
        const answerSdp = await sdpResp.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch (err) {
        console.error("[translator] failed", err);
        setState("error");
      }
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, micStream, speakLang, onTranscript, stop]);

  return { state };
}
