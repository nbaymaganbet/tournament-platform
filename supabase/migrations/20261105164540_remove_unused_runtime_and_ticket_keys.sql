-- Remove only endpoints and ticket internals unused by the current application.
-- Application numbers, event rows, active legacy bracket helpers, RLS and migration history are retained.
SET LOCAL lock_timeout='5s';

CREATE TEMP TABLE _runtime_cleanup_rows(table_name text PRIMARY KEY,row_count bigint,digest text) ON COMMIT DROP;
DO $capture$
DECLARE item record; n bigint; h text;
BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg((to_jsonb(t)-''status_token_hash'')::text,E''\\n'' ORDER BY (to_jsonb(t)-''status_token_hash'')::text),'''')) FROM public.%I t',item.tablename) INTO n,h;
  INSERT INTO _runtime_cleanup_rows VALUES(item.tablename,n,h);
 END LOOP;
END $capture$;

DROP FUNCTION IF EXISTS public.list_tournament_members(uuid);
DROP FUNCTION IF EXISTS public.get_public_tournament_results(uuid);
DROP FUNCTION IF EXISTS public.get_public_category_format(uuid,uuid);
DROP FUNCTION IF EXISTS public.rebuild_single_elimination_bracket(uuid);
DROP FUNCTION IF EXISTS public.get_registration_status(text);
DROP FUNCTION IF EXISTS public.get_public_category_bracket(uuid,uuid);
DROP FUNCTION IF EXISTS public.configure_tournament_schedule(uuid,integer,time without time zone);
DROP FUNCTION IF EXISTS private.list_tournament_members(uuid);
DROP FUNCTION IF EXISTS private.is_tournament_member(uuid);
DROP FUNCTION public.submit_tournament_registration(uuid,text,text,integer,numeric,text,text,text,text,text);
CREATE OR REPLACE FUNCTION public.submit_tournament_registration(p_tournament_id uuid, p_first_name text, p_last_name text, p_age integer, p_weight numeric, p_experience text, p_phone text, p_city text, p_club text, p_coach text)
 RETURNS TABLE(registration_id uuid, application_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_organizer_id uuid;
  v_participant_id uuid;
  v_registration_id uuid;
  v_application_number text;
begin
  select t.organizer_id
    into v_organizer_id
  from public.tournaments t
  where t.id = p_tournament_id
    and t.is_public = true
    and t.status = 'registration_open';

  if v_organizer_id is null then
    raise exception 'Registration is not open';
  end if;

  insert into public.participants(
    organizer_id, first_name, last_name, age, weight, experience,
    phone, city, club, coach
  )
  values(
    v_organizer_id,
    trim(p_first_name),
    trim(p_last_name),
    p_age,
    p_weight,
    nullif(trim(p_experience), ''),
    trim(p_phone),
    nullif(trim(p_city), ''),
    nullif(trim(p_club), ''),
    nullif(trim(p_coach), '')
  )
  returning id into v_participant_id;

  insert into public.registrations(
    tournament_id,
    participant_id,
    status,
    payment_status
  )
  values(
    p_tournament_id,
    v_participant_id,
    'pending_confirmation',
    'unpaid'
  )
  returning registrations.id, registrations.application_number
    into v_registration_id, v_application_number;

  return query
  select v_registration_id, v_application_number;
end;
$function$
;
REVOKE ALL ON FUNCTION public.submit_tournament_registration(uuid,text,text,integer,numeric,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_tournament_registration(uuid,text,text,integer,numeric,text,text,text,text,text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.add_weigh_in_participant(p_category_id uuid, p_first_name text, p_last_name text, p_age integer, p_weight numeric, p_experience text, p_phone text, p_city text, p_club text, p_coach text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_category public.categories%rowtype;
  v_organizer_id uuid;
  v_participant public.participants%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into v_category from public.categories where id = p_category_id;
  if not found then raise exception 'Category not found'; end if;
  if not private.has_tournament_permission(v_category.tournament_id, 'weigh_in') then
    raise exception 'Not authorized';
  end if;
  if nullif(trim(p_first_name), '') is null
     or nullif(trim(p_last_name), '') is null
     or p_age is null or p_age < 0
     or p_weight is null or p_weight <= 0 or p_weight::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid participant data';
  end if;
  select organizer_id into v_organizer_id from public.tournaments
    where id = v_category.tournament_id;
  insert into public.participants(
    organizer_id, first_name, last_name, age, weight, experience, phone, city, club, coach
  ) values (
    v_organizer_id, trim(p_first_name), trim(p_last_name), p_age, p_weight,
    nullif(trim(p_experience), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_city), ''), nullif(trim(p_club), ''), nullif(trim(p_coach), '')
  ) returning * into v_participant;
  insert into public.registrations(
    tournament_id, participant_id, status, payment_status
  ) values (
    v_category.tournament_id, v_participant.id, 'confirmed', 'paid'
  );
  perform set_config('app.tournament_rpc_guard', '1', true);
  insert into public.category_participants(
    category_id, participant_id, is_active, weigh_in_status, weigh_in_weight
  ) values (p_category_id, v_participant.id, true, 'pending', null);
  return jsonb_build_object(
    'id', v_participant.id, 'first_name', v_participant.first_name,
    'last_name', v_participant.last_name, 'age', v_participant.age,
    'weight', v_participant.weight, 'club', v_participant.club, 'coach', v_participant.coach
  );
end;
$function$
;
ALTER TABLE public.registrations DROP COLUMN status_token_hash;

DO $verify$
DECLARE item record; n bigint; h text;
BEGIN
 FOR item IN SELECT * FROM _runtime_cleanup_rows LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg((to_jsonb(t)-''status_token_hash'')::text,E''\\n'' ORDER BY (to_jsonb(t)-''status_token_hash'')::text),'''')) FROM public.%I t',item.table_name) INTO n,h;
  IF n<>item.row_count OR h<>item.digest THEN RAISE EXCEPTION 'Application rows changed during cleanup: %',item.table_name; END IF;
 END LOOP;
