-- Outlook integration: run once in the Supabase SQL editor.
-- Token store: one row, readable only by the edge function (service role). No RLS policies on purpose.
create table if not exists public.ms_connection (
  id int primary key default 1 check (id = 1),
  account text,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  last_sync timestamptz,
  last_sync_result text,
  pending_state text,
  pending_expires timestamptz,
  updated_at timestamptz default now()
);
alter table public.ms_connection enable row level security;

-- Email history shown on candidate and company records
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  graph_id text unique,
  internet_message_id text,
  conversation_id text,
  direction text check (direction in ('sent','received')),
  from_email text,
  from_name text,
  to_emails text[],
  subject text,
  preview text,
  sent_at timestamptz,
  web_link text,
  has_attachments boolean default false,
  candidate_ids uuid[] default '{}',
  company_ids uuid[] default '{}',
  created_at timestamptz default now()
);
alter table public.emails enable row level security;
drop policy if exists "signed-in users read emails" on public.emails;
create policy "signed-in users read emails" on public.emails for select to authenticated using (true);
create index if not exists emails_cand_idx on public.emails using gin (candidate_ids);
create index if not exists emails_co_idx on public.emails using gin (company_ids);
create index if not exists emails_sent_idx on public.emails (sent_at desc);

-- Safe status for the CRM (never exposes tokens)
create or replace function public.outlook_status()
returns json language sql security definer set search_path = public as $$
  select coalesce((select json_build_object('connected', refresh_token is not null, 'account', account,
    'last_sync', last_sync, 'last_sync_result', last_sync_result) from ms_connection where id = 1),
    json_build_object('connected', false));
$$;
revoke all on function public.outlook_status() from public, anon;
grant execute on function public.outlook_status() to authenticated;

-- Undo:
-- drop function if exists public.outlook_status(); drop table if exists public.emails; drop table if exists public.ms_connection;
