# Bridge — Test Credentials

## Fixed Admin (auto-seeded on startup)
- Email: `admin@bridge.app`
- Password: `BridgeAdmin2026!`
- Role: `admin` (cannot be demoted or disabled by anyone)
- Plan: `plan_enterprise`

## How to login
- **Email/password**: POST `/api/auth/login` with `{email, password}` → returns `{user, token}` and sets `session_token` HttpOnly cookie.
- **Google (Emergent OAuth)**: user clicks "Continue with Google" → redirects to
  `https://auth.emergentagent.com/?redirect={origin}/dashboard` → returns with
  `#session_id=...` fragment → frontend exchanges via `POST /api/auth/google/exchange`.
- **Guest**: no login needed. Provide name on Landing and either host or join by
  room code.

## Test users (create at will)
- Users can self-register via `POST /api/auth/register` (email/password/name).
- Free plan by default. Admin can promote / disable / change plan via
  `/api/admin/users/*`.

## Third-party keys already in `/app/backend/.env`
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — LiveKit Cloud
- `OPENAI_API_KEY` — real OpenAI project key (Realtime, GPT-4o-mini, gpt-4o-mini-tts)
- `STRIPE_API_KEY=sk_test_emergent` — pre-configured Stripe test key

Admin can override the OpenAI key at runtime through the admin panel (Providers tab).
When the admin-provided key is empty, the backend falls back to the env `OPENAI_API_KEY`.

## Key endpoints for testing
- `GET  /api/health`
- `GET  /api/languages`
- `POST /api/rooms` (create room, optional auth)
- `POST /api/livekit/token`
- `POST /api/realtime/session` (OpenAI Realtime ephemeral token)
- `POST /api/translate` (real OpenAI GPT-4o-mini)
- `GET  /api/tts/{id}` (real OpenAI TTS mp3 stream)
- `POST /api/rooms/{code}/transcript` + `GET /api/rooms/{code}/transcript` + `GET /api/rooms/{code}/transcript/download`
- `GET  /api/plans` (list Free / Pro / Enterprise)
- `POST /api/checkout/session` (auth required, Stripe checkout for paid plan)
- `GET  /api/checkout/status/{session_id}`
- `POST /api/webhook/stripe`
- `GET  /api/me/usage`, `GET /api/me/subscription`
- `GET  /api/admin/users`, `POST /api/admin/users/role|disable|plan`
- `GET  /api/admin/providers`, `POST /api/admin/providers|providers/key|providers/active`
- `GET  /api/admin/usage`
- `POST /api/admin/plans`, `DELETE /api/admin/plans/{id}`

## Notes
- Frontend routes: `/`, `/login`, `/register`, `/pricing`, `/dashboard`, `/admin`,
  `/billing/success`, `/j/:code` (lobby), `/m/:code` (meeting).
- Data-testid convention: `landing-*`, `login-*`, `register-*`, `dashboard-*`,
  `admin-*`, `plan-*`, `provider-*`, `user-*`, `lobby-*`, `meeting-*`.
- Mobile is fully supported — permissions helper (`data-testid="perm-error"`)
  appears if the browser blocks camera/mic.