END $verify$;

NOTIFY pgrst,'reload schema';


-- Exercise current registration, manual registration, bracket, schedule and results
-- inside a subtransaction that is always rolled back. Any test failure aborts cleanup.
DO $cleanup_regression$
BEGIN
 BEGIN
  EXECUTE $cleanup_qa$-- Transactional regression fixture. No test events or people are retained.
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


DO $registration_test$
DECLARE org uuid; uid uuid; tid uuid; cid uuid; reg jsonb; added jsonb; label text:=gen_random_uuid()::text;
BEGIN
 SELECT id,user_id INTO org,uid FROM public.organizers ORDER BY created_at LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM set_config('app.tournament_rpc_guard','1',true);
 INSERT INTO public.tournaments(organizer_id,name,slug,date,status,is_public) VALUES(org,'Cleanup transactional QA',gen_random_uuid()::text,current_date,'registration_open',true) RETURNING id INTO tid;
 INSERT INTO public.categories(tournament_id,name,age_min,age_max,weight_limit) VALUES(tid,'QA',10,15,60) RETURNING id INTO cid;
 SELECT to_jsonb(r) INTO reg FROM public.submit_tournament_registration(tid,'QA',label,12,50,null,null,null,null,null) r;
 ASSERT reg ? 'registration_id' AND reg ? 'application_number','Registration must retain its ID and application number';
 ASSERT NOT(reg ? 'status_token'),'Registration must not generate or return a ticket key';
 ASSERT (SELECT status='pending_confirmation' FROM public.registrations WHERE id=(reg->>'registration_id')::uuid),'New application must keep its pending status';
 PERFORM public.confirm_tournament_registration((reg->>'registration_id')::uuid);
 ASSERT (SELECT status='confirmed' FROM public.registrations WHERE id=(reg->>'registration_id')::uuid),'Organizer confirmation must still work';
 added:=public.add_weigh_in_participant(cid,'QA manual',gen_random_uuid()::text,12,51,null,null,null,null,null);
 ASSERT (SELECT status='confirmed' AND payment_status='paid' FROM public.registrations WHERE participant_id=(added->>'id')::uuid),'Manual weigh-in registration must remain confirmed';
 ASSERT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='registrations' AND column_name='status_token_hash'),'Ticket-only column must be absent';
END $registration_test$;
$cleanup_qa$;
  RAISE EXCEPTION USING ERRCODE='ZC001',MESSAGE='Rollback successful cleanup regression fixtures';
 EXCEPTION WHEN SQLSTATE 'ZC001' THEN NULL;
 END;
END $cleanup_regression$;
