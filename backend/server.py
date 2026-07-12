"""Bridge — Meeting platform backend (v2).

Adds:
- Email/password (JWT) + Emergent Google OAuth + guest access
- Fixed admin (auto-seeded) with the ability to promote / demote other admins
- Admin panel APIs: users, providers, API-keys, usage, subscription plans
- Subscription plans + Stripe Checkout (via emergentintegrations)
- Usage tracking on every translation / TTS / meeting join
- Word-by-word live captions bridged through LiveKit data channels (client-side)
- Meeting transcript persistence with download endpoint
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import random
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import bcrypt
import httpx
import jwt as pyjwt
from dotenv import load_dotenv
from fastapi import APIRouter, Cookie, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from livekit import api as lk_api
from pydantic import BaseModel, EmailStr, Field

from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    CheckoutStatusResponse,
    StripeCheckout,
)

from supa import db  # Supabase-backed data layer with a Mongo-like interface

load_dotenv()

logger = logging.getLogger("bridge")
logging.basicConfig(level=logging.INFO)

# ------- Env -------
MONGO_URL = os.environ.get("MONGO_URL", "")  # kept for backward compat
DB_NAME = os.environ.get("DB_NAME", "")
LIVEKIT_URL = os.environ["LIVEKIT_URL"]
LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]
OPENAI_API_KEY_DEFAULT = os.environ.get("OPENAI_API_KEY", "")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me")
FIXED_ADMIN_EMAIL = os.environ.get("FIXED_ADMIN_EMAIL", "admin@bridge.app").lower()
FIXED_ADMIN_PASSWORD = os.environ.get("FIXED_ADMIN_PASSWORD", "BridgeAdmin2026!")


app = FastAPI(title="Bridge Meeting API v2")
router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ------- Constants -------

SUPPORTED_LANGUAGES = {
    "en": "English", "es": "Spanish", "hi": "Hindi", "zh": "Mandarin",
    "fr": "French", "de": "German", "ar": "Arabic", "pt": "Portuguese",
    "ja": "Japanese", "ru": "Russian",
}

DEFAULT_PLANS = [
    {
        "_id": "plan_free",
        "name": "Free",
        "price_usd": 0.0,
        "meeting_minutes_per_month": 40,
        "translation_minutes_per_month": 10,
        "max_participants": 4,
        "features": [
            "40 min meetings/month",
            "10 min live translation/month",
            "Up to 4 participants",
            "Live captions",
        ],
        "highlight": False,
    },
    {
        "_id": "plan_pro",
        "name": "Pro",
        "price_usd": 12.0,
        "meeting_minutes_per_month": 1500,
        "translation_minutes_per_month": 500,
        "max_participants": 25,
        "features": [
            "1500 min meetings/month",
            "500 min live translation/month",
            "Up to 25 participants",
            "Downloadable transcripts",
            "Priority translation",
        ],
        "highlight": True,
    },
    {
        "_id": "plan_enterprise",
        "name": "Enterprise",
        "price_usd": 39.0,
        "meeting_minutes_per_month": 10000,
        "translation_minutes_per_month": 5000,
        "max_participants": 100,
        "features": [
            "10 000 min meetings/month",
            "5 000 min live translation/month",
            "Up to 100 participants",
            "Custom AI provider keys",
            "Team admin dashboard",
            "Priority support",
        ],
        "highlight": False,
    },
]

DEFAULT_PROVIDERS = [
    {"_id": "prov_openai", "name": "OpenAI", "kind": "llm+tts+realtime",
     "models": ["gpt-4o-mini", "gpt-4o-realtime-preview", "gpt-4o-mini-tts"], "enabled": True},
    {"_id": "prov_gemini", "name": "Google Gemini", "kind": "llm",
     "models": ["gemini-2.5-flash", "gemini-2.5-pro"], "enabled": False},
    {"_id": "prov_anthropic", "name": "Anthropic Claude", "kind": "llm",
     "models": ["claude-sonnet-4-5", "claude-haiku-4-5"], "enabled": False},
]


# ------- Helpers -------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _room_code() -> str:
    letters = string.ascii_lowercase
    return "-".join("".join(random.choice(letters) for _ in range(3)) for _ in range(3))


def _hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _check_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def _mint_jwt(user_id: str, email: str, role: str) -> str:
    now = _now()
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=7)).timestamp()),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _decode_jwt(token: str) -> Dict[str, Any]:
    return pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])


# ------- Auth dependency -------

async def get_current_user(
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> Optional[Dict[str, Any]]:
    """Returns user doc if authenticated (via cookie / bearer), else None."""
    token = session_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None

    # 1) JWT (email/password)
    try:
        payload = _decode_jwt(token)
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
        if user:
            return user
    except pyjwt.InvalidTokenError:
        pass

    # 2) Emergent Google session_token
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    exp = sess.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            exp = None
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < _now():
        return None
    return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})


async def require_user(user: Optional[Dict] = Depends(get_current_user)) -> Dict:
    if not user:
        raise HTTPException(401, "Authentication required")
    return user


async def require_admin(user: Dict = Depends(require_user)) -> Dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user


# ------- Startup seeding -------

@app.on_event("startup")
async def seed_defaults():
    # Plans
    for p in DEFAULT_PLANS:
        await db.plans.update_one({"_id": p["_id"]}, {"$setOnInsert": p}, upsert=True)
    # Providers
    for prov in DEFAULT_PROVIDERS:
        await db.providers.update_one({"_id": prov["_id"]}, {"$setOnInsert": prov}, upsert=True)
    # Active-provider setting
    await db.settings.update_one(
        {"_id": "active_llm_provider"},
        {"$setOnInsert": {"_id": "active_llm_provider", "value": "prov_openai"}},
        upsert=True,
    )
    await db.settings.update_one(
        {"_id": "active_tts_provider"},
        {"$setOnInsert": {"_id": "active_tts_provider", "value": "prov_openai"}},
        upsert=True,
    )
    # Fixed admin
    admin = await db.users.find_one({"email": FIXED_ADMIN_EMAIL})
    if not admin:
        await db.users.insert_one(
            {
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": FIXED_ADMIN_EMAIL,
                "name": "Bridge Admin",
                "password_hash": _hash_password(FIXED_ADMIN_PASSWORD),
                "role": "admin",
                "plan_id": "plan_enterprise",
                "picture": None,
                "provider": "password",
                "created_at": _now_iso(),
                "disabled": False,
            }
        )
        logger.info("Seeded fixed admin: %s", FIXED_ADMIN_EMAIL)
    else:
        # Ensure they always remain an admin.
        await db.users.update_one({"email": FIXED_ADMIN_EMAIL}, {"$set": {"role": "admin"}})


# ------- Models -------

class RoomOut(BaseModel):
    id: str
    code: str
    host_name: str
    created_at: str


class CreateRoomReq(BaseModel):
    host_name: str = Field(min_length=1, max_length=64)


class RegisterReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=80)


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class GoogleExchangeReq(BaseModel):
    session_id: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    plan_id: Optional[str] = None
    picture: Optional[str] = None
    provider: str = "password"
    created_at: str
    disabled: bool = False


class TokenRequest(BaseModel):
    room_code: str
    identity: str
    name: str
    is_host: bool = False


class TokenOut(BaseModel):
    token: str
    livekit_url: str
    room: str
    identity: str


class RealtimeSessionOut(BaseModel):
    client_secret: str
    expires_at: int
    model: str


class TranslateReq(BaseModel):
    text: str
    source_lang: str
    target_lang: str
    voice: Optional[str] = "alloy"
    with_audio: bool = True
    room_code: Optional[str] = None


class TranslateOut(BaseModel):
    translated_text: str
    source_lang: str
    target_lang: str
    audio_url: Optional[str] = None


class ChatMessageIn(BaseModel):
    room_code: str
    sender: str
    text: str


class ChatMessageOut(BaseModel):
    id: str
    room_code: str
    sender: str
    text: str
    created_at: str


class TranscriptEntryIn(BaseModel):
    room_code: str
    speaker: str
    source_lang: str
    text: str
    translations: Optional[Dict[str, str]] = None  # lang_code -> translated text


class PlanOut(BaseModel):
    id: str
    name: str
    price_usd: float
    meeting_minutes_per_month: int
    translation_minutes_per_month: int
    max_participants: int
    features: List[str]
    highlight: bool


class CheckoutReq(BaseModel):
    plan_id: str
    origin: str


class PromoteReq(BaseModel):
    user_id: str
    role: str  # admin | user


def _user_out(u: Dict) -> UserOut:
    return UserOut(
        user_id=u["user_id"], email=u["email"], name=u.get("name") or "",
        role=u.get("role") or "user", plan_id=u.get("plan_id"),
        picture=u.get("picture"), provider=u.get("provider") or "password",
        created_at=u.get("created_at") or _now_iso(), disabled=bool(u.get("disabled")),
    )


# ------- Auth routes -------

@router.post("/auth/register")
async def register(req: RegisterReq, response: Response):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": req.email.lower(),
        "name": req.name,
        "password_hash": _hash_password(req.password),
        "role": "user",
        "plan_id": "plan_free",
        "picture": None,
        "provider": "password",
        "created_at": _now_iso(),
        "disabled": False,
    }
    await db.users.insert_one(doc)
    token = _mint_jwt(user_id, doc["email"], doc["role"])
    _set_session_cookie(response, token)
    return {"user": _user_out(doc), "token": token}


@router.post("/auth/login")
async def login(req: LoginReq, response: Response):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or user.get("disabled"):
        raise HTTPException(401, "Invalid credentials")
    if not _check_password(req.password, user.get("password_hash") or ""):
        raise HTTPException(401, "Invalid credentials")
    token = _mint_jwt(user["user_id"], user["email"], user.get("role") or "user")
    _set_session_cookie(response, token)
    return {"user": _user_out(user), "token": token}


@router.post("/auth/google/exchange")
async def google_exchange(req: GoogleExchangeReq, response: Response):
    """Exchange Emergent Google session_id for our session cookie + user record."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if r.status_code >= 400:
        raise HTTPException(401, f"Google session exchange failed: {r.text}")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(401, "No email returned")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data.get("session_token")

    user = await db.users.find_one({"email": email})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        role = "admin" if email == FIXED_ADMIN_EMAIL else "user"
        user = {
            "user_id": user_id, "email": email, "name": name,
            "role": role, "plan_id": "plan_free", "picture": picture,
            "provider": "google", "created_at": _now_iso(), "disabled": False,
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture, "provider": "google"}},
        )
        user = await db.users.find_one({"email": email})

    # Persist Emergent session_token so the /auth/me lookup can find it.
    await db.user_sessions.insert_one(
        {
            "user_id": user["user_id"],
            "session_token": session_token,
            "expires_at": (_now() + timedelta(days=7)).isoformat(),
            "created_at": _now_iso(),
        }
    )
    _set_session_cookie(response, session_token)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"user": _user_out(user), "token": session_token}


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key="session_token",
        value=token,
        max_age=60 * 60 * 24 * 7,
        path="/",
        httponly=True,
        secure=True,
        samesite="none",
    )


