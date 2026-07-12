"""Apply /app/backend/schema.sql to the Supabase database.

Runs each statement via Supabase's Postgres REST connection using asyncpg on
the direct database URL. Supabase's project URL is not the DB host; we need to
compute the pooler host or use the direct connection string from Supabase.

Since we don't have the DB password, we call the schema via the PostgREST
"rpc" mechanism: create a temporary SQL function to exec arbitrary SQL isn't
allowed either. So the simplest reliable path is: ask the user to paste
schema.sql into the Supabase SQL editor once.

However, for a purely programmatic approach we use the `postgrest` HTTP
interface to CREATE tables — which is not supported.

Practical solution: leverage supabase-py's `postgrest` client to run one
`.rpc('exec_sql')` — but that requires a helper function. So we instead pipe
the SQL directly to the Postgres endpoint via psycopg using the URL from an
env var `SUPABASE_DB_URL` if present.
"""
from __future__ import annotations
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "schema.sql")


async def main() -> None:
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print(
            "SUPABASE_DB_URL not set. Please paste the SQL below into the Supabase SQL editor once:\n"
        )
        with open(SCHEMA_PATH, encoding="utf-8") as fh:
            print(fh.read())
        sys.exit(0)

    import asyncpg  # local import to avoid dep at server-startup

    conn = await asyncpg.connect(db_url)
    try:
        with open(SCHEMA_PATH, encoding="utf-8") as fh:
            sql = fh.read()
        await conn.execute(sql)
        print("Schema applied.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
