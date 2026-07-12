"""Supabase data-access layer.

Provides tiny helpers that mimic the parts of the Motor / MongoDB API our
`server.py` was previously using (`find_one`, `find`, `insert_one`,
`update_one` with `$set` / `$setOnInsert`, `count_documents`, `delete_one`,
`delete_many`, and a small `aggregate` helper for the admin usage endpoint).

Everything is executed through the `supabase-py` client using the service-role
key, so RLS is bypassed and the backend has full authority.

Behaviour differences vs Mongo that callers rely on:
* `find_one({...})` → returns the first matching row as a dict, or None
* `insert_one(doc)` → inserts, returns dict with id (we accept `_id` or `id`)
* `update_one(filter, {"$set": {...}}, upsert=True)` supported.
  `$setOnInsert` is emulated: if row doesn't exist we insert with the
  `$setOnInsert` fields; if it exists we do nothing.
* `find({...}).sort(field, dir).limit(n)` chainable using a small helper.
* `count_documents({...})` returns integer.
* `aggregate([...])` is only used for the admin "top users" query — we
  implement that specifically with a raw select+group+order+limit call.

This file is intentionally small and pragmatic; do not treat it as a general
Mongo → Postgres shim.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Iterable, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]

# One shared client (thread-safe for read/write, uses HTTP under the hood).
supa: Client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Which Mongo `_id` field name should be mapped to which Postgres column for
# each collection. Postgres tables all use `id`, `code`, `session_token`, or
# `provider_id` as the primary key depending on the entity.
_PK_MAP: Dict[str, str] = {
    "users": "user_id",
    "user_sessions": "session_token",
    "rooms": "id",
    "participants": "id",
    "chat_messages": "id",
    "transcripts": "id",
    "plans": "id",
    "providers": "id",
    "provider_keys": "provider_id",
    "settings": "id",
    "usage_events": "id",
    "payment_transactions": "id",
    "tts_cache": "id",
}


def _pk(table: str) -> str:
    return _PK_MAP.get(table, "id")


def _clean_doc(table: str, doc: Dict[str, Any]) -> Dict[str, Any]:
    """Copy `doc`, translating `_id` → the table's primary-key column."""
    out = dict(doc)
    if "_id" in out:
        out[_pk(table)] = out.pop("_id")
    return out


def _apply_filter(query, flt: Dict[str, Any], table: str):
    """Apply a Mongo-ish filter dict to a supabase query builder."""
    for k, v in (flt or {}).items():
        col = _pk(table) if k == "_id" else k
        if isinstance(v, dict):
            if "$gte" in v:
                query = query.gte(col, v["$gte"])
            if "$gt" in v:
                query = query.gt(col, v["$gt"])
            if "$lte" in v:
                query = query.lte(col, v["$lte"])
            if "$lt" in v:
                query = query.lt(col, v["$lt"])
            if "$ne" in v:
                query = query.neq(col, v["$ne"])
            if "$in" in v:
                query = query.in_(col, list(v["$in"]))
        else:
            query = query.eq(col, v)
    return query


# ---------------------------------------------------------------------------
# Public collection-style wrapper
# ---------------------------------------------------------------------------


class _Cursor:
    """Chainable cursor supporting sort/limit + async iteration."""

    def __init__(self, table: str, flt: Optional[Dict[str, Any]] = None,
                 projection: Optional[Dict[str, int]] = None):
        self.table = table
        self.filter = flt or {}
        self.projection = projection
        self._sort: List[tuple] = []
        self._limit: Optional[int] = None

    def sort(self, field, direction=1):
        self._sort.append((field, direction))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def _build(self):
        q = supa.table(self.table).select("*")
        q = _apply_filter(q, self.filter, self.table)
        for field, direction in self._sort:
            col = _pk(self.table) if field == "_id" else field
            q = q.order(col, desc=(direction == -1))
        if self._limit:
            q = q.limit(self._limit)
        return q

    def __aiter__(self):
        self._iter_data = None
        self._iter_idx = 0
        return self

    async def __anext__(self):
        if self._iter_data is None:
            r = self._build().execute()
            self._iter_data = r.data or []
        if self._iter_idx >= len(self._iter_data):
            raise StopAsyncIteration
        row = self._iter_data[self._iter_idx]
        self._iter_idx += 1
        return _row_out(self.table, row)


