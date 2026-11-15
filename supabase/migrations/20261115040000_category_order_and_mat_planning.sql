alter table public.tournaments
  add column schedule_category_order uuid[] not null default '{}';

create function private.plan_tournament_schedule(
  p_tournament_id uuid, p_younger_first boolean, p_category_order uuid[]
) returns integer language plpgsql security definer set search_path='' as $$
declare
  tournament public.tournaments%rowtype;
  choice record;
  next_order integer;
  planned_count integer := 0;
  gap interval;
  rest interval;
begin
  if (select auth.uid()) is null or not private.has_tournament_permission(p_tournament_id,'schedule') then
    raise exception 'Not authorized';
  end if;
  select * into strict tournament from public.tournaments where id=p_tournament_id for update;
  if not exists(select 1 from public.mats where tournament_id=p_tournament_id and is_active) then
    raise exception 'At least one active zone is required';
  end if;
  if p_category_order is not null then
    if cardinality(p_category_order) <> (
      select count(*) from public.categories where tournament_id=p_tournament_id and id=any(p_category_order)
    ) then
      raise exception 'Invalid category order';
    end if;
    update public.tournaments set schedule_category_order=p_category_order where id=p_tournament_id;
    tournament.schedule_category_order := p_category_order;
  end if;
  gap := make_interval(mins=>tournament.bout_interval_minutes);
  rest := make_interval(mins=>tournament.athlete_rest_minutes);

  -- Materialize the tournament's schedule under the same lock used to start a bout.
  create temporary table tournament_schedule_plan on commit drop as
  select m.id,
         array_remove(array[m.participant_a_id,m.participant_b_id],null) as athletes,
         array(select feeder.id from public.matches feeder where feeder.tournament_id=p_tournament_id
           and feeder.status<>'cancelled' and m.id in (feeder.next_match_id,feeder.loser_next_match_id)) as feeders,
         preferred.id as preferred_mat,
         private.division_start(tournament,c.division) as division_start,
         array_position(tournament.schedule_category_order,c.id) as category_order,
         c.age_min,c.age_max,ranked.stage_order,
         make_interval(secs=>public.match_duration_seconds(m.id)) as duration,
         ms.mat_id,
         case when m.status='completed' then m.completed_at
              when m.status='running' then greatest(m.started_at+make_interval(secs=>public.match_duration_seconds(m.id)),now())
         end as finish_at,
         null::timestamptz as start_at,
         null::integer as planned_order
  from public.matches m
  join public.categories c on c.id=m.category_id
  left join public.match_schedule ms on ms.match_id=m.id
  left join public.mats preferred on preferred.id=c.preferred_mat_id
    and preferred.tournament_id=p_tournament_id and preferred.is_active
  left join private.tournament_stage_order(p_tournament_id) ranked on ranked.match_id=m.id
    and m.started_at is null and m.completed_at is null and m.winner_id is null
  where m.tournament_id=p_tournament_id and (ranked.match_id is not null or m.status in ('completed','running'));

  if exists(select 1 from pg_temp.tournament_schedule_plan where stage_order is not null and division_start is null) then
    raise exception 'Set tournament date and schedule start time first';
  end if;
  select coalesce(max(s.scheduled_order),0) into next_order from public.match_schedule s
    join public.matches m on m.id=s.match_id where m.tournament_id=p_tournament_id;

  loop
    with pending as materialized (
      select p.*,
             greatest(p.division_start,now(),(
               select max(previous.finish_at)+rest
               from pg_temp.tournament_schedule_plan previous
               where previous.id=any(p.feeders) or previous.athletes && p.athletes
             )) as ready_at
      from pg_temp.tournament_schedule_plan p
      where p.stage_order is not null and p.start_at is null
        and p.division_start=(select min(division_start) from pg_temp.tournament_schedule_plan
          where stage_order is not null and start_at is null)
        and not exists(select 1 from pg_temp.tournament_schedule_plan feeder
          where feeder.id=any(p.feeders) and feeder.stage_order is not null and feeder.start_at is null)
    ), zones as (
      select mat.id,mat.sort_order,max(bout.finish_at)+gap as free_at
      from public.mats mat
      left join pg_temp.tournament_schedule_plan bout on bout.mat_id=mat.id
      where mat.tournament_id=p_tournament_id and mat.is_active
      group by mat.id,mat.sort_order
    ), candidates as materialized (
      select p.*,z.id as zone_id,z.sort_order,greatest(p.ready_at,z.free_at) as starts
      from pending p join zones z on p.preferred_mat is null or p.preferred_mat=z.id
    ), earliest as (
      select * from candidates where starts=(select min(starts) from candidates)
    )
    select candidate.* into choice
    from earliest candidate
    order by
      -- Prefer a first bout that leaves a second independent pair at the same time.
      (cardinality(candidate.athletes)=2 and exists(select 1 from earliest other
        where other.zone_id<>candidate.zone_id and other.id<>candidate.id
          and cardinality(other.athletes)=2 and not (other.athletes && candidate.athletes))) desc,
      candidate.category_order nulls last,
      case when p_younger_first then candidate.age_min end nulls last,
      case when p_younger_first then candidate.age_max end nulls last,
      candidate.stage_order,candidate.sort_order,candidate.zone_id
    limit 1;
    exit when not found;

    next_order := next_order+1;
    planned_count := planned_count+1;
    update pg_temp.tournament_schedule_plan
      set mat_id=choice.zone_id,start_at=choice.starts,finish_at=choice.starts+choice.duration,planned_order=next_order
      where id=choice.id;
  end loop;

  if exists(select 1 from pg_temp.tournament_schedule_plan where stage_order is not null and start_at is null) then
    raise exception 'Schedule order conflicts with bracket dependencies';
  end if;
  insert into public.match_schedule(match_id,mat_id,scheduled_order,approximate_time)
    select id,mat_id,planned_order,start_at from pg_temp.tournament_schedule_plan where start_at is not null
    on conflict(match_id) do update set mat_id=excluded.mat_id,scheduled_order=excluded.scheduled_order,
      approximate_time=excluded.approximate_time,updated_at=now();
  drop table pg_temp.tournament_schedule_plan;
  return planned_count;
end;
$$;

create function public.plan_tournament_schedule(p_tournament_id uuid, p_younger_first boolean, p_category_order uuid[])
returns integer language sql set search_path='' as $$
  select private.plan_tournament_schedule(p_tournament_id,p_younger_first,p_category_order);
$$;

revoke all on function public.plan_tournament_schedule(uuid,boolean,uuid[]),
  private.plan_tournament_schedule(uuid,boolean,uuid[]) from public,anon;
grant execute on function public.plan_tournament_schedule(uuid,boolean,uuid[]),
  private.plan_tournament_schedule(uuid,boolean,uuid[]) to authenticated;
