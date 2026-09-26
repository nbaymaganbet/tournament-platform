-- Keep zone management in the zones panel, and save only the start time here.
create or replace function public.save_tournament_schedule_start_time(p_tournament_id uuid,p_start_time time without time zone)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if not private.has_tournament_permission(p_tournament_id,'schedule') then raise exception 'Not authorized'; end if;
  if p_start_time is null then raise exception 'Set schedule start time first'; end if;
  update public.tournaments set schedule_start_time=p_start_time,updated_at=now() where id=p_tournament_id;
  if not found then raise exception 'Tournament not found'; end if;
  if exists(select 1 from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id) then
    perform public.refresh_tournament_schedule_times(p_tournament_id);
  end if;
end;
$function$;
revoke all on function public.save_tournament_schedule_start_time(uuid,time without time zone) from public,anon;
grant execute on function public.save_tournament_schedule_start_time(uuid,time without time zone) to authenticated;

-- Old open tabs may still call this RPC; make it safe for manually managed zones.
create or replace function public.configure_tournament_schedule(p_tournament_id uuid,p_zone_count integer,p_start_time time without time zone)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform public.save_tournament_schedule_start_time(p_tournament_id,p_start_time);
end;
$function$;

-- Add only unscheduled ready fights. Never erase a manual order or zone assignment.
create or replace function public.generate_tournament_schedule(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path to ''
as $function$
declare
  event_date date;
  start_at time;
  next_order integer;
  chosen_zone uuid;
  rec record;
  added integer:=0;
  inserted integer;
begin
  if not private.has_tournament_permission(p_tournament_id,'schedule') then raise exception 'Not authorized'; end if;
  select t.date,t.schedule_start_time into event_date,start_at
  from public.tournaments t where t.id=p_tournament_id for update;
  if event_date is null or start_at is null then raise exception 'Set tournament date and schedule start time first'; end if;
  if not exists(select 1 from public.mats where tournament_id=p_tournament_id and is_active=true) then
    raise exception 'At least one active zone is required';
  end if;
  select coalesce(max(ms.scheduled_order),0) into next_order
  from public.match_schedule ms join public.matches m on m.id=ms.match_id
  where m.tournament_id=p_tournament_id;

  for rec in
    select m.id
    from public.matches m
    left join (
      select category_id,count(*) as participant_count from public.category_participants
      where is_active=true and weigh_in_status='in_weight' group by category_id
    ) cc on cc.category_id=m.category_id
    where m.tournament_id=p_tournament_id and m.status<>'completed'
      and m.participant_a_id is not null and m.participant_b_id is not null
      and not exists(select 1 from public.match_schedule ms where ms.match_id=m.id)
    order by coalesce(cc.participant_count,0) desc,m.category_id,m.round_number,m.match_number,m.id
  loop
    select ma.id into chosen_zone
    from public.mats ma
    where ma.tournament_id=p_tournament_id and ma.is_active=true
    order by (
      select count(*) from public.match_schedule ms
      join public.matches scheduled on scheduled.id=ms.match_id
      where ms.mat_id=ma.id and scheduled.tournament_id=p_tournament_id and scheduled.status<>'completed'
    ),ma.sort_order,ma.id limit 1;
    next_order:=next_order+1;
    insert into public.match_schedule(match_id,mat_id,scheduled_order)
    values(rec.id,chosen_zone,next_order) on conflict(match_id) do nothing;
    get diagnostics inserted = row_count;
    added:=added+inserted;
  end loop;
  perform public.refresh_tournament_schedule_times(p_tournament_id);
  return added;
end;
$function$;

-- Tournament start times are entered as local Astana times, while the database runs in UTC.
do $migration$
declare
  definition text;
  old_time text := 'base_time:=(event_date+start_at)::timestamptz;';
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='refresh_tournament_schedule_times'
    and pg_get_function_identity_arguments(p.oid)='p_tournament_id uuid';
  if definition is null or position(old_time in definition)=0
    or position('private.has_tournament_permission(p_tournament_id,''schedule'')' in definition)=0 then
    raise exception 'Unexpected schedule time function';
  end if;
  execute replace(definition,old_time,
    'base_time:=(event_date+start_at) at time zone ''Asia/Almaty'';');
end;
$migration$;