@router.post("/auth/logout")
async def logout(
    response: Response,
    session_token: Optional[str] = Cookie(default=None),
):
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


@router.get("/auth/me")
async def me(user: Dict = Depends(require_user)):
    return _user_out(user)


# ------- Room / LiveKit -------

@router.get("/health")
async def health():
    return {"ok": True, "time": _now_iso()}


@router.get("/languages")
async def languages():
    return [{"code": k, "name": v} for k, v in SUPPORTED_LANGUAGES.items()]


@router.post("/rooms", response_model=RoomOut)
async def create_room(payload: CreateRoomReq, user: Optional[Dict] = Depends(get_current_user)):
    code = _room_code()
    while await db.rooms.find_one({"code": code}):
        code = _room_code()
    doc = {
        "_id": str(uuid.uuid4()),
        "code": code,
        "host_name": payload.host_name,
        "host_user_id": user["user_id"] if user else None,
        "created_at": _now_iso(),
    }
    await db.rooms.insert_one(doc)
    return RoomOut(id=doc["_id"], code=code, host_name=payload.host_name, created_at=doc["created_at"])


@router.get("/rooms/{code}", response_model=RoomOut)
async def get_room(code: str):
    doc = await db.rooms.find_one({"code": code})
    if not doc:
        raise HTTPException(404, "Room not found")
    return RoomOut(id=doc["_id"], code=doc["code"], host_name=doc["host_name"], created_at=doc["created_at"])


