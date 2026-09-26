-- Category zone preferences apply to future bouts and to pending scheduled bouts.
alter table public.categories add column if not exists preferred_mat_id uuid references public.mats(id) on delete set null;

-- A schedule-only assistant needs category names; a running-only assistant needs zone names.
create policy "team schedule read categories" on public.categories for select to authenticated
using (private.has_tournament_permission(tournament_id,'schedule'));
create policy "team running read mats" on public.mats for select to authenticated
using (private.has_tournament_permission(tournament_id,'running'));

create or replace function public.set_category_schedule_zone(p_category_id uuid,p_mat_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare tid uuid; rec record; chosen uuid;
begin
 select tournament_id into tid from public.categories where id=p_category_id;
 if tid is null then raise exception 'Category not found'; end if;
 if not private.has_tournament_permission(tid,'schedule') then raise exception 'Not authorized'; end if;
 perform 1 from public.tournaments where id=tid for update;
 if p_mat_id is not null and not exists(select 1 from public.mats where id=p_mat_id and tournament_id=tid and is_active) then
   raise exception 'Choose an active zone from this tournament';
 end if;
 update public.categories set preferred_mat_id=p_mat_id where id=p_category_id;
 for rec in select ms.id from public.match_schedule ms join public.matches m on m.id=ms.match_id
   where m.category_id=p_category_id and m.status<>'completed' order by ms.scheduled_order loop
   chosen:=p_mat_id;
   if chosen is null then
     select ma.id into chosen from public.mats ma where ma.tournament_id=tid and ma.is_active
     order by (select count(*) from public.match_schedule x join public.matches xm on xm.id=x.match_id
       where x.mat_id=ma.id and xm.tournament_id=tid and xm.status<>'completed' and x.id<>rec.id),ma.sort_order,ma.id limit 1;
   end if;
   update public.match_schedule set mat_id=chosen,updated_at=now() where id=rec.id;
 end loop;
 if exists(select 1 from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=tid)
 then perform public.refresh_tournament_schedule_times(tid); end if;
end;
$function$;
revoke all on function public.set_category_schedule_zone(uuid,uuid) from public,anon;
grant execute on function public.set_category_schedule_zone(uuid,uuid) to authenticated;

-- Running staff can refresh times when they reorder pending bouts.
do $migration$
declare definition text;
begin
 select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='refresh_tournament_schedule_times'
 and pg_get_function_identity_arguments(p.oid)='p_tournament_id uuid';
 if definition is null or position('if not private.has_tournament_permission(p_tournament_id,''schedule'')' in lower(definition))=0 then
   raise exception 'Unexpected schedule time function';
 end if;
 execute replace(definition,
   'not private.has_tournament_permission(p_tournament_id,''schedule'')',
   'not (private.has_tournament_permission(p_tournament_id,''schedule'') or private.has_tournament_permission(p_tournament_id,''running''))');
end;
$migration$;

-- Preserve all existing rows, orders, and completed bouts; only append ready bouts.
create or replace function public.generate_tournament_schedule(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path to '' as $function$
declare event_date date; start_at time; next_order integer; chosen_zone uuid; rec record; added integer:=0; inserted integer;
begin
 if not (private.has_tournament_permission(p_tournament_id,'schedule') or private.has_tournament_permission(p_tournament_id,'running')) then raise exception 'Not authorized'; end if;
 select t.date,t.schedule_start_time into event_date,start_at from public.tournaments t where t.id=p_tournament_id for update;
 if event_date is null or start_at is null then raise exception 'Set tournament date and schedule start time first'; end if;
 if not exists(select 1 from public.mats where tournament_id=p_tournament_id and is_active) then raise exception 'At least one active zone is required'; end if;
 select coalesce(max(ms.scheduled_order),0) into next_order from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id;
 for rec in
   select m.id,m.category_id,c.preferred_mat_id from public.matches m
   join public.categories c on c.id=m.category_id
   left join (select category_id,count(*) participant_count from public.category_participants
     where is_active and weigh_in_status='in_weight' group by category_id) cc on cc.category_id=m.category_id
   where m.tournament_id=p_tournament_id and m.status<>'completed'
     and m.participant_a_id is not null and m.participant_b_id is not null
     and not exists(select 1 from public.match_schedule ms where ms.match_id=m.id)
   order by coalesce(cc.participant_count,0) desc,m.category_id,m.round_number,m.match_number,m.id
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
   next_order:=next_order+1;
   insert into public.match_schedule(match_id,mat_id,scheduled_order) values(rec.id,chosen_zone,next_order) on conflict(match_id) do nothing;
   get diagnostics inserted = row_count;
   added:=added+inserted;
 end loop;
 perform public.refresh_tournament_schedule_times(p_tournament_id);
 return added;
end;
$function$;

-- A winner fills a later bout's empty slot. Append it when both fighters are known.
create or replace function public.queue_newly_ready_match()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
 if (private.has_tournament_permission(new.tournament_id,'running') or private.has_tournament_permission(new.tournament_id,'schedule'))
 and new.status<>'completed' and new.participant_a_id is not null and new.participant_b_id is not null
 and exists(select 1 from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=new.tournament_id)
 and exists(select 1 from public.mats where tournament_id=new.tournament_id and is_active) then
   perform public.generate_tournament_schedule(new.tournament_id);
 end if;
 return new;
end;
$function$;
revoke all on function public.queue_newly_ready_match() from public,anon,authenticated;
drop trigger if exists queue_newly_ready_match on public.matches;
create trigger queue_newly_ready_match after update of participant_a_id,participant_b_id on public.matches
for each row when (old.participant_a_id is distinct from new.participant_a_id or old.participant_b_id is distinct from new.participant_b_id)
execute function public.queue_newly_ready_match();

-- The operator can move pending bouts; a completed bout cannot change its slot.
create or replace function public.reorder_tournament_schedule(p_tournament_id uuid,p_match_ids uuid[])
returns void language plpgsql security definer set search_path to '' as $function$
declare i integer; mid uuid; total integer;
begin
 if not (private.has_tournament_permission(p_tournament_id,'schedule') or private.has_tournament_permission(p_tournament_id,'running')) then raise exception 'Not authorized'; end if;
 perform 1 from public.tournaments where id=p_tournament_id for update;
 select count(*) into total from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id;
 if total=0 and (p_match_ids is null or cardinality(p_match_ids)=0) then return; end if;
 if p_match_ids is null or cardinality(p_match_ids)<>total or (select count(distinct x) from unnest(p_match_ids) x)<>total
 or (select count(*) from public.match_schedule ms join public.matches m on m.id=ms.match_id
       where m.tournament_id=p_tournament_id and ms.match_id=any(p_match_ids))<>total then raise exception 'Invalid match list'; end if;
 if exists(select 1 from public.match_schedule ms join public.matches m on m.id=ms.match_id
    where m.tournament_id=p_tournament_id and m.status='completed' and ms.match_id is distinct from p_match_ids[ms.scheduled_order])
 then raise exception 'Completed bouts cannot be moved'; end if;
 update public.match_schedule set scheduled_order=scheduled_order+100000
 where match_id in(select id from public.matches where tournament_id=p_tournament_id);
 for i in 1..total loop
   mid:=p_match_ids[i];update public.match_schedule set scheduled_order=i where match_id=mid;
 end loop;
 perform public.refresh_tournament_schedule_times(p_tournament_id);
end;
$function$;
