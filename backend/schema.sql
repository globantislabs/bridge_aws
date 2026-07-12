-- Bridge — Supabase schema
-- Run once against your Supabase project via the SQL editor OR by executing
-- backend/scripts/init_supabase.py which will apply it via psycopg.
-- Idempotent.

create extension if not exists pgcrypto;

create table if not exists users (
  user_id           text primary key,
  email             text unique not null,
  name              text not null,
  password_hash     text,
  role              text not null default 'user',
  plan_id           text default 'plan_free',
  picture           text,
  provider          text not null default 'password',
  disabled          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists idx_users_email on users(email);

create table if not exists user_sessions (
  session_token     text primary key,
  user_id           text not null references users(user_id) on delete cascade,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_user_sessions_user on user_sessions(user_id);

create table if not exists rooms (
  id                text primary key,
  code              text unique not null,
  host_name         text not null,
  host_user_id      text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_rooms_code on rooms(code);

create table if not exists participants (
  id                text primary key,
  room              text not null,
  user_id           text,
  identity          text not null,
  name              text not null,
  is_host           boolean not null default false,
  joined_at         timestamptz not null default now()
);
create index if not exists idx_participants_room on participants(room);

create table if not exists chat_messages (
  id                text primary key,
  room_code         text not null,
  sender            text not null,
  text              text not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_chat_room on chat_messages(room_code, created_at);

create table if not exists transcripts (
  id                text primary key,
  room_code         text not null,
  speaker           text not null,
  source_lang       text not null,
  text              text not null,
  translations      jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists idx_transcripts_room on transcripts(room_code, created_at);

create table if not exists plans (
  id                                 text primary key,
  name                               text not null,
  price_usd                          numeric not null,
  meeting_minutes_per_month          integer not null,
  translation_minutes_per_month      integer not null,
  max_participants                   integer not null,
  features                           jsonb not null default '[]'::jsonb,
  highlight                          boolean not null default false
);

create table if not exists providers (
  id                text primary key,
  name              text not null,
  kind              text not null,
  models            jsonb not null default '[]'::jsonb,
  enabled           boolean not null default true
);

create table if not exists provider_keys (
  provider_id       text primary key,
  api_key           text not null,
  updated_at        timestamptz not null default now()
);

create table if not exists settings (
  id                text primary key,
  value             text
);

create table if not exists usage_events (
  id                text primary key,
  user_id           text,
  type              text not null,
  chars             integer,
  source_lang       text,
  target_lang       text,
  room              text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_usage_type_time on usage_events(type, created_at);
create index if not exists idx_usage_user_time on usage_events(user_id, created_at);

create table if not exists payment_transactions (
  id                text primary key,
  session_id        text unique not null,
  user_id           text not null,
  email             text not null,
  plan_id           text not null,
  amount            numeric not null,
  currency          text not null,
  status            text not null,
  payment_status    text not null,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index if not exists idx_txn_user on payment_transactions(user_id, updated_at desc);

create table if not exists tts_cache (
  id                text primary key,
  text              text not null,
  voice             text not null default 'alloy',
  created_at        timestamptz not null default now()
);
