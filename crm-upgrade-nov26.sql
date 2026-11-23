-- ════════════════════════════════════════════════════════════════════════
-- recruitCRM upgrade — November 2026
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run. Takes a backup of the columns it changes first.
-- ════════════════════════════════════════════════════════════════════════

-- 0. Backup of everything this script touches (delete the table when happy)
create table if not exists public.candidates_backup_nov26 as
  select id, role, notes, status from public.candidates;

-- 1. New column: current employer
alter table public.candidates add column if not exists current_employer text;

-- Words that mean a "company" value is really a job title (a LinkedIn
-- import glitch) — those are left blank rather than saved as an employer.
create or replace function public.gaia_looks_like_title(t text) returns boolean
language sql immutable as $$
  select coalesce(t,'') ~* '\m(director|manager|consultant|ecologist|engineer|officer|scientist|specialist|lead|head|analyst|advis[eo]r|surveyor|planner|graduate|assistant|technician|coordinator|ornithologist|hydrologist|modeller)\M'
$$;

-- Splits "Ecologist at WSP | CIEEM" into {Ecologist, WSP}. Returns null when
-- the title is not in that form (e.g. "Working at the intersection of…").
create or replace function public.gaia_split_role(r text) returns text[]
language plpgsql immutable as $$
declare m text[]; emp text;
begin
  m := regexp_match(coalesce(r,''), '^(.{3,80}?)\s+(?:[Aa][Tt]|@)\s+(.+)$');
  if m is null then return null; end if;
  emp := btrim(split_part(regexp_replace(m[2], '[·•,]', '|', 'g'), '|', 1));
  if emp !~ '^[A-Z0-9]' or length(emp) > 60 or length(emp) < 2 then return null; end if;
  return array[btrim(m[1]), emp];
end $$;

-- 2. Fill current employer for NEW candidates automatically (any import:
--    LinkedIn extension, CSV, website form). Reads "Company: X" from the
--    notes, or "Ecologist at WSP" style job titles (and tidies the title).
create or replace function public.gaia_fill_employer() returns trigger
language plpgsql as $$
declare emp text; m text[];
begin
  if new.current_employer is null or btrim(new.current_employer) = '' then
    emp := btrim(substring(new.notes from 'Company:[ \t]*([^\r\n]+)'));
    if emp is not null and emp <> '' and not public.gaia_looks_like_title(emp) then
      new.current_employer := left(emp, 120);
    end if;
  end if;
  m := public.gaia_split_role(new.role);
  if m is not null then
    if new.current_employer is null or btrim(new.current_employer) = '' then
      new.current_employer := m[2];
    end if;
    new.role := m[1];
  end if;
  return new;
end $$;

drop trigger if exists gaia_fill_employer on public.candidates;
create trigger gaia_fill_employer before insert on public.candidates
  for each row execute function public.gaia_fill_employer();

-- 3. One-off: fill current employer for existing candidates from their notes
update public.candidates c
set current_employer = left(x.emp, 120)
from (
  select id, btrim(substring(notes from 'Company:[ \t]*([^\r\n]+)')) as emp
  from public.candidates
) x
where c.id = x.id
  and (c.current_employer is null or btrim(c.current_employer) = '')
  and x.emp is not null and x.emp <> ''
  and not public.gaia_looks_like_title(x.emp);

-- 4. One-off: split "Ecologist at WSP | CIEEM" style titles into role + employer
update public.candidates c
set current_employer = coalesce(nullif(btrim(c.current_employer),''), x.m[2]),
    role = x.m[1]
from (
  select id, public.gaia_split_role(role) as m
  from public.candidates where role is not null
) x
where c.id = x.id and x.m is not null;

-- 5. One-off: candidate status from the pipeline (the app keeps it in step from now on)
with ranked as (
  select candidate_id,
         max(case stage when 'Placed' then 5 when 'Offer' then 4
                        when 'Interview' then 3 when '2nd Interview' then 3
                        when 'Applied' then 2 when 'Screening' then 2 else 0 end) as r
  from public.job_candidates where candidate_id is not null
  group by candidate_id
)
update public.candidates c
set status = case ranked.r when 5 then 'Placed' when 4 then 'Offer stage'
                           when 3 then 'Interview' when 2 then 'Pipeline' end
from ranked
where c.id = ranked.candidate_id and ranked.r > 0
  and c.status is distinct from 'Placed';

update public.candidates set status = 'Placed'
where id in (select candidate_id from public.placements where candidate_id is not null);

-- 6. Index so searching by employer stays quick
create index if not exists candidates_current_employer_idx
  on public.candidates (lower(current_employer));

-- Check the result:
select count(*) filter (where current_employer is not null) as with_employer,
       count(*) filter (where status = 'Placed')    as placed,
       count(*) filter (where status in ('Pipeline','Interview','Offer stage')) as in_process,
       count(*) as total
from public.candidates;

-- UNDO (only if something looks wrong):
--   update public.candidates c set role=b.role, notes=b.notes, status=b.status, current_employer=null
--   from public.candidates_backup_nov26 b where c.id=b.id;
--   drop trigger if exists gaia_fill_employer on public.candidates;
