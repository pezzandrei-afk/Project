-- Migration: Add custom team colors, logos, real-time score event history, and multi-point scoring

-- 1. Add color and logo columns to public.games
alter table public.games 
  add column if not exists home_color text not null default '#2563eb',
  add column if not exists away_color text not null default '#dc2626',
  add column if not exists home_logo text not null default '🏀',
  add column if not exists away_logo text not null default '⚡';

-- 2. Create game_events table for score logs and play-by-play history
create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  event_type text not null, -- 'START', 'SCORE', 'STATUS', 'RESET', 'UNDO'
  team text check (team in ('home', 'away', null)),
  home_score integer not null,
  away_score integer not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- 3. Row level security for events (spectators and managers can view)
alter table public.game_events enable row level security;

drop policy if exists "Anyone can view game events" on public.game_events;
create policy "Anyone can view game events"
  on public.game_events
  for select
  to anon, authenticated
  using (true);

revoke all on table public.game_events from public, anon, authenticated;
grant select on table public.game_events to anon, authenticated;

-- 4. Enable Realtime for game_events
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_events'
  ) then
    alter publication supabase_realtime add table public.game_events;
  end if;
end;
$$;

-- 5. Updated create_game RPC supporting colors & logos and logging initial event
create or replace function public.create_game(
  p_code text,
  p_home_team text,
  p_away_team text,
  p_manager_key text,
  p_home_color text default '#2563eb',
  p_away_color text default '#dc2626',
  p_home_logo text default '🏀',
  p_away_logo text default '⚡'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_game_id uuid;
  v_home_color text;
  v_away_color text;
  v_home_logo text;
  v_away_logo text;
begin
  if p_code !~ '^[A-Z0-9]{10}$' then
    raise exception using errcode = '22023', message = 'Invalid game code';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(p_home_team)) not between 1 and 24
    or pg_catalog.char_length(pg_catalog.btrim(p_away_team)) not between 1 and 24 then
    raise exception using errcode = '22023', message = 'Team names must be between 1 and 24 characters';
  end if;

  if pg_catalog.char_length(p_manager_key) < 32 then
    raise exception using errcode = '22023', message = 'Invalid manager key';
  end if;

  v_home_color := coalesce(nullif(pg_catalog.btrim(p_home_color), ''), '#2563eb');
  v_away_color := coalesce(nullif(pg_catalog.btrim(p_away_color), ''), '#dc2626');
  v_home_logo := coalesce(nullif(pg_catalog.btrim(p_home_logo), ''), '🏀');
  v_away_logo := coalesce(nullif(pg_catalog.btrim(p_away_logo), ''), '⚡');

  insert into public.games (
    code,
    home_team,
    away_team,
    home_color,
    away_color,
    home_logo,
    away_logo
  )
  values (
    p_code,
    pg_catalog.btrim(p_home_team),
    pg_catalog.btrim(p_away_team),
    v_home_color,
    v_away_color,
    v_home_logo,
    v_away_logo
  )
  returning id into new_game_id;

  insert into public.game_manager_keys (game_id, key_hash)
  values (
    new_game_id,
    extensions.digest(pg_catalog.convert_to(p_manager_key, 'UTF8'), 'sha256')
  );

  insert into public.game_events (game_id, event_type, team, home_score, away_score, message)
  values (
    new_game_id,
    'START',
    null,
    0,
    0,
    'Game started: ' || pg_catalog.btrim(p_home_team) || ' vs ' || pg_catalog.btrim(p_away_team)
  );

  return p_code;
end;
$$;

