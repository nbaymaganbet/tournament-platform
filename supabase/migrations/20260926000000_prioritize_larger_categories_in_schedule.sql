create or replace function public.generate_tournament_schedule(p_tournament_id uuid)
returns integer
language plpgsql
set search_path to 'public', 'private'
as $function$
declare
  active_mat_count integer;
  total integer:=0;
  rec record;
  idx integer:=0;
  chosen_mat uuid;
  event_date date;
  start_at time;
begin
  if not private.is_organizer_of_tournament(p_tournament_id) then raise exception 'Not authorized'; end if;
  select date,schedule_start_time into event_date,start_at from public.tournaments where id=p_tournament_id;
  if event_date is null or start_at is null then raise exception 'Set tournament date and schedule start time first'; end if;
  select count(*) into active_mat_count from public.mats where tournament_id=p_tournament_id and is_active=true;
  if active_mat_count=0 then raise exception 'At least one active zone is required'; end if;

  delete from public.match_schedule
  where match_id in(select id from public.matches where tournament_id=p_tournament_id and status<>'completed');

  for rec in
    select m.id
    from public.matches m
    left join (
      select category_id, count(*) as participant_count
      from public.category_participants
      where is_active=true and weigh_in_status='in_weight'
      group by category_id
    ) cc on cc.category_id=m.category_id
    where m.tournament_id=p_tournament_id
      and m.status<>'completed'
      and m.participant_a_id is not null
      and m.participant_b_id is not null
    order by coalesce(cc.participant_count,0) desc,
             m.category_id,
             m.round_number,
             m.match_number,
             m.id
  loop
    idx:=idx+1;
    select ma.id into chosen_mat
    from public.mats ma
    where ma.tournament_id=p_tournament_id and ma.is_active=true
    order by ma.sort_order,ma.id
    offset ((idx-1)%active_mat_count) limit 1;
    insert into public.match_schedule(match_id,mat_id,scheduled_order)
    values(rec.id,chosen_mat,idx);
    total:=total+1;
  end loop;

  perform public.refresh_tournament_schedule_times(p_tournament_id);
  return total;
end;
$function$;