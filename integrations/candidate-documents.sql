-- Candidate documents: extra files per candidate (follow-up summaries etc.)
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.
create table if not exists public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  name text not null,
  file_path text not null,
  kind text default 'Other',
  doc_date timestamptz,
  source_key text,
  created_at timestamptz default now()
);
create index if not exists candidate_documents_cand_idx on public.candidate_documents(candidate_id);
create unique index if not exists candidate_documents_source_key on public.candidate_documents(source_key) where source_key is not null;
alter table public.candidate_documents enable row level security;
drop policy if exists "signed-in users manage candidate documents" on public.candidate_documents;
create policy "signed-in users manage candidate documents" on public.candidate_documents
  for all to authenticated using (true) with check (true);
