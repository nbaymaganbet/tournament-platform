-- Only a whole category of three uses the consolation path. Nested groups of three
-- in larger brackets keep their ordinary winner progression toward the center.
do $migration$
declare definition text; previous text;
begin
 select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='generate_single_elimination_bracket'
   and pg_get_function_identity_arguments(p.oid)='p_category_id uuid';
 previous:='  if n=3 then
    left_ids := ids;
    left_json := private.build_bracket_group(b_id,c.tournament_id,p_category_id,left_ids,1);
    update public.brackets set status=''ready'',updated_at=now() where id=b_id;
    return b_id;
  end if;';
 if definition is null or position(previous in definition)=0 then raise exception 'Unexpected three-athlete bracket generator'; end if;
 definition:=replace(definition,previous,'  if n=3 then
    insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status,participant_a_id,participant_b_id)
      values(b_id,c.tournament_id,p_category_id,1,1,''scheduled'',ids[2],ids[3]) returning id into left_root;
    insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status,participant_a_id)
      values(b_id,c.tournament_id,p_category_id,2,2,''scheduled'',ids[1]) returning id into right_root;
    update public.matches set loser_next_match_id=right_root,updated_at=now() where id=left_root;
    update public.brackets set status=''ready'',updated_at=now() where id=b_id;
    return b_id;
  end if;');
 execute definition;
end;
$migration$;

-- Redirect only intact, unstarted two-match brackets with three weighed-in athletes.
-- Preserve IDs, seeding, match schedules and existing positions.
update public.matches first_match set next_match_id=null,loser_next_match_id=second_match.id,updated_at=now()
from public.matches second_match
where first_match.bracket_id=second_match.bracket_id
  and first_match.round_number=1 and first_match.match_number=1
  and second_match.round_number=2 and second_match.match_number=2
  and first_match.next_match_id=second_match.id and first_match.loser_next_match_id is null
  and first_match.status<>'completed' and second_match.status<>'completed'
  and first_match.winner_id is null and second_match.winner_id is null
  and second_match.participant_a_id is not null and second_match.participant_b_id is null
  and (select count(*) from public.matches m where m.bracket_id=first_match.bracket_id)=2
  and (select count(*) from public.category_participants cp where cp.category_id=first_match.category_id
       and cp.is_active and cp.weigh_in_status='in_weight')=3;

-- Intercept only the three-athlete branch; leave the general winner/medal function intact.
do $migration$
declare definition text; marker text;
begin
 select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='record_match_winner'
   and pg_get_function_identity_arguments(p.oid)='p_match_id uuid, p_winner_id uuid';
 marker:=' loser_id:=case when m.participant_a_id=p_winner_id then m.participant_b_id else m.participant_a_id end;';
 if definition is null or position(marker in definition)=0
    or position('private.has_tournament_permission(m.tournament_id,''running'')' in definition)=0
 then raise exception 'Unexpected winner function'; end if;
 definition:=replace(definition,marker,marker||'

 -- Whole three-athlete category: the first loser faces the BYE athlete.
 select * into first_m from public.matches x where x.bracket_id=m.bracket_id
   and x.round_number=1 and x.loser_next_match_id is not null limit 1;
 if found then
   select * into next_m from public.matches x where x.id=first_m.loser_next_match_id and x.round_number=2;
   if found and (select count(*) from public.matches x where x.bracket_id=m.bracket_id) in (2,3) then
     if m.id=first_m.id then
       update public.matches set winner_id=p_winner_id,status=''completed'',completed_at=now(),updated_at=now() where id=m.id;
       update public.matches set participant_b_id=loser_id,updated_at=now() where id=next_m.id;
       return;
     elsif m.id=next_m.id then
       if first_m.status<>''completed'' or m.participant_b_id is null then raise exception ''First fight must finish before the BYE fight''; end if;
       bye_id:=next_m.participant_a_id;
       update public.matches set winner_id=p_winner_id,status=''completed'',completed_at=now(),updated_at=now() where id=m.id;
       if p_winner_id=bye_id then
         insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status,participant_a_id,participant_b_id)
           values(m.bracket_id,m.tournament_id,m.category_id,3,3,''scheduled'',first_m.winner_id,bye_id)
           returning * into final_m;
         update public.matches set next_match_id=final_m.id,updated_at=now() where id in (first_m.id,next_m.id);
         if exists(select 1 from public.match_schedule ms join public.matches queued on queued.id=ms.match_id
           where queued.tournament_id=m.tournament_id) then
           perform public.generate_tournament_schedule(m.tournament_id);
         end if;
       else
         insert into public.results(tournament_id,category_id,participant_id,place)
           values(m.tournament_id,m.category_id,first_m.winner_id,1),
                 (m.tournament_id,m.category_id,p_winner_id,2),
                 (m.tournament_id,m.category_id,bye_id,3)
           on conflict(category_id,participant_id) do update set place=excluded.place;
       end if;
       return;
     elsif m.round_number=3 and m.match_number=3 and m.participant_a_id=first_m.winner_id
       and m.participant_b_id=next_m.winner_id then
       update public.matches set winner_id=p_winner_id,status=''completed'',completed_at=now(),updated_at=now() where id=m.id;
       insert into public.results(tournament_id,category_id,participant_id,place)
         values(m.tournament_id,m.category_id,p_winner_id,1),
               (m.tournament_id,m.category_id,loser_id,2),
               (m.tournament_id,m.category_id,next_m.participant_b_id,3)
         on conflict(category_id,participant_id) do update set place=excluded.place;
       return;
     end if;
   end if;
 end if;');
 execute definition;
end;
$migration$;
