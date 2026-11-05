-- Transactional regression fixture. No test events or people are retained.
begin;
do $$
declare org uuid; uid uuid; tid uuid; cid uuid; cid2 uuid; pid uuid; bids uuid[]:='{}'; b uuid; fight public.matches%rowtype; next_bout public.matches%rowtype; earliest timestamptz; event jsonb; i int; blocked boolean;
begin
 select id,user_id into org,uid from public.organizers order by created_at limit 1;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 perform set_config('app.tournament_rpc_guard','1',true);
 insert into public.tournaments(organizer_id,name,slug,date,status,is_public,schedule_start_time,bronze_bout) values(org,'Transactional QA',gen_random_uuid()::text,current_date,'preparation',true,'10:00',false) returning id into tid;
 insert into public.categories(tournament_id,name,age_min,age_max,weight_limit) values(tid,'QA category',10,15,60) returning id into cid;
 insert into public.categories(tournament_id,name,age_min,age_max,weight_limit) values(tid,'QA second',10,15,70) returning id into cid2;
 for i in 1..8 loop
  insert into public.participants(organizer_id,first_name,last_name,age,weight,club,city,experience,coach) values(org,'QA'||i,gen_random_uuid()::text,12,50,'Club'||((i-1)/2),case when i<=4 then 'Astana' else 'Almaty' end,case when i%2=1 then '1 год' else '5 лет' end,'Coach'||((i-1)/2)) returning id into pid;
  bids:=array_append(bids,pid);
  insert into public.registrations(tournament_id,participant_id,status,payment_status) values(tid,pid,'confirmed','paid');
  insert into public.category_participants(category_id,participant_id,weigh_in_status,weigh_in_weight) values(cid,pid,case when i=8 then 'pending' else 'in_weight' end,50);
 end loop;
 blocked:=false;
 begin perform public.generate_checked_bracket(cid,false);exception when others then blocked:=sqlerrm like '%Unweighed%';end;
 assert blocked,'Must warn about unweighed athlete';
 update public.category_participants set weigh_in_status='in_weight' where category_id=cid;
 b:=public.generate_checked_bracket(cid,false);
 assert (select count(*) from public.matches where category_id=cid)=7,'8 athletes need 7 bouts without bronze';
 event:=public.get_public_event_data(tid);
 assert jsonb_array_length(event->'matches')=0,'Unpublished matches must be hidden';
 perform public.publish_category_bracket(cid);
 event:=public.get_public_event_data(tid);
 assert jsonb_array_length(event->'matches')=7,'Published bracket must be visible';
 assert not exists(select 1 from public.matches bout join public.participants a on a.id=bout.participant_a_id join public.participants b on b.id=bout.participant_b_id where bout.category_id=cid and bout.round_number=1 and a.club=b.club),'Clubmates should be separated';
 assert not exists(select 1 from public.matches bout join public.participants a on a.id=bout.participant_a_id join public.participants b on b.id=bout.participant_b_id where bout.category_id=cid and bout.round_number=1 and a.city=b.city),'Cities should be separated';
 insert into public.mats(tournament_id,name,sort_order) values(tid,'QA mat',0);
 perform public.generate_tournament_schedule(tid);
 assert (select count(*) from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=tid)=7,'Schedule must contain unknown future rounds';
 select x.* into fight from public.matches x join public.match_schedule s on s.match_id=x.id where x.tournament_id=tid and x.participant_a_id is not null and x.participant_b_id is not null order by s.scheduled_order limit 1;
 perform public.start_match(fight.id);
 assert (select status='running' and started_at is not null from public.matches where id=fight.id),'Start must be stored';
 select x.* into next_bout from public.matches x where x.tournament_id=tid and x.id<>fight.id and x.participant_a_id is not null and x.participant_b_id is not null order by match_number limit 1;
 blocked:=false;
 begin perform public.start_match(next_bout.id);exception when others then blocked:=sqlerrm like '%already has a running%';end;
 assert blocked,'Only one bout per mat';
 update public.matches set started_at=now()-interval '20 minutes' where id=fight.id;
 perform public.refresh_tournament_schedule_times(tid);
 select min(s.approximate_time) into earliest from public.match_schedule s join public.matches x on x.id=s.match_id where x.tournament_id=tid and x.status='scheduled';
 assert earliest>=now(),'Overrunning bout must not leave forecasts in past';
 perform public.record_match_winner(fight.id,fight.participant_a_id);
 assert (select status='completed' and completed_at is not null from public.matches where id=fight.id),'End must be stored';
 assert (select min(s.approximate_time)>=now() from public.match_schedule s join public.matches x on x.id=s.match_id where x.tournament_id=tid and x.status='scheduled'),'Completing must not reset to opening';
 blocked:=false;
 begin perform public.refresh_unstarted_category_bracket(cid);exception when others then blocked:=sqlerrm like '%before fights start%';end;
 assert blocked,'Started category cannot be rebuilt';
 -- A participant overlooked after the start produces an alert, never changes the bracket.
 insert into public.category_participants(category_id,participant_id,weigh_in_status,weigh_in_weight) values(cid2,bids[8],'in_weight',50);
 blocked:=false;
 begin update public.category_participants set category_id=cid where category_id=cid2;exception when others then blocked:=sqlerrm like '%after category fights start%';end;
 assert blocked,'Late additions must be rejected';
 -- Finish the temporary category and expose its results before the whole event ends.
 for i in 1..7 loop
  select * into next_bout from public.matches where tournament_id=tid and status<>'completed' and participant_a_id is not null and participant_b_id is not null order by round_number,match_number limit 1;
  exit when not found;
  perform public.start_match(next_bout.id);
  perform public.record_match_winner(next_bout.id,next_bout.participant_a_id);
 end loop;
 assert exists(select 1 from public.get_public_tournament_results_detailed(tid)),'Completed category results available in ongoing event';
 assert (select status='preparation' from public.tournaments where id=tid),'Event need not be completed';
 -- Authorization must fail without a session.
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 blocked:=false;begin perform public.publish_category_bracket(cid);exception when others then blocked:=sqlerrm like '%Not authorized%';end;
 assert blocked,'Anonymous callers cannot publish';
 assert to_regprocedure('public.get_registration_status(text)') is null,'Removed ticket API must not exist';
end $$;
rollback;
