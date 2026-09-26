-- The old winner trigger checks the next match before the winner is inserted there.
-- The participant-update trigger added in the later migration handles the ready match.
drop trigger if exists schedule_ready_matches_after_match_update on public.matches;
drop function if exists private.schedule_ready_matches_after_match_update();
drop function if exists private.schedule_newly_ready_match(uuid);

-- Leave existing bouts in their relative order. Insert a newly ready preliminary bout
-- ahead of the trailing block of uncompleted medal bouts, never ahead of a completed bout.
create or replace function public.generate_tournament_schedule(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path to '' as $function$
declare event_date date; start_at time; next_order integer; insert_order integer;
  last_preliminary integer; last_completed integer; first_medal integer;
  chosen_zone uuid; rec record; added integer:=0; inserted integer;
begin
 if not (private.has_tournament_permission(p_tournament_id,'schedule') or private.has_tournament_permission(p_tournament_id,'running')) then raise exception 'Not authorized'; end if;
 select t.date,t.schedule_start_time into event_date,start_at from public.tournaments t where t.id=p_tournament_id for update;
 if event_date is null or start_at is null then raise exception 'Set tournament date and schedule start time first'; end if;
 if not exists(select 1 from public.mats where tournament_id=p_tournament_id and is_active) then raise exception 'At least one active zone is required'; end if;

 for rec in
   select m.id,m.category_id,m.next_match_id,m.loser_next_match_id,c.preferred_mat_id from public.matches m
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

   select coalesce(max(ms.scheduled_order),0) into next_order from public.match_schedule ms
     join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id;
   insert_order:=next_order+1;
   if rec.next_match_id is not null or rec.loser_next_match_id is not null then
     select coalesce(max(ms.scheduled_order),0) into last_preliminary from public.match_schedule ms
       join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id and m.status<>'completed'
         and (m.next_match_id is not null or m.loser_next_match_id is not null);
     select coalesce(max(ms.scheduled_order),0) into last_completed from public.match_schedule ms
       join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id and m.status='completed';
     select min(ms.scheduled_order) into first_medal from public.match_schedule ms
       join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id and m.status<>'completed'
         and m.next_match_id is null and m.loser_next_match_id is null
         and ms.scheduled_order>greatest(last_preliminary,last_completed);
     if first_medal is not null then
       insert_order:=first_medal;
       update public.match_schedule ms set scheduled_order=ms.scheduled_order+1,updated_at=now()
         from public.matches m where m.id=ms.match_id and m.tournament_id=p_tournament_id
           and ms.scheduled_order>=insert_order;
     end if;
   end if;
   insert into public.match_schedule(match_id,mat_id,scheduled_order)
     values(rec.id,chosen_zone,insert_order) on conflict(match_id) do nothing;
   get diagnostics inserted = row_count;
   added:=added+inserted;
 end loop;
 perform public.refresh_tournament_schedule_times(p_tournament_id);
 return added;
end;
$function$;
