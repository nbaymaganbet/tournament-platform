CREATE OR REPLACE FUNCTION public.record_match_winner(p_match_id uuid, p_winner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
 m public.matches%rowtype;
 loser_id uuid;
 next_m public.matches%rowtype;
 final_m public.matches%rowtype;
 third_m public.matches%rowtype;
 first_m public.matches%rowtype;
 bye_id uuid;
 first_winner uuid;
begin
 select * into m from public.matches where id=p_match_id for update;
 if not found then raise exception 'Match not found'; end if;
 if not private.is_organizer_of_tournament(m.tournament_id) then raise exception 'Not authorized'; end if;
 if m.status='completed' then raise exception 'Match already completed'; end if;
 if p_winner_id is null or p_winner_id not in (m.participant_a_id,m.participant_b_id) then raise exception 'Winner must be one of the match participants'; end if;
 loser_id:=case when m.participant_a_id=p_winner_id then m.participant_b_id else m.participant_a_id end;
 update public.matches set winner_id=p_winner_id,status='completed',completed_at=now(),updated_at=now() where id=m.id;

 if m.next_match_id is not null then
   select * into next_m from public.matches where id=m.next_match_id for update;
   update public.matches
   set participant_a_id=case when participant_a_id is null then p_winner_id else participant_a_id end,
       participant_b_id=case when participant_a_id is not null and participant_b_id is null then p_winner_id else participant_b_id end,
       updated_at=now()
   where id=m.next_match_id;
 end if;

 if m.loser_next_match_id is not null and loser_id is not null then
   update public.matches
   set participant_a_id=case when participant_a_id is null then loser_id else participant_a_id end,
       participant_b_id=case when participant_a_id is not null and participant_b_id is null then loser_id else participant_b_id end,
       updated_at=now()
   where id=m.loser_next_match_id;
 end if;

 if exists(select 1 from public.matches x where x.bracket_id=m.bracket_id and x.round_number=1 and x.match_number=1)
    and exists(select 1 from public.matches x where x.bracket_id=m.bracket_id and x.round_number=2 and x.next_match_id is null)
    and (select count(*) from public.category_participants cp where cp.category_id=m.category_id and cp.is_active=true and cp.weigh_in_status='in_weight')=3 then
   select * into first_m from public.matches where bracket_id=m.bracket_id and round_number=1 order by match_number limit 1;
   select * into final_m from public.matches where bracket_id=m.bracket_id and round_number=2 order by match_number limit 1;
   if final_m.id=m.id and first_m.status='completed' then
     bye_id:=case
       when final_m.participant_a_id not in (first_m.participant_a_id,first_m.participant_b_id) then final_m.participant_a_id
       else final_m.participant_b_id
     end;
     first_winner:=first_m.winner_id;
     if p_winner_id=bye_id then
       insert into public.results(tournament_id,category_id,participant_id,place) values(m.tournament_id,m.category_id,p_winner_id,1) on conflict(category_id,participant_id) do update set place=excluded.place;
       insert into public.results(tournament_id,category_id,participant_id,place) values(m.tournament_id,m.category_id,first_winner,2) on conflict(category_id,participant_id) do update set place=excluded.place;
       insert into public.results(tournament_id,category_id,participant_id,place) values(m.tournament_id,m.category_id,case when first_m.participant_a_id=first_winner then first_m.participant_b_id else first_m.participant_a_id end,3) on conflict(category_id,participant_id) do update set place=excluded.place;
     else
       insert into public.results(tournament_id,category_id,participant_id,place) values(m.tournament_id,m.category_id,first_winner,1) on conflict(category_id,participant_id) do update set place=excluded.place;
       insert into public.results(tournament_id,category_id,participant_id,place) values(m.tournament_id,m.category_id,p_winner_id,2) on conflict(category_id,participant_id) do update set place=excluded.place;
       insert into public.results(tournament_id,category_id,participant_id,place) values(m.tournament_id,m.category_id,bye_id,3) on conflict(category_id,participant_id) do update set place=excluded.place;
     end if;
     return;
   end if;
 end if;

 select * into final_m
 from public.matches
 where bracket_id=m.bracket_id and next_match_id is null and loser_next_match_id is null
   and participant_a_id is not null and participant_b_id is not null
 order by round_number desc,match_number asc limit 1;

 if final_m.id=m.id then
   insert into public.results(tournament_id,category_id,participant_id,place)
   values(m.tournament_id,m.category_id,m.winner_id,1)
   on conflict(category_id,participant_id) do update set place=excluded.place;
   if loser_id is not null then
     insert into public.results(tournament_id,category_id,participant_id,place)
     values(m.tournament_id,m.category_id,loser_id,2)
     on conflict(category_id,participant_id) do update set place=excluded.place;
   end if;
 end if;

 select * into third_m
 from public.matches
 where bracket_id=m.bracket_id
   and id<>coalesce(final_m.id,'00000000-0000-0000-0000-000000000000'::uuid)
   and next_match_id is null and loser_next_match_id is null
 order by round_number desc,match_number asc limit 1;

 if third_m.id=m.id then
   insert into public.results(tournament_id,category_id,participant_id,place)
   values(m.tournament_id,m.category_id,m.winner_id,3)
   on conflict(category_id,participant_id) do update set place=excluded.place;
 end if;
end;
$function$
;