@router.post("/livekit/token", response_model=TokenOut)
async def livekit_token(payload: TokenRequest, user: Optional[Dict] = Depends(get_current_user)):
    room = await db.rooms.find_one({"code": payload.room_code})
    if not room:
        raise HTTPException(404, "Room not found")

    grants = lk_api.VideoGrants(
        room_join=True, room=payload.room_code,
        can_publish=True, can_subscribe=True, can_publish_data=True,
    )
    token = (
        lk_api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(payload.identity)
        .with_name(payload.name)
        .with_grants(grants)
        .with_metadata(f'{{"is_host": {str(payload.is_host).lower()}}}')
        .to_jwt()
    )

    await db.participants.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "room": payload.room_code,
            "user_id": user["user_id"] if user else None,
            "identity": payload.identity, "name": payload.name,
            "is_host": payload.is_host, "joined_at": _now_iso(),
        }
    )
    # Usage: 1 meeting join event (we track minutes on leave via a separate ping).
    await db.usage_events.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "user_id": user["user_id"] if user else None,
            "type": "meeting_join",
            "room": payload.room_code,
            "created_at": _now_iso(),
        }
    )
    return TokenOut(token=token, livekit_url=LIVEKIT_URL, room=payload.room_code, identity=payload.identity)


# ------- OpenAI Realtime session -------

