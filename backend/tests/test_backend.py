"""Backend API tests for Bridge meeting platform."""
import base64
import json
import os
import re

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://717a7976-2a6d-44e6-8569-fc68af4d9476.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def room():
    r = requests.post(f"{API}/rooms", json={"host_name": "TEST_Host"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data


# ----- health & languages -----
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_languages():
    r = requests.get(f"{API}/languages", timeout=10)
    assert r.status_code == 200
    langs = r.json()
    assert isinstance(langs, list)
    assert len(langs) == 10
    codes = {l["code"] for l in langs}
    assert {"en", "es", "hi", "zh", "fr", "de", "ar", "pt", "ja", "ru"} == codes


# ----- rooms -----
def test_create_room(room):
    assert "id" in room and "code" in room
    assert re.match(r"^[a-z]{3}-[a-z]{3}-[a-z]{3}$", room["code"]), room["code"]
    assert room["host_name"] == "TEST_Host"
    assert "created_at" in room


def test_get_room_ok(room):
    r = requests.get(f"{API}/rooms/{room['code']}", timeout=10)
    assert r.status_code == 200
    assert r.json()["code"] == room["code"]


def test_get_room_404():
    r = requests.get(f"{API}/rooms/zzz-zzz-zzz", timeout=10)
    assert r.status_code == 404


# ----- LiveKit token -----
def test_livekit_token(room):
    r = requests.post(f"{API}/livekit/token", json={
        "room_code": room["code"],
        "identity": "user-test-1",
        "name": "Tester",
        "is_host": True,
    }, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["room"] == room["code"]
    assert data["livekit_url"].startswith("wss://")
    token = data["token"]
    parts = token.split(".")
    assert len(parts) == 3, "not a JWT"
    # Decode payload (add padding)
    payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    video = payload.get("video", {})
    assert video.get("roomJoin") is True, payload
    assert video.get("room") == room["code"]


# ----- realtime session -----
def test_realtime_session():
    r = requests.post(f"{API}/realtime/session", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["client_secret"].startswith("ek_"), data["client_secret"][:20]
    assert data["model"] == "gpt-4o-realtime-preview"
    assert isinstance(data["expires_at"], int)


# ----- translate + TTS -----
@pytest.fixture(scope="module")
def translation():
    r = requests.post(f"{API}/translate", json={
        "text": "Hello, how are you?",
        "source_lang": "en",
        "target_lang": "es",
        "with_audio": True,
    }, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_translate(translation):
    assert translation["target_lang"] == "es"
    assert translation["source_lang"] == "en"
    assert translation["translated_text"]
    assert translation["audio_url"].startswith("/api/tts/")
    # Should look Spanish - loose check
    assert any(w in translation["translated_text"].lower() for w in ["hola", "cómo", "como", "estás", "estas", "qué tal"]), translation


def test_tts_stream(translation):
    audio_id = translation["audio_url"].split("/")[-1]
    r = requests.get(f"{API}/tts/{audio_id}", timeout=45)
    assert r.status_code == 200, r.text[:200]
    assert r.headers.get("content-type") == "audio/mpeg"
    assert len(r.content) > 1000


# ----- chat -----
def test_chat_post_and_list(room):
    code = room["code"]
    r = requests.post(f"{API}/rooms/{code}/chat", json={
        "room_code": code, "sender": "Alice", "text": "Hi TEST",
    }, timeout=10)
    assert r.status_code == 200, r.text
    msg = r.json()
    assert msg["text"] == "Hi TEST"

    r2 = requests.get(f"{API}/rooms/{code}/chat", timeout=10)
    assert r2.status_code == 200
    msgs = r2.json()
    assert any(m["id"] == msg["id"] for m in msgs)