-- 6. Updated update_game RPC supporting multi-point scores (+1, +2, +3) and undos (-1, -2, -3)
create or replace function public.update_game(
  p_code text,
  p_manager_key text,
  p_home_delta integer,
  p_away_delta integer,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key_hash bytea;
  target_game_id uuid;
  current_home_team text;
  current_away_team text;
  current_home_score integer;
  current_away_score integer;
  current_status text;
  new_home_score integer;
  new_away_score integer;
begin
  -- Allow multi-point scores (e.g. +1, +2, +3) and undos up to 10 points
  if p_home_delta not between -10 and 10 or p_away_delta not between -10 and 10 then
    raise exception using errcode = '22023', message = 'Score changes must be between -10 and 10 points';
  end if;

  if p_status not in ('LIVE', 'FINAL') then
    raise exception using errcode = '22023', message = 'Invalid game status';
  end if;

  select id, home_team, away_team, home_score, away_score, status
  into target_game_id, current_home_team, current_away_team, current_home_score, current_away_score, current_status
  from public.games
  where code = p_code
  for update;

  if target_game_id is null then
    raise exception using errcode = '42501', message = 'Invalid manager key';
  end if;

  select key_hash
  into stored_key_hash
  from public.game_manager_keys
  where game_manager_keys.game_id = target_game_id;

  if stored_key_hash is null
    or stored_key_hash <> extensions.digest(pg_catalog.convert_to(p_manager_key, 'UTF8'), 'sha256') then
    raise exception using errcode = '42501', message = 'Invalid manager key';
  end if;

  if current_status = 'FINAL' and (p_home_delta <> 0 or p_away_delta <> 0) then
    raise exception using errcode = '22023', message = 'Resume the game before changing the score';
  end if;

  new_home_score := current_home_score + p_home_delta;
  new_away_score := current_away_score + p_away_delta;

  if new_home_score < 0 or new_away_score < 0 then
    raise exception using errcode = '22023', message = 'Scores cannot be negative';
  end if;

  update public.games
  set home_score = new_home_score,
      away_score = new_away_score,
      status = p_status,
      updated_at = pg_catalog.now()
  where code = p_code;

  -- Log status change if applicable
  if current_status <> p_status then
    insert into public.game_events (game_id, event_type, team, home_score, away_score, message)
    values (
      target_game_id,
      'STATUS',
      null,
      new_home_score,
      new_away_score,
      case when p_status = 'FINAL'
        then 'Game marked as FINAL (' || new_home_score || ' - ' || new_away_score || ')'
        else 'Game resumed to LIVE'
      end
    );
  end if;

  -- Log home score change
  if p_home_delta <> 0 then
    insert into public.game_events (game_id, event_type, team, home_score, away_score, message)
    values (
      target_game_id,
      case when p_home_delta < 0 then 'UNDO' else 'SCORE' end,
      'home',
      new_home_score,
      new_away_score,
      case 
        when p_home_delta > 0 then '+' || p_home_delta || ' pts for ' || current_home_team || ' (' || new_home_score || ' - ' || new_away_score || ')'
        else 'Score adjusted by ' || p_home_delta || ' for ' || current_home_team || ' (' || new_home_score || ' - ' || new_away_score || ')'
      end
    );
  end if;

  -- Log away score change
  if p_away_delta <> 0 then
    insert into public.game_events (game_id, event_type, team, home_score, away_score, message)
    values (
      target_game_id,
      case when p_away_delta < 0 then 'UNDO' else 'SCORE' end,
      'away',
      new_home_score,
      new_away_score,
      case 
        when p_away_delta > 0 then '+' || p_away_delta || ' pts for ' || current_away_team || ' (' || new_home_score || ' - ' || new_away_score || ')'
        else 'Score adjusted by ' || p_away_delta || ' for ' || current_away_team || ' (' || new_home_score || ' - ' || new_away_score || ')'
      end
    );
  end if;

  return true;
end;
$$;

-- 7. Reset game score RPC
create or replace function public.reset_game_score(
  p_code text,
  p_manager_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key_hash bytea;
  target_game_id uuid;
begin
  select id
  into target_game_id
  from public.games
  where code = p_code
  for update;

  if target_game_id is null then
    raise exception using errcode = '42501', message = 'Invalid manager key';
  end if;

  select key_hash
  into stored_key_hash
  from public.game_manager_keys
  where game_manager_keys.game_id = target_game_id;

  if stored_key_hash is null
    or stored_key_hash <> extensions.digest(pg_catalog.convert_to(p_manager_key, 'UTF8'), 'sha256') then
    raise exception using errcode = '42501', message = 'Invalid manager key';
  end if;

  update public.games
  set home_score = 0,
      away_score = 0,
      updated_at = pg_catalog.now()
  where code = p_code;

  insert into public.game_events (game_id, event_type, team, home_score, away_score, message)
  values (
    target_game_id,
    'RESET',
    null,
    0,
    0,
    'Score reset to 0 - 0'
  );

  return true;
end;
$$;

-- 8. Update game teams/colors/logos RPC
create or replace function public.update_game_teams(
  p_code text,
  p_manager_key text,
  p_home_team text,
  p_away_team text,
  p_home_color text,
  p_away_color text,
  p_home_logo text,
  p_away_logo text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key_hash bytea;
  target_game_id uuid;
begin
  if pg_catalog.char_length(pg_catalog.btrim(p_home_team)) not between 1 and 24
    or pg_catalog.char_length(pg_catalog.btrim(p_away_team)) not between 1 and 24 then
    raise exception using errcode = '22023', message = 'Team names must be between 1 and 24 characters';
  end if;

  select id
  into target_game_id
  from public.games
  where code = p_code
  for update;

  if target_game_id is null then
    raise exception using errcode = '42501', message = 'Invalid manager key';
  end if;

  select key_hash
  into stored_key_hash
  from public.game_manager_keys
  where game_manager_keys.game_id = target_game_id;

  if stored_key_hash is null
    or stored_key_hash <> extensions.digest(pg_catalog.convert_to(p_manager_key, 'UTF8'), 'sha256') then
    raise exception using errcode = '42501', message = 'Invalid manager key';
  end if;

  update public.games
  set home_team = pg_catalog.btrim(p_home_team),
      away_team = pg_catalog.btrim(p_away_team),
      home_color = coalesce(nullif(pg_catalog.btrim(p_home_color), ''), '#2563eb'),
      away_color = coalesce(nullif(pg_catalog.btrim(p_away_color), ''), '#dc2626'),
      home_logo = coalesce(nullif(pg_catalog.btrim(p_home_logo), ''), '🏀'),
      away_logo = coalesce(nullif(pg_catalog.btrim(p_away_logo), ''), '⚡'),
      updated_at = pg_catalog.now()
  where code = p_code;

  return true;
end;
$$;

-- Permissions
grant execute on function public.create_game(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.reset_game_score(text, text) to anon, authenticated;
grant execute on function public.update_game_teams(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_game(text, text, integer, integer, text) to anon, authenticated;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