async def _get_openai_key() -> str:
    doc = await db.provider_keys.find_one({"_id": "prov_openai"})
    return (doc or {}).get("api_key") or OPENAI_API_KEY_DEFAULT


@router.post("/realtime/session", response_model=RealtimeSessionOut)
async def realtime_session():
    key = await _get_openai_key()
    if not key:
        raise HTTPException(500, "OpenAI API key not configured")
    async with httpx.AsyncClient(timeout=15.0) as http:
        r = await http.post(
            "https://api.openai.com/v1/realtime/client_secrets",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "session": {
                    "type": "realtime",
                    "model": "gpt-4o-realtime-preview",
                    "instructions": (
                        "You are a live-transcription engine for a video meeting. "
                        "Transcribe the speaker's audio into text in the ORIGINAL language spoken. "
                        "Do NOT translate. Do NOT respond conversationally. "
                        "Emit only conversation.item events with the transcript."
                    ),
                }
            },
        )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, f"OpenAI Realtime error: {r.text}")
    data = r.json()
    return RealtimeSessionOut(
        client_secret=data.get("value") or data.get("client_secret", {}).get("value"),
        expires_at=data.get("expires_at") or data.get("client_secret", {}).get("expires_at", 0),
        model="gpt-4o-realtime-preview",
    )


# ------- Translation & TTS -------

@router.post("/translate", response_model=TranslateOut)
async def translate(payload: TranslateReq, user: Optional[Dict] = Depends(get_current_user)):
    if payload.target_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(400, "Unsupported target language")
    key = await _get_openai_key()
    if not key:
        raise HTTPException(500, "OpenAI API key not configured")

    src = SUPPORTED_LANGUAGES.get(payload.source_lang, payload.source_lang)
    tgt = SUPPORTED_LANGUAGES[payload.target_lang]
    system = (
        f"You are a professional live-meeting interpreter. "
        f"Translate the user text from {src} into {tgt}. "
        f"Output ONLY the translated sentence, no quotes, no commentary, natural spoken tone."
    )
    async with httpx.AsyncClient(timeout=20.0) as http:
        r = await http.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": payload.text},
                ],
                "temperature": 0.2, "max_tokens": 400,
            },
        )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text)
    translated = r.json()["choices"][0]["message"]["content"].strip()

    audio_url = None
    if payload.with_audio:
        audio_id = str(uuid.uuid4())
        await db.tts_cache.insert_one(
            {"_id": audio_id, "text": translated, "voice": payload.voice or "alloy", "created_at": _now_iso()}
        )
        audio_url = f"/api/tts/{audio_id}"

    # Usage
    await db.usage_events.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "user_id": user["user_id"] if user else None,
            "type": "translate",
            "chars": len(payload.text) + len(translated),
            "source_lang": payload.source_lang,
            "target_lang": payload.target_lang,
            "room": payload.room_code,
            "created_at": _now_iso(),
        }
    )
    return TranslateOut(
        translated_text=translated,
        source_lang=payload.source_lang, target_lang=payload.target_lang,
        audio_url=audio_url,
    )


