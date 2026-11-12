create function public.save_mat_categories(p_mat_id uuid,p_changes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare tid uuid; change record; current_mat uuid; slot record; chosen uuid;
begin
 select tournament_id into tid from public.mats where id=p_mat_id;
 if tid is null or not private.has_tournament_permission(tid,'schedule') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=tid for update;
 perform 1 from public.mats where id=p_mat_id and tournament_id=tid and is_active for update;
 if not found then raise exception 'Choose an active zone from this tournament';end if;

 for change in select * from jsonb_to_recordset(p_changes) as x(id uuid,assigned boolean,previous_mat_id uuid) loop
   select preferred_mat_id into current_mat from public.categories where id=change.id and tournament_id=tid for update;
   if not found or change.assigned is null then raise exception 'Invalid category selection';end if;
   if current_mat is distinct from change.previous_mat_id or (not change.assigned and current_mat is distinct from p_mat_id) then
     raise exception 'Category zone changed. Refresh and try again';
   end if;
   update public.categories set preferred_mat_id=case when change.assigned then p_mat_id end where id=change.id;
   for slot in select ms.id from public.match_schedule ms join public.matches m on m.id=ms.match_id
     where m.category_id=change.id and m.status in ('scheduled','ready') order by ms.scheduled_order
   loop
     chosen:=p_mat_id;
     if not change.assigned then
       select ma.id into chosen from public.mats ma where ma.tournament_id=tid and ma.is_active
       order by (select count(*) from public.match_schedule x join public.matches m on m.id=x.match_id
         where x.mat_id=ma.id and m.tournament_id=tid and m.status not in ('completed','cancelled') and x.id<>slot.id),ma.sort_order,ma.id limit 1;
     end if;
     update public.match_schedule set mat_id=chosen,updated_at=now() where id=slot.id and mat_id is distinct from chosen;
   end loop;
 end loop;

 if exists(select 1 from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=tid)
 then perform public.refresh_tournament_schedule_times(tid);end if;
end;
$$;
revoke all on function public.save_mat_categories(uuid,jsonb) from public,anon;
grant execute on function public.save_mat_categories(uuid,jsonb) to authenticated;

create function private.tournament_stage_order(p_tournament_id uuid)
returns table(match_id uuid,stage_order bigint)
language sql stable set search_path='' as $$
   with recursive event_matches as materialized (
     select m.* from public.matches m where m.tournament_id=p_tournament_id
   ), advancement(origin, target, distance, seen) as (
     select m.id,m.id,0,array[m.id] from event_matches m
     union all
     select a.origin,successor.id,a.distance+1,a.seen||successor.id
     from advancement a
     join event_matches current_match on current_match.id=a.target
     join event_matches successor on successor.id in (current_match.next_match_id,current_match.loser_next_match_id)
     where not successor.id=any(a.seen)
   ), stages as (
     select origin,max(distance) distance from advancement group by origin
   ), bracket_rounds as (
     select bracket_id,max(round_number) last_round from event_matches group by bracket_id
   )
   select m.id,row_number() over (order by case when b.format='round_robin' then rounds.last_round-m.round_number else stages.distance end desc,
     (b.format<>'round_robin' and stages.distance=0 and exists(
       select 1 from event_matches feeder where feeder.loser_next_match_id=m.id
     )) desc,coalesce(cc.participant_count,0) desc,c.sort_order,m.category_id,m.match_number,m.id) from event_matches m
   join stages on stages.origin=m.id
   join public.brackets b on b.id=m.bracket_id
   join bracket_rounds rounds on rounds.bracket_id=b.id
   join public.categories c on c.id=m.category_id
   left join (select category_id,count(*) participant_count from public.category_participants
     where is_active and weigh_in_status='in_weight' group by category_id) cc on cc.category_id=m.category_id
   where m.status in ('scheduled','ready')
;
$$;
revoke all on function private.tournament_stage_order(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.generate_tournament_schedule(p_tournament_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare next_order integer; insert_order integer;
  chosen_zone uuid; rec record; added integer:=0; inserted integer;
begin
 if not (private.has_tournament_permission(p_tournament_id,'schedule') or private.has_tournament_permission(p_tournament_id,'running')) then raise exception 'Not authorized'; end if;
 perform 1 from public.tournaments t where t.id=p_tournament_id for update;
 if not exists(select 1 from public.mats where tournament_id=p_tournament_id and is_active) then raise exception 'At least one active zone is required'; end if;

 for rec in
   select m.id,m.category_id,c.preferred_mat_id from private.tournament_stage_order(p_tournament_id) ranked
   join public.matches m on m.id=ranked.match_id
   join public.categories c on c.id=m.category_id
   where not exists(select 1 from public.match_schedule ms where ms.match_id=m.id)
   order by ranked.stage_order
 loop
   chosen_zone:=null;
   if rec.preferred_mat_id is not null then
     select id into chosen_zone from public.mats where id=rec.preferred_mat_id and tournament_id=p_tournament_id and is_active;
   end if;
   if chosen_zone is null then
     select ma.id into chosen_zone from public.mats ma where ma.tournament_id=p_tournament_id and ma.is_active
     order by (select count(*) from public.match_schedule ms join public.matches scheduled on scheduled.id=ms.match_id
       where ms.mat_id=ma.id and scheduled.tournament_id=p_tournament_id and scheduled.status<>'completed'),ma.sort_order,ma.id limit 1;
   end if;

   select coalesce(max(ms.scheduled_order),0) into next_order from public.match_schedule ms
     join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id;
   insert_order:=next_order+1;
   insert into public.match_schedule(match_id,mat_id,scheduled_order)
     values(rec.id,chosen_zone,insert_order) on conflict(match_id) do nothing;
   get diagnostics inserted = row_count;
   added:=added+inserted;
 end loop;
 perform public.refresh_tournament_schedule_times(p_tournament_id);
 return added;
end;
$function$;

create function public.order_tournament_schedule_by_stage(p_tournament_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_tournament_permission(p_tournament_id,'schedule') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=p_tournament_id for update;
 with movable as materialized (
   select ms.id,ms.scheduled_order,ranked.stage_order
   from private.tournament_stage_order(p_tournament_id) ranked
   join public.match_schedule ms on ms.match_id=ranked.match_id
 ), available_orders as (
   select scheduled_order,row_number() over(order by scheduled_order,id) slot from movable
 ), desired_orders as (
   select id,row_number() over(order by stage_order) slot from movable
 )
 update public.match_schedule ms set scheduled_order=a.scheduled_order,updated_at=now()
 from desired_orders d join available_orders a using(slot)
 where ms.id=d.id and ms.scheduled_order is distinct from a.scheduled_order;
 perform public.refresh_tournament_schedule_times(p_tournament_id);
end;
$$;
revoke all on function public.order_tournament_schedule_by_stage(uuid) from public,anon;
grant execute on function public.order_tournament_schedule_by_stage(uuid) to authenticated;
