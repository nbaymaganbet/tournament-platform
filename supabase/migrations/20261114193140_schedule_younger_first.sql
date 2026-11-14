create function private.generate_tournament_schedule_younger_first(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare
  added integer;
begin
  if (select auth.uid()) is null or not private.has_tournament_permission(p_tournament_id,'schedule') then
    raise exception 'Not authorized';
  end if;

  perform 1 from public.tournaments where id=p_tournament_id for update;
  added := public.generate_tournament_schedule(p_tournament_id);

  with movable as materialized (
    select ms.id, ms.scheduled_order, ranked.stage_order, c.age_min, c.age_max,
           private.division_start(t,c.division) as division_start
    from private.tournament_stage_order(p_tournament_id) ranked
    join public.matches m on m.id=ranked.match_id
    join public.categories c on c.id=m.category_id
    join public.tournaments t on t.id=m.tournament_id
    join public.match_schedule ms on ms.match_id=m.id
    where m.started_at is null and m.completed_at is null and m.winner_id is null
  ), available_orders as (
    select scheduled_order, row_number() over (order by scheduled_order,id) as slot
    from movable
  ), desired_orders as (
    select id, row_number() over (
      order by division_start,age_min nulls last,age_max nulls last,stage_order
    ) as slot
    from movable
  )
  update public.match_schedule ms
  set scheduled_order=a.scheduled_order, updated_at=now()
  from desired_orders d join available_orders a using(slot)
  where ms.id=d.id and ms.scheduled_order is distinct from a.scheduled_order;

  perform public.refresh_tournament_schedule_times(p_tournament_id);
  return added;
end;
$$;

create function public.generate_tournament_schedule_younger_first(p_tournament_id uuid)
returns integer language sql set search_path='' as $$
  select private.generate_tournament_schedule_younger_first(p_tournament_id);
$$;

revoke all on function public.generate_tournament_schedule_younger_first(uuid),
  private.generate_tournament_schedule_younger_first(uuid) from public,anon;
grant execute on function public.generate_tournament_schedule_younger_first(uuid),
  private.generate_tournament_schedule_younger_first(uuid) to authenticated;
