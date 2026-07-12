# Bridge — Real-time Voice-Translated Video Meeting SaaS

## Original Problem Statement
Zoom-like video meeting platform with real-time voice-to-voice translation
(OpenAI Realtime) across 10 languages. Iteration 2 requirements: full auth
(email/password + Google + guest), fixed admin who can add other admins with
a full control panel (users / API keys / AI providers / usage monitoring /
subscription planning), Stripe subscription payments, redesigned SaaS landing
page, full mobile responsiveness with permissions helper, live word-by-word
transcript panel + downloadable transcript.

## User Choices
- Media SFU: LiveKit Cloud (creds provided)
- Translation: OpenAI Realtime + gpt-4o-mini + gpt-4o-mini-tts (real key)
- Auth: email/password + Emergent Google + guest
- Fixed admin: `admin@bridge.app` (password `BridgeAdmin2026!`)
- Payments: Stripe via `emergentintegrations` (pre-configured test key)
- Languages: en, es, hi, zh, fr, de, ar, pt, ja, ru

## Architecture
- **Backend** — FastAPI, Motor/Mongo, `emergentintegrations` for Stripe, `livekit-api`.
  Auth: bcrypt+JWT (7-day) OR Emergent Google OAuth session tokens.  
  Endpoints: `/api/auth/*`, `/api/rooms/*`, `/api/livekit/token`,
  `/api/realtime/session`, `/api/translate`, `/api/tts/{id}`, `/api/plans`,
  `/api/checkout/*`, `/api/webhook/stripe`, `/api/me/*`, `/api/admin/*`,
  `/api/rooms/{code}/transcript*`, `/api/rooms/{code}/chat*`.
- **Frontend** — React 18 + Tailwind + LiveKit React SDK + `sonner`. Routes:
  `/`, `/login`, `/register`, `/pricing`, `/dashboard`, `/admin`,
  `/billing/success`, `/j/:code` (lobby), `/m/:code` (meeting). AuthContext
  handles JWT + Emergent Google session-id URL-hash flow.
- **Translation flow** — Browser opens ephemeral OpenAI Realtime WebRTC
  session. Transcripts broadcast via LiveKit dataChannel. Every listener
  whose target language differs auto-translates via `/api/translate` and
  auto-plays TTS via `/api/tts/{id}`.
- **Transcripts** — persisted per room in Mongo; downloadable as `.txt`.

## Implemented (2026-07-10 v2)
- ✅ Full auth (register / login / logout / Google / guest fallback)
- ✅ Fixed admin auto-seeded, protected from demotion & disabling
- ✅ Admin console with 4 tabs: Usage / Users / AI Providers / Plans
- ✅ Provider management (OpenAI seeded, Gemini + Claude ready to enable) —
  add API key, mask, activate for LLM/TTS
- ✅ Usage tracking (translate chars, TTS chars, meeting joins, cost estimate)
- ✅ Subscription plans (Free $0 / Pro $12 / Enterprise $39) — CRUD by admin
- ✅ Stripe checkout end-to-end (free = instant activation, paid = Stripe
  session + polling on success page + webhook)
- ✅ Redesigned SaaS landing (hero + language chips + feature grid + CTA)
- ✅ Fully responsive Nav with mobile hamburger
- ✅ Mobile-friendly Lobby with camera/mic permission helper + retry
- ✅ Mobile-friendly Meeting control bar (wraps at small viewports)
- ✅ Live transcript panel + word-by-word reveal + `.txt` download
- ✅ 31/31 backend pytest + full frontend Playwright suite passing

## Backlog / Follow-ups
- **P1** Split `server.py` into modules (auth, admin, checkout, transcripts)
- **P1** Restrict CORS to explicit origins; add JWT blocklist on logout
- **P1** Encrypt `provider_keys.api_key` at rest
- **P2** Server-side kick/mute-all via LiveKit `RoomServiceClient`
- **P2** Stripe webhook signature strict verify + open-redirect whitelist on
  checkout `origin`
- **P2** Rate-limit unauthenticated transcript writes
- **P2** Meeting recording via LiveKit Egress → S3
- **P3** Team workspaces (multi-user orgs)
- **P3** Post-meeting AI summary (feed transcript to gpt-4o-mini)
