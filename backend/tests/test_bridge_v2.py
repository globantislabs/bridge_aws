"""Bridge v2 backend tests: auth, admin, plans, checkout, transcripts, translation."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://717a7976-2a6d-44e6-8569-fc68af4d9476.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bridge.app"
ADMIN_PASSWORD = "BridgeAdmin2026!"


# ---- Auth ----
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "admin"
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@bridge.app"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "TestPass123!", "name": "TEST User",
    }, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.email = email
    s.user_id = data["user"]["user_id"]
    return s


def test_admin_login_and_me(admin_session):
    r = admin_session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["email"] == ADMIN_EMAIL
    assert me["role"] == "admin"


def test_me_unauth_401():
    r = requests.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 401


def test_register_user(user_session):
    r = user_session.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    assert r.json()["role"] == "user"


def test_login_wrong_password():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=10)
    assert r.status_code == 401


def test_google_exchange_invalid_session():
    r = requests.post(f"{API}/auth/google/exchange",
                      json={"session_id": "invalid-session-id-xyz"}, timeout=15)
    assert r.status_code == 401


def test_logout(admin_session):
    # Use a separate session to not disturb admin_session tests
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
    tok = r.json()["token"]
    r = s.post(f"{API}/auth/logout", timeout=10)
    assert r.status_code == 200
    # Cookie should be cleared. Bearer still works because JWT is stateless, but session-token cookie flow needs to be invalidated for Google.
    # For JWT bearer, session-based revoke is not implemented; only cookie-based logout is guaranteed.
    r = s.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 401


# ---- Plans ----
def test_list_plans():
    r = requests.get(f"{API}/plans", timeout=10)
    assert r.status_code == 200
    plans = r.json()
    assert len(plans) == 3
    by_id = {p["id"]: p for p in plans}
    assert by_id["plan_free"]["price_usd"] == 0
    assert by_id["plan_pro"]["price_usd"] == 12
    assert by_id["plan_enterprise"]["price_usd"] == 39


# ---- Checkout ----
def test_checkout_requires_auth():
    r = requests.post(f"{API}/checkout/session",
                      json={"plan_id": "plan_pro", "origin": BASE_URL}, timeout=15)
    assert r.status_code == 401


def test_checkout_free_plan(user_session):
    r = user_session.post(f"{API}/checkout/session",
                          json={"plan_id": "plan_free", "origin": BASE_URL}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("free_plan_activated") is True


def test_checkout_pro_creates_session(user_session):
    r = user_session.post(f"{API}/checkout/session",
                          json={"plan_id": "plan_pro", "origin": BASE_URL}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("url", "").startswith("http")
    assert "session_id" in data
    # Status endpoint
    sid = data["session_id"]
    r2 = user_session.get(f"{API}/checkout/status/{sid}", timeout=30)
    assert r2.status_code == 200, r2.text
    assert "status" in r2.json()


# ---- Admin RBAC ----
def test_admin_endpoints_forbidden_for_user(user_session):
    for path in ["/admin/users", "/admin/providers", "/admin/usage"]:
        r = user_session.get(f"{API}{path}", timeout=10)
        assert r.status_code == 403, f"{path} => {r.status_code}"


def test_admin_endpoints_unauth():
    for path in ["/admin/users", "/admin/providers", "/admin/usage"]:
        r = requests.get(f"{API}{path}", timeout=10)
        assert r.status_code == 401


def test_admin_list_users(admin_session):
    r = admin_session.get(f"{API}/admin/users", timeout=10)
    assert r.status_code == 200
    users = r.json()
    assert any(u["email"] == ADMIN_EMAIL for u in users)


def test_admin_usage(admin_session):
    r = admin_session.get(f"{API}/admin/usage", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["total_users", "total_rooms_created", "translate_events_30d",
              "tts_events_30d", "meeting_joins_30d", "estimated_cost_usd_30d"]:
        assert k in d


# ---- Providers ----
def test_admin_providers_list_and_key(admin_session):
    r = admin_session.get(f"{API}/admin/providers", timeout=10)
    assert r.status_code == 200
    data = r.json()
    ids = {p["id"] for p in data["providers"]}
    assert {"prov_openai", "prov_gemini", "prov_anthropic"} <= ids
    assert data["active_llm"] == "prov_openai"

    # Set a fake key then check it's masked
    r2 = admin_session.post(f"{API}/admin/providers/key",
                            json={"provider_id": "prov_openai", "api_key": "sk-testfakekey123456"}, timeout=10)
    assert r2.status_code == 200
    r3 = admin_session.get(f"{API}/admin/providers", timeout=10)
    d3 = r3.json()
    openai = next(p for p in d3["providers"] if p["id"] == "prov_openai")
    assert openai["key_set"] is True
    assert openai["key_masked"].endswith("3456")

    # Clear the key so env fallback works for translation tests
    r4 = admin_session.post(f"{API}/admin/providers/key",
                            json={"provider_id": "prov_openai", "api_key": ""}, timeout=10)
    assert r4.status_code == 200


def test_admin_active_provider(admin_session):
    r = admin_session.post(f"{API}/admin/providers/active",
                           json={"kind": "llm", "provider_id": "prov_openai"}, timeout=10)
    assert r.status_code == 200


# ---- Admin user management ----
def test_admin_user_role_and_disable_and_plan(admin_session, user_session):
    uid = user_session.user_id
    # promote to admin then back
    r = admin_session.post(f"{API}/admin/users/role",
                           json={"user_id": uid, "role": "admin"}, timeout=10)
    assert r.status_code == 200
    r = admin_session.post(f"{API}/admin/users/role",
                           json={"user_id": uid, "role": "user"}, timeout=10)
    assert r.status_code == 200

    # cannot demote fixed admin
    admin_user = next(u for u in admin_session.get(f"{API}/admin/users").json()
                      if u["email"] == ADMIN_EMAIL)
    r = admin_session.post(f"{API}/admin/users/role",
                           json={"user_id": admin_user["user_id"], "role": "user"}, timeout=10)
    assert r.status_code == 400

    # cannot disable fixed admin
    r = admin_session.post(f"{API}/admin/users/disable",
                           json={"user_id": admin_user["user_id"], "disabled": True}, timeout=10)
    assert r.status_code == 400

    # assign plan
    r = admin_session.post(f"{API}/admin/users/plan",
                           json={"user_id": uid, "plan_id": "plan_pro"}, timeout=10)
    assert r.status_code == 200


# ---- Admin plans ----
def test_admin_plans_crud(admin_session):
    # Create custom plan
    r = admin_session.post(f"{API}/admin/plans", json={
        "id": "plan_test_custom", "name": "TEST_Custom", "price_usd": 5.0,
        "meeting_minutes_per_month": 100, "translation_minutes_per_month": 50,
        "max_participants": 10, "features": ["Test"], "highlight": False,
    }, timeout=10)
    assert r.status_code == 200

    # Delete default should 400
    r = admin_session.delete(f"{API}/admin/plans/plan_free", timeout=10)
    assert r.status_code == 400

    # Delete custom should 200
    r = admin_session.delete(f"{API}/admin/plans/plan_test_custom", timeout=10)
    assert r.status_code == 200


# ---- Transcripts ----
@pytest.fixture(scope="module")
def transcript_room():
    r = requests.post(f"{API}/rooms", json={"host_name": "TEST_Transcript"}, timeout=15)
    assert r.status_code == 200
    return r.json()["code"]


def test_transcript_add_list_download(transcript_room):
    code = transcript_room
    r = requests.post(f"{API}/rooms/{code}/transcript", json={
        "room_code": code, "speaker": "Alice", "source_lang": "en",
        "text": "Hello world", "translations": {"es": "Hola mundo"},
    }, timeout=10)
    assert r.status_code == 200
    r = requests.get(f"{API}/rooms/{code}/transcript", timeout=10)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 1
    assert items[0]["translations"].get("es") == "Hola mundo"

    r = requests.get(f"{API}/rooms/{code}/transcript/download", timeout=10)
    assert r.status_code == 200
    assert "attachment" in r.headers.get("Content-Disposition", "")
    assert r.headers.get("content-type", "").startswith("text/plain")
    assert "Hello world" in r.text


# ---- Translation (real OpenAI) ----
def test_translate_real_openai():
    r = requests.post(f"{API}/translate", json={
        "text": "Hello world",
        "source_lang": "en",
        "target_lang": "es",
        "with_audio": True,
    }, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "hola" in d["translated_text"].lower()
    assert d["audio_url"].startswith("/api/tts/")


# ---- Realtime session ----
def test_realtime_session():
    r = requests.post(f"{API}/realtime/session", timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["client_secret"].startswith("ek_")