def _row_out(table: str, row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Return the row with the primary key aliased to `_id` for consumers."""
    if row is None:
        return None
    pk = _pk(table)
    out = dict(row)
    if pk in out:
        out["_id"] = out[pk]
    return out


class Collection:
    def __init__(self, table: str):
        self.table = table

    async def find_one(self, flt: Dict[str, Any], projection: Optional[Dict[str, int]] = None) -> Optional[Dict[str, Any]]:
        q = supa.table(self.table).select("*")
        q = _apply_filter(q, flt, self.table).limit(1)
        r = q.execute()
        rows = r.data or []
        row = rows[0] if rows else None
        out = _row_out(self.table, row)
        # projection: honour {"password_hash": 0}
        if out and projection:
            for k, v in projection.items():
                if v == 0 and k in out:
                    out.pop(k, None)
        return out

    def find(self, flt: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, int]] = None) -> _Cursor:
        return _Cursor(self.table, flt or {}, projection)

    async def insert_one(self, doc: Dict[str, Any]):
        payload = _clean_doc(self.table, doc)
        supa.table(self.table).insert(payload).execute()
        return payload

    async def update_one(self, flt: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        set_fields = update.get("$set") or {}
        set_on_insert = update.get("$setOnInsert") or {}
        # Try to see if it exists first (needed to honour $setOnInsert semantics).
        exists = await self.find_one(flt)
        if exists:
            if set_fields:
                q = supa.table(self.table).update(set_fields)
                q = _apply_filter(q, flt, self.table)
                q.execute()
            return
        if upsert:
            new_doc = {**set_on_insert, **set_fields}
            # Fill in filter columns so the row actually matches later look-ups.
            for k, v in flt.items():
                col = _pk(self.table) if k == "_id" else k
                new_doc.setdefault(col, v)
            payload = _clean_doc(self.table, new_doc)
            # Use upsert on the PK to avoid races.
            supa.table(self.table).upsert(payload, on_conflict=_pk(self.table)).execute()

    async def delete_one(self, flt: Dict[str, Any]):
        q = supa.table(self.table).delete()
        q = _apply_filter(q, flt, self.table).limit(1)
        q.execute()

    async def delete_many(self, flt: Dict[str, Any]):
        q = supa.table(self.table).delete()
        q = _apply_filter(q, flt, self.table)
        q.execute()

    async def count_documents(self, flt: Dict[str, Any]) -> int:
        q = supa.table(self.table).select("*", count="exact", head=True)
        q = _apply_filter(q, flt, self.table)
        r = q.execute()
        return r.count or 0

    async def aggregate_top_translate_users(self, since_iso: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Specialised helper (only used by /api/admin/usage)."""
        r = (
            supa.table("usage_events")
            .select("user_id, chars")
            .eq("type", "translate")
            .gte("created_at", since_iso)
            .not_.is_("user_id", "null")
            .execute()
        )
        buckets: Dict[str, Dict[str, int]] = {}
        for row in r.data or []:
            uid = row["user_id"]
            b = buckets.setdefault(uid, {"chars": 0, "count": 0})
            b["chars"] += row.get("chars") or 0
            b["count"] += 1
        top = sorted(
            ({"_id": uid, "chars": b["chars"], "count": b["count"]} for uid, b in buckets.items()),
            key=lambda r: r["chars"],
            reverse=True,
        )[:limit]
        return top


class SupabaseDB:
    def __init__(self):
        self.users = Collection("users")
        self.user_sessions = Collection("user_sessions")
        self.rooms = Collection("rooms")
        self.participants = Collection("participants")
        self.chat_messages = Collection("chat_messages")
        self.transcripts = Collection("transcripts")
        self.plans = Collection("plans")
        self.providers = Collection("providers")
        self.provider_keys = Collection("provider_keys")
        self.settings = Collection("settings")
        self.usage_events = Collection("usage_events")
        self.payment_transactions = Collection("payment_transactions")
        self.tts_cache = Collection("tts_cache")


db = SupabaseDB()