@router.get("/tts/{audio_id}")
async def tts_stream(audio_id: str, user: Optional[Dict] = Depends(get_current_user)):
    key = await _get_openai_key()
    if not key:
        raise HTTPException(500, "OpenAI API key not configured")
    doc = await db.tts_cache.find_one({"_id": audio_id})
    if not doc:
        raise HTTPException(404, "TTS entry not found")
    async with httpx.AsyncClient(timeout=30.0) as http:
        r = await http.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini-tts", "voice": doc.get("voice") or "alloy",
                "input": doc["text"], "response_format": "mp3",
            },
        )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, "TTS generation failed")
    await db.usage_events.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "user_id": user["user_id"] if user else None,
            "type": "tts",
            "chars": len(doc["text"]),
            "created_at": _now_iso(),
        }
    )
    return Response(content=r.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


# ------- Chat -------

@router.post("/rooms/{code}/chat", response_model=ChatMessageOut)
async def post_chat(code: str, payload: ChatMessageIn):
    if payload.room_code != code:
        raise HTTPException(400, "room mismatch")
    doc = {
        "_id": str(uuid.uuid4()), "room_code": code,
        "sender": payload.sender, "text": payload.text, "created_at": _now_iso(),
    }
    await db.chat_messages.insert_one(doc)
    return ChatMessageOut(
        id=doc["_id"], room_code=code, sender=doc["sender"],
        text=doc["text"], created_at=doc["created_at"],
    )


@router.get("/rooms/{code}/chat", response_model=List[ChatMessageOut])
async def list_chat(code: str, limit: int = 200):
    cursor = db.chat_messages.find({"room_code": code}).sort("created_at", 1).limit(limit)
    return [
        ChatMessageOut(
            id=d["_id"], room_code=d["room_code"], sender=d["sender"],
            text=d["text"], created_at=d["created_at"],
        )
        async for d in cursor
    ]


# ------- Transcripts -------

@router.post("/rooms/{code}/transcript")
async def add_transcript(code: str, payload: TranscriptEntryIn):
    doc = {
        "_id": str(uuid.uuid4()),
        "room_code": code,
        "speaker": payload.speaker,
        "source_lang": payload.source_lang,
        "text": payload.text,
        "translations": payload.translations or {},
        "created_at": _now_iso(),
    }
    await db.transcripts.insert_one(doc)
    return {"ok": True, "id": doc["_id"]}


@router.get("/rooms/{code}/transcript")
async def list_transcript(code: str, limit: int = 2000):
    cursor = db.transcripts.find({"room_code": code}).sort("created_at", 1).limit(limit)
    return [
        {
            "id": d["_id"], "speaker": d["speaker"], "source_lang": d["source_lang"],
            "text": d["text"], "translations": d.get("translations", {}), "created_at": d["created_at"],
        }
        async for d in cursor
    ]


@router.get("/rooms/{code}/transcript/download")
async def download_transcript(code: str):
    cursor = db.transcripts.find({"room_code": code}).sort("created_at", 1)
    lines = [f"# Bridge — Transcript for room {code}", f"# Exported {_now_iso()}", ""]
    async for d in cursor:
        ts = d["created_at"]
        lines.append(f"[{ts}] {d['speaker']} ({d['source_lang']}): {d['text']}")
        for lang, t in (d.get("translations") or {}).items():
            lines.append(f"    → {lang}: {t}")
        lines.append("")
    return PlainTextResponse(
        "\n".join(lines),
        headers={"Content-Disposition": f'attachment; filename="transcript-{code}.txt"'},
    )


# ------- Plans / subscriptions -------

@router.get("/plans", response_model=List[PlanOut])
async def list_plans():
    plans = [d async for d in db.plans.find({}).sort("price_usd", 1)]
    return [
        PlanOut(
            id=p["_id"], name=p["name"], price_usd=p["price_usd"],
            meeting_minutes_per_month=p["meeting_minutes_per_month"],
            translation_minutes_per_month=p["translation_minutes_per_month"],
            max_participants=p["max_participants"],
            features=p["features"], highlight=p.get("highlight", False),
        )
        for p in plans
    ]


@router.post("/checkout/session")
async def checkout_session(req: CheckoutReq, request: Request, user: Dict = Depends(require_user)):
    plan = await db.plans.find_one({"_id": req.plan_id})
    if not plan:
        raise HTTPException(404, "Plan not found")
    if plan["price_usd"] <= 0:
        # Free plan — just assign directly.
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"plan_id": plan["_id"]}})
        return {"free_plan_activated": True}

    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe".replace("//api", "/api")
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    origin = req.origin.rstrip("/")
    success_url = f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pricing"

    checkout_req = CheckoutSessionRequest(
        amount=float(plan["price_usd"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "email": user["email"],
            "plan_id": plan["_id"],
            "plan_name": plan["name"],
        },
    )
    session: CheckoutSessionResponse = await stripe.create_checkout_session(checkout_req)

    await db.payment_transactions.insert_one(
        {
            "_id": str(uuid.uuid4()),
            "session_id": session.session_id,
            "user_id": user["user_id"],
            "email": user["email"],
            "plan_id": plan["_id"],
            "amount": float(plan["price_usd"]),
            "currency": "usd",
            "status": "initiated",
            "payment_status": "pending",
            "metadata": checkout_req.metadata,
            "created_at": _now_iso(),
        }
    )
    return {"url": session.url, "session_id": session.session_id}


@router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user: Dict = Depends(require_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id})
    if not tx or tx["user_id"] != user["user_id"]:
        raise HTTPException(404, "Transaction not found")

    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe".replace("//api", "/api")
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    status: CheckoutStatusResponse = await stripe.get_checkout_status(session_id)

    # Idempotent update
    already_paid = tx.get("payment_status") == "paid"
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"status": status.status, "payment_status": status.payment_status, "updated_at": _now_iso()}},
    )
    if status.payment_status == "paid" and not already_paid:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"plan_id": tx["plan_id"]}})

    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
        "plan_id": tx["plan_id"],
    }


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe".replace("//api", "/api")
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    try:
        resp = await stripe.handle_webhook(body, sig)
    except Exception as e:  # noqa
        logger.warning("stripe webhook parse failed: %s", e)
        return {"ok": False}
    if resp and resp.session_id and resp.payment_status == "paid":
        tx = await db.payment_transactions.find_one({"session_id": resp.session_id})
        if tx and tx.get("payment_status") != "paid":
            await db.payment_transactions.update_one(
                {"session_id": resp.session_id},
                {"$set": {"payment_status": "paid", "status": "completed", "updated_at": _now_iso()}},
            )
            await db.users.update_one({"user_id": tx["user_id"]}, {"$set": {"plan_id": tx["plan_id"]}})
    return {"ok": True}


