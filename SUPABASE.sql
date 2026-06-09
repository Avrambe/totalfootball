-- Total Football — leaderboard backend (Phase 9)
-- Run this whole file once in your Supabase project's SQL editor.
-- It creates the scores table, two RPCs, and the anon read policy. Safe to re-run.
--
-- After running:
--   Project Settings → API → copy the Project URL and the "anon"/publishable key,
--   and paste them into app/src/leaderboard/board.js (SB_URL, SB_KEY).

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.scores (
  id            bigint generated always as identity primary key,
  config        text        not null,   -- "<era>-<mode>", e.g. "alltime-classic"
  name          text        not null,
  elo           int         not null,
  tier          text        not null,
  grade         text,                    -- null for non-champions
  goals_for     int         not null default 0,
  goals_against int         not null default 0,
  diff          int         not null default 0,
  squad         jsonb       not null default '{}'::jsonb,
  client_key    text,                    -- idempotency: one post per run
  created_at    timestamptz not null default now()
);

-- Idempotency + fast leaderboard reads.
create unique index if not exists scores_client_key_key on public.scores (client_key) where client_key is not null;
create index if not exists scores_config_elo_idx on public.scores (config, elo desc, created_at);

-- ── Row-level security: anon may READ; writes only via the RPC below ──────────
alter table public.scores enable row level security;

drop policy if exists "scores anon read" on public.scores;
create policy "scores anon read" on public.scores for select to anon using (true);
-- (No INSERT/UPDATE/DELETE policy → the anon key cannot write directly.)

-- ── submit_score: the only write path (SECURITY DEFINER bypasses RLS) ─────────
create or replace function public.submit_score(
  p_config text, p_name text, p_elo int, p_tier text, p_grade text,
  p_gf int, p_ga int, p_diff int, p_squad jsonb, p_client_key text
) returns public.scores
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_row  public.scores;
begin
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  v_name := left(coalesce(v_name, 'Anon'), 24);

  insert into public.scores (config, name, elo, tier, grade, goals_for, goals_against, diff, squad, client_key)
  values (p_config, v_name, p_elo, p_tier, nullif(p_grade, ''), coalesce(p_gf,0), coalesce(p_ga,0), coalesce(p_diff,0), coalesce(p_squad, '{}'::jsonb), p_client_key)
  on conflict (client_key) where client_key is not null do nothing
  returning * into v_row;

  -- If the run was already posted (same client_key), return the existing row.
  if v_row.id is null and p_client_key is not null then
    select * into v_row from public.scores where client_key = p_client_key;
  end if;

  return v_row;
end;
$$;

-- ── real_pct: "top X%" for a config, only once it has ≥18 scores (else null) ──
create or replace function public.real_pct(p_config text, p_elo int)
returns table(pct int)
language sql security definer set search_path = public as $$
  select case
    when count(*) < 18 then null
    else round(100.0 * count(*) filter (where elo > p_elo) / count(*))::int
  end as pct
  from public.scores
  where config = p_config;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
grant execute on function public.submit_score(text,text,int,text,text,int,int,int,jsonb,text) to anon;
grant execute on function public.real_pct(text,int) to anon;
