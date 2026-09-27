-- Refresh one unstarted category when its confirmed, paid, weighed-in roster changes.
-- Keep the relative order and zone of every other already scheduled fight.
create or replace function public.refresh_unstarted_category_bracket(p_category_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  tournament_uuid uuid;
  previous_bracket uuid;
  replacement uuid;
  first_order integer;
  previous_zone uuid;
  chosen_zone uuid;
  eligible_count integer;
  scheduled_count integer;
  new_ready_count integer;
begin
  select c.tournament_id into tournament_uuid from public.categories c where c.id=p_category_id;
  if tournament_uuid is null or not private.has_tournament_permission(tournament_uuid,'brackets') then
    raise exception 'Not authorized';
  end if;

  -- Serialize concurrent bracket and schedule updates for the tournament.
  perform 1 from public.tournaments t where t.id=tournament_uuid for update;
  select b.id into previous_bracket from public.brackets b where b.category_id=p_category_id for update;
  if previous_bracket is null then raise exception 'Bracket not found'; end if;
  perform 1 from public.matches m where m.bracket_id=previous_bracket order by m.id for update;
  if exists (select 1 from public.matches m where m.bracket_id=previous_bracket
      and (m.status not in ('scheduled','ready') or m.winner_id is not null or m.completed_at is not null))
    or exists (select 1 from public.results r where r.category_id=p_category_id) then
    raise exception 'Bracket can only be refreshed before fights start';
  end if;

  select count(*) into eligible_count from public.category_participants cp
    join public.registrations rg on rg.participant_id=cp.participant_id and rg.tournament_id=tournament_uuid
    where cp.category_id=p_category_id and cp.is_active and cp.weigh_in_status='in_weight'
      and rg.status='confirmed' and rg.payment_status='paid';
  if eligible_count<2 then raise exception 'At least two eligible athletes are required'; end if;

  select min(ms.scheduled_order) into first_order from public.match_schedule ms
    join public.matches m on m.id=ms.match_id where m.bracket_id=previous_bracket;
  select ms.mat_id into previous_zone from public.match_schedule ms
    join public.matches m on m.id=ms.match_id where m.bracket_id=previous_bracket
    order by ms.scheduled_order,ms.id limit 1;
  select count(*) into scheduled_count from public.match_schedule ms
    join public.matches m on m.id=ms.match_id where m.tournament_id=tournament_uuid;
  if scheduled_count>0 and not private.has_tournament_permission(tournament_uuid,'schedule') then
    raise exception 'Schedule permission is required to refresh scheduled fights';
  end if;

  -- No change to a bracket whose roster is already up to date.
  if not exists (
      select 1 from public.category_participants cp
      join public.registrations rg on rg.participant_id=cp.participant_id and rg.tournament_id=tournament_uuid
      where cp.category_id=p_category_id and cp.is_active and cp.weigh_in_status='in_weight'
        and rg.status='confirmed' and rg.payment_status='paid'
        and not exists (select 1 from public.matches m where m.bracket_id=previous_bracket
          and (m.participant_a_id=cp.participant_id or m.participant_b_id=cp.participant_id))
    ) and not exists (
      select 1 from public.matches m where m.bracket_id=previous_bracket
        and (m.participant_a_id is not null or m.participant_b_id is not null)
        and ( (m.participant_a_id is not null and not exists (
          select 1 from public.category_participants cp join public.registrations rg
            on rg.participant_id=cp.participant_id and rg.tournament_id=tournament_uuid
          where cp.category_id=p_category_id and cp.participant_id=m.participant_a_id
            and cp.is_active and cp.weigh_in_status='in_weight'
            and rg.status='confirmed' and rg.payment_status='paid'))
          or (m.participant_b_id is not null and not exists (
          select 1 from public.category_participants cp join public.registrations rg
            on rg.participant_id=cp.participant_id and rg.tournament_id=tournament_uuid
          where cp.category_id=p_category_id and cp.participant_id=m.participant_b_id
            and cp.is_active and cp.weigh_in_status='in_weight'
            and rg.status='confirmed' and rg.payment_status='paid')))
    ) then raise exception 'Category bracket is already up to date'; end if;

  delete from public.brackets where id=previous_bracket;
  replacement:=public.generate_single_elimination_bracket(p_category_id);

  if scheduled_count>0 then
    if first_order is not null then
      select ma.id into chosen_zone from public.mats ma
      where ma.id=previous_zone and ma.tournament_id=tournament_uuid and ma.is_active;
      if chosen_zone is null then
        select ma.id into chosen_zone from public.categories c join public.mats ma on ma.id=c.preferred_mat_id
        where c.id=p_category_id and ma.is_active;
      end if;
      if chosen_zone is null then
        select ma.id into chosen_zone from public.mats ma where ma.tournament_id=tournament_uuid and ma.is_active
          order by ma.sort_order,ma.id limit 1;
      end if;
      if chosen_zone is null then raise exception 'At least one active zone is required'; end if;

      insert into public.match_schedule(match_id,mat_id,scheduled_order)
      select m.id,chosen_zone,first_order from public.matches m
      where m.bracket_id=replacement and m.participant_a_id is not null and m.participant_b_id is not null;
      get diagnostics new_ready_count = row_count;
      if new_ready_count=0 then raise exception 'New bracket contains no ready fights'; end if;

      with ordered as (
        select ms.id,row_number() over (
          order by ms.scheduled_order,
            case when m.bracket_id=replacement then 0 else 1 end,
            m.match_number,ms.id
        )::integer as new_order
        from public.match_schedule ms join public.matches m on m.id=ms.match_id
        where m.tournament_id=tournament_uuid
      )
      update public.match_schedule ms set scheduled_order=ordered.new_order,updated_at=now()
        from ordered where ms.id=ordered.id;
      perform public.refresh_tournament_schedule_times(tournament_uuid);
    else
      -- Another category has a schedule, but this category had none yet.
      perform public.generate_tournament_schedule(tournament_uuid);
    end if;
  end if;
  return replacement;
end;
$function$;

revoke all on function public.refresh_unstarted_category_bracket(uuid) from public,anon;
grant execute on function public.refresh_unstarted_category_bracket(uuid) to authenticated;