# ------- User self-serve -------

@router.get("/me/usage")
async def my_usage(user: Dict = Depends(require_user)):
    return await _usage_for_user(user["user_id"])


@router.get("/me/subscription")
async def my_subscription(user: Dict = Depends(require_user)):
    plan = await db.plans.find_one({"_id": user.get("plan_id") or "plan_free"})
    tx = await db.payment_transactions.find_one(
        {"user_id": user["user_id"], "payment_status": "paid"},
        sort=[("updated_at", -1)],
    )
    return {
        "plan": {
            "id": plan["_id"], "name": plan["name"], "price_usd": plan["price_usd"],
            "features": plan.get("features", []),
        } if plan else None,
        "last_payment": {
            "session_id": tx.get("session_id"),
            "amount": tx.get("amount"),
            "at": tx.get("updated_at"),
        } if tx else None,
    }


async def _usage_for_user(user_id: str) -> Dict:
    since = _now() - timedelta(days=30)
    cur = db.usage_events.find({"user_id": user_id, "created_at": {"$gte": since.isoformat()}})
    totals = {"meetings": 0, "translate_chars": 0, "tts_chars": 0}
    async for e in cur:
        if e["type"] == "meeting_join":
            totals["meetings"] += 1
        elif e["type"] == "translate":
            totals["translate_chars"] += e.get("chars", 0)
        elif e["type"] == "tts":
            totals["tts_chars"] += e.get("chars", 0)
    return totals


