create function private.cancel_match_start(p_match_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  tournament_id uuid;
  bout public.matches%rowtype;
begin
  select m.tournament_id into tournament_id from public.matches m where m.id=p_match_id;
  if (select auth.uid()) is null or tournament_id is null
    or not private.has_tournament_permission(tournament_id,'running') then
    raise exception 'Not authorized';
  end if;

  perform 1 from public.tournaments t where t.id=tournament_id for update;
  select * into strict bout from public.matches m where m.id=p_match_id for update;
  if bout.status<>'running' or bout.winner_id is not null or bout.completed_at is not null then
    raise exception 'Only a running match without a result can be returned to the queue';
  end if;

  update public.matches set status='scheduled',started_at=null where id=bout.id;
  update public.match_scoreboards
    set score_a=0,score_b=0,current_round=1,is_rest=false,timer_started_at=null,
        remaining_ms=round_seconds*1000,version=version+1,updated_at=clock_timestamp()
    where match_id=bout.id;
  perform public.refresh_tournament_schedule_times(tournament_id);
end;
$$;

create function public.cancel_match_start(p_match_id uuid)
returns void language sql set search_path='' as $$
  select private.cancel_match_start(p_match_id);
$$;

revoke all on function private.cancel_match_start(uuid),public.cancel_match_start(uuid) from public,anon;
grant execute on function private.cancel_match_start(uuid),public.cancel_match_start(uuid) to authenticated;
