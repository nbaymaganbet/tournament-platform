CREATE OR REPLACE FUNCTION private.schedule_newly_ready_match(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  m public.matches%rowtype;
  t public.tournaments%rowtype;
  chosen_mat uuid;
  next_order integer;
begin
  select * into m from public.matches where id=p_match_id;
  if not found or m.status='completed' or m.participant_a_id is null or m.participant_b_id is null then return; end if;
  if exists(select 1 from public.match_schedule where match_id=m.id) then return; end if;

  select * into t from public.tournaments where id=m.tournament_id;
  if t.schedule_start_time is null or t.date is null then return; end if;

  select coalesce(max(scheduled_order),0)+1 into next_order
  from public.match_schedule ms
  join public.matches mm on mm.id=ms.match_id
  where mm.tournament_id=m.tournament_id;

  select ma.id into chosen_mat
  from public.mats ma
  where ma.tournament_id=m.tournament_id and ma.is_active=true
  order by (
    select count(*)
    from public.match_schedule ms2
    where ms2.mat_id=ma.id
  ), ma.sort_order, ma.id
  limit 1;

  if chosen_mat is null then return; end if;

  insert into public.match_schedule(match_id,mat_id,scheduled_order)
  values(m.id,chosen_mat,next_order)
  on conflict(match_id) do nothing;

  perform public.refresh_tournament_schedule_times(m.tournament_id);
end;
$function$


CREATE OR REPLACE FUNCTION private.schedule_ready_matches_after_match_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if new.winner_id is not null or new.status='completed' then
    if new.next_match_id is not null then
      perform private.schedule_newly_ready_match(new.next_match_id);
    end if;
    if new.loser_next_match_id is not null then
      perform private.schedule_newly_ready_match(new.loser_next_match_id);
    end if;
  end if;
  return new;
end;
$function$
;

drop trigger if exists schedule_ready_matches_after_match_update on public.matches;
create trigger schedule_ready_matches_after_match_update after update of winner_id,status,participant_a_id,participant_b_id on public.matches for each row when (new.winner_id is not null or new.status='completed') execute function private.schedule_ready_matches_after_match_update();