# ------- Admin routes -------

@router.get("/admin/users", response_model=List[UserOut])
async def admin_list_users(_: Dict = Depends(require_admin)):
    users = [u async for u in db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(500)]
    return [_user_out(u) for u in users]


@router.post("/admin/users/role")
async def admin_change_role(payload: PromoteReq, admin: Dict = Depends(require_admin)):
    if payload.role not in ("admin", "user"):
        raise HTTPException(400, "Invalid role")
    target = await db.users.find_one({"user_id": payload.user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if target["email"] == FIXED_ADMIN_EMAIL and payload.role != "admin":
        raise HTTPException(400, "Cannot demote the fixed admin")
    await db.users.update_one({"user_id": payload.user_id}, {"$set": {"role": payload.role}})
    return {"ok": True}


class DisableReq(BaseModel):
    user_id: str
    disabled: bool


@router.post("/admin/users/disable")
async def admin_disable_user(payload: DisableReq, admin: Dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": payload.user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if target["email"] == FIXED_ADMIN_EMAIL and payload.disabled:
        raise HTTPException(400, "Cannot disable the fixed admin")
    await db.users.update_one({"user_id": payload.user_id}, {"$set": {"disabled": payload.disabled}})
    return {"ok": True}


class AssignPlanReq(BaseModel):
    user_id: str
    plan_id: str


@router.post("/admin/users/plan")
async def admin_assign_plan(payload: AssignPlanReq, _: Dict = Depends(require_admin)):
    plan = await db.plans.find_one({"_id": payload.plan_id})
    if not plan:
        raise HTTPException(404, "Plan not found")
    await db.users.update_one({"user_id": payload.user_id}, {"$set": {"plan_id": payload.plan_id}})
    return {"ok": True}


class ProviderReq(BaseModel):
    id: str
    name: str
    kind: str
    models: List[str] = []
    enabled: bool = True


@router.get("/admin/providers")
async def admin_list_providers(_: Dict = Depends(require_admin)):
    provs = [p async for p in db.providers.find({})]
    active_llm = (await db.settings.find_one({"_id": "active_llm_provider"}) or {}).get("value")
    active_tts = (await db.settings.find_one({"_id": "active_tts_provider"}) or {}).get("value")
    # Include masked key
    for p in provs:
        p["id"] = p.pop("_id")
        key = await db.provider_keys.find_one({"_id": p["id"]})
        p["key_set"] = bool(key and key.get("api_key"))
        p["key_masked"] = (
            f"…{key['api_key'][-4:]}" if key and key.get("api_key") else None
        )
    return {"providers": provs, "active_llm": active_llm, "active_tts": active_tts}


@router.post("/admin/providers")
async def admin_upsert_provider(payload: ProviderReq, _: Dict = Depends(require_admin)):
    await db.providers.update_one(
        {"_id": payload.id},
        {"$set": {"name": payload.name, "kind": payload.kind, "models": payload.models, "enabled": payload.enabled}},
        upsert=True,
    )
    return {"ok": True}


class ProviderKeyReq(BaseModel):
    provider_id: str
    api_key: str


@router.post("/admin/providers/key")
async def admin_set_provider_key(payload: ProviderKeyReq, _: Dict = Depends(require_admin)):
    await db.provider_keys.update_one(
        {"_id": payload.provider_id},
        {"$set": {"api_key": payload.api_key, "updated_at": _now_iso()}},
        upsert=True,
    )
    return {"ok": True}


class ActiveProviderReq(BaseModel):
    kind: str  # llm | tts
    provider_id: str


@router.post("/admin/providers/active")
async def admin_set_active_provider(payload: ActiveProviderReq, _: Dict = Depends(require_admin)):
    if payload.kind not in ("llm", "tts"):
        raise HTTPException(400, "kind must be llm|tts")
    await db.settings.update_one(
        {"_id": f"active_{payload.kind}_provider"},
        {"$set": {"value": payload.provider_id}},
        upsert=True,
    )
    return {"ok": True}


@router.get("/admin/usage")
async def admin_usage(_: Dict = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    total_meetings = await db.rooms.count_documents({})
    since = (_now() - timedelta(days=30)).isoformat()
    since7 = (_now() - timedelta(days=7)).isoformat()
    translate30 = await db.usage_events.count_documents({"type": "translate", "created_at": {"$gte": since}})
    translate7 = await db.usage_events.count_documents({"type": "translate", "created_at": {"$gte": since7}})
    tts30 = await db.usage_events.count_documents({"type": "tts", "created_at": {"$gte": since}})
    joins30 = await db.usage_events.count_documents({"type": "meeting_join", "created_at": {"$gte": since}})

    # per user top usage
    top = await db.usage_events.aggregate_top_translate_users(since, limit=10)
    for row in top:
        u = await db.users.find_one({"user_id": row["_id"]}, {"name": 1, "email": 1, "password_hash": 0})
        row["user"] = u or {"email": row["_id"]}

    # Estimate cost (very rough): translate ≈ $0.15 / 1M input+output chars; TTS ≈ $15 / 1M chars.
    trans_chars = 0
    tts_chars = 0
    async for e in db.usage_events.find({"created_at": {"$gte": since}}):
        if e["type"] == "translate":
            trans_chars += e.get("chars", 0)
        elif e["type"] == "tts":
            tts_chars += e.get("chars", 0)
    est_cost = round(trans_chars / 1_000_000 * 0.15 + tts_chars / 1_000_000 * 15.0, 2)

    return {
        "total_users": total_users,
        "total_rooms_created": total_meetings,
        "translate_events_30d": translate30,
        "translate_events_7d": translate7,
        "tts_events_30d": tts30,
        "meeting_joins_30d": joins30,
        "top_translate_users": [
            {"user_id": r["_id"], "chars": r["chars"], "count": r["count"], "user": r["user"]}
            for r in top
        ],
        "estimated_cost_usd_30d": est_cost,
    }


class PlanReq(BaseModel):
    id: Optional[str] = None
    name: str
    price_usd: float
    meeting_minutes_per_month: int
    translation_minutes_per_month: int
    max_participants: int
    features: List[str]
    highlight: bool = False


@router.post("/admin/plans")
async def admin_upsert_plan(payload: PlanReq, _: Dict = Depends(require_admin)):
    pid = payload.id or f"plan_{uuid.uuid4().hex[:8]}"
    await db.plans.update_one(
        {"_id": pid},
        {"$set": {
            "name": payload.name, "price_usd": payload.price_usd,
            "meeting_minutes_per_month": payload.meeting_minutes_per_month,
            "translation_minutes_per_month": payload.translation_minutes_per_month,
            "max_participants": payload.max_participants,
            "features": payload.features, "highlight": payload.highlight,
        }},
        upsert=True,
    )
    return {"ok": True, "id": pid}


@router.delete("/admin/plans/{plan_id}")
async def admin_delete_plan(plan_id: str, _: Dict = Depends(require_admin)):
    if plan_id in ("plan_free", "plan_pro", "plan_enterprise"):
        raise HTTPException(400, "Default plan cannot be deleted")
    await db.plans.delete_one({"_id": plan_id})
    return {"ok": True}


# ------- Register + root -------

app.include_router(router)


@app.get("/")
async def root():
    return {"service": "bridge-meeting", "version": "2.0", "ok": True}
