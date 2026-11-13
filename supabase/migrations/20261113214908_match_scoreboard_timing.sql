create function private.save_match_scoreboard_timing(
  p_match_id uuid, p_round_seconds integer, p_round_count integer,
  p_rest_seconds integer, p_remaining_seconds integer, p_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.matches%rowtype;
  board public.match_scoreboards%rowtype;
  secs integer;
  rounds integer;
  rest integer;
  saved_at timestamptz;
  remaining integer;
  was_running boolean;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or auth.uid() is null or not private.has_tournament_permission(m.tournament_id, 'running') then
    raise exception 'Not authorized';
  end if;
  perform 1 from public.tournaments where id = m.tournament_id for update;
  select * into m from public.matches where id = p_match_id for update;
  if not found or m.status <> 'running' then raise exception 'Match must be running'; end if;

  if p_round_seconds is null or p_round_seconds not between 1 and 7200
    or p_round_count is null or p_round_count not between 1 and 20
    or p_rest_seconds is null or p_rest_seconds not between 0 and 3600
    or (p_remaining_seconds is not null and p_remaining_seconds not between 0 and 7200) then
    raise exception 'Invalid scoreboard timing';
  end if;

  select coalesce(c.round_seconds, t.bout_minutes * 60),
    coalesce(c.round_count, 1), coalesce(c.round_rest_seconds, 0)
  into secs, rounds, rest
  from public.categories c join public.tournaments t on t.id = c.tournament_id
  where c.id = m.category_id;

  insert into public.match_scoreboards(match_id, tournament_id, round_seconds, round_count, rest_seconds, remaining_ms)
  values(m.id, m.tournament_id, secs, rounds, rest, secs * 1000)
  on conflict (match_id) do nothing;

  select * into board from public.match_scoreboards where match_id = m.id for update;
  if board.version is distinct from p_version then raise exception 'Scoreboard changed. Refresh and try again.'; end if;
  if p_round_count < board.current_round then raise exception 'Round count cannot be less than the current round'; end if;

  saved_at := clock_timestamp();
  remaining := greatest(0, board.remaining_ms - coalesce(
    greatest(0, floor(extract(epoch from (saved_at - board.timer_started_at)) * 1000)), 0
  ))::integer;
  was_running := board.timer_started_at is not null and remaining > 0;
  if p_remaining_seconds is not null then
    remaining := p_remaining_seconds * 1000;
  elsif board.timer_started_at is null then
    if not board.is_rest and remaining = board.round_seconds * 1000 then
      remaining := p_round_seconds * 1000;
    elsif board.is_rest and remaining = board.rest_seconds * 1000 then
      remaining := p_rest_seconds * 1000;
    end if;
  end if;

  update public.match_scoreboards set
    round_seconds = p_round_seconds, round_count = p_round_count, rest_seconds = p_rest_seconds,
    remaining_ms = remaining, timer_started_at = case when was_running and remaining > 0 then saved_at end,
    version = version + 1, updated_at = saved_at
  where match_id = m.id returning * into board;

  return to_jsonb(board) || jsonb_build_object('server_now', clock_timestamp());
end;
$$;

create function public.save_match_scoreboard_timing(
  p_match_id uuid, p_round_seconds integer, p_round_count integer,
  p_rest_seconds integer, p_remaining_seconds integer, p_version integer
) returns jsonb language sql set search_path = '' as $$
  select private.save_match_scoreboard_timing(
    p_match_id, p_round_seconds, p_round_count, p_rest_seconds, p_remaining_seconds, p_version
  );
$$;

revoke all on function private.save_match_scoreboard_timing(uuid,integer,integer,integer,integer,integer),
  public.save_match_scoreboard_timing(uuid,integer,integer,integer,integer,integer) from public, anon;
grant execute on function private.save_match_scoreboard_timing(uuid,integer,integer,integer,integer,integer),
  public.save_match_scoreboard_timing(uuid,integer,integer,integer,integer,integer) to authenticated;
