-- Existing tournaments, categories and registrations keep their original workflow.
alter table public.tournaments
  add column divisions text[] not null default '{}' check (divisions <@ array['gi','no_gi']::text[] and array_position(divisions,null) is null),
  add column victory_methods text[] check (cardinality(victory_methods)>0 and array_position(victory_methods,null) is null and victory_methods <@ array['points','submission','ko','tko','disqualification','walkover','retirement']::text[]),
  add column gi_start_at timestamptz,
  add column no_gi_start_at timestamptz;
alter table public.categories add column division text not null default '' check (division in ('','gi','no_gi'));
alter table public.registrations add column division text not null default '' check (division in ('','gi','no_gi'));
alter table public.registrations
  drop constraint registrations_tournament_id_participant_id_key,
  add unique (tournament_id,participant_id,division);

CREATE OR REPLACE FUNCTION public.submit_tournament_registration(p_tournament_id uuid, p_first_name text, p_last_name text, p_age integer, p_weight numeric, p_experience text, p_phone text, p_city text, p_club text, p_coach text, p_divisions text[])
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
  available text[];
  selected text[];
  entry text;
begin
  select t.organizer_id,t.divisions
    into v_organizer_id,available
  from public.tournaments t
  where t.id = p_tournament_id
    and t.is_public = true
    and t.status = 'registration_open' for update;

  if v_organizer_id is null then
    raise exception 'Registration is not open';
  end if;

  selected := coalesce(p_divisions,array['']::text[]);
  if cardinality(available)=0 then
    if array_position(selected,null) is not null or selected <> array['']::text[] then raise exception 'Invalid tournament division'; end if;
  elsif cardinality(selected)=0 or array_position(selected,null) is not null or not (selected <@ available) then
    raise exception 'Select a tournament division';
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

  for entry in select distinct unnest(selected) loop
  insert into public.registrations(
    tournament_id,
    participant_id,
    status,
    payment_status,
    division
  )
  values(
    p_tournament_id,
    v_participant_id,
    'pending_confirmation',
    'unpaid',
    entry
  )
  returning registrations.id, registrations.application_number
    into v_registration_id, v_application_number;

  return query select v_registration_id, v_application_number;
  end loop;
end;
$function$;
revoke all on function public.submit_tournament_registration(uuid,text,text,integer,numeric,text,text,text,text,text,text[]) from public;
grant execute on function public.submit_tournament_registration(uuid,text,text,integer,numeric,text,text,text,text,text,text[]) to anon,authenticated,service_role;
create or replace function public.submit_tournament_registration(p_tournament_id uuid,p_first_name text,p_last_name text,p_age integer,p_weight numeric,p_experience text,p_phone text,p_city text,p_club text,p_coach text)
returns table(registration_id uuid,application_number text)
language sql set search_path='' as $$
 select * from public.submit_tournament_registration(p_tournament_id,p_first_name,p_last_name,p_age,p_weight,p_experience,p_phone,p_city,p_club,p_coach,null::text[]);
$$;
CREATE OR REPLACE FUNCTION public.confirm_tournament_registration(p_registration_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.registrations%rowtype; p public.participants%rowtype; assigned_category uuid;
begin
 perform 1 from public.tournaments t join public.registrations r0 on r0.tournament_id=t.id where r0.id=p_registration_id for update of t;
 select * into r from public.registrations where id=p_registration_id for update;
 if not found then raise exception 'Registration not found'; end if;
 if not private.has_tournament_permission(r.tournament_id,'participants') then raise exception 'Not authorized'; end if; perform set_config('app.tournament_rpc_guard', '1', true);
 select * into p from public.participants where id=r.participant_id;
 update public.registrations set payment_status='paid',status='confirmed',updated_at=now() where id=r.id;
 select id into assigned_category from public.categories where tournament_id=r.tournament_id and division=r.division and (age_min is null or p.age>=age_min) and (age_max is null or p.age<=age_max) and (weight_min is null or p.weight>=weight_min) and (weight_limit is null or p.weight<=weight_limit+coalesce(weight_allowance,0)) order by weight_limit asc nulls last,age_min asc nulls last,sort_order asc,id limit 1;
 if assigned_category is not null then
   update public.category_participants set is_active=false,weigh_in_status='pending',weigh_in_weight=null where participant_id=p.id and is_active=true and category_id<>assigned_category and category_id in (select id from public.categories where tournament_id=r.tournament_id and division=r.division);
   insert into public.category_participants(category_id,participant_id,is_active,weigh_in_status) values(assigned_category,p.id,true,'pending') on conflict(category_id,participant_id) do update set is_active=true,weigh_in_status='pending';
 end if;
 return jsonb_build_object('registration_id',r.id,'status','confirmed','payment_status','paid','category_id',assigned_category);
end; $function$;
CREATE OR REPLACE FUNCTION private.cancel_tournament_registration(p_registration_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.registrations%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tournaments t JOIN public.registrations r0 ON r0.tournament_id=t.id WHERE r0.id=p_registration_id FOR UPDATE OF t;
 SELECT * INTO r FROM public.registrations WHERE id=p_registration_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
 IF NOT (
  EXISTS(SELECT 1 FROM public.tournaments t JOIN public.organizers o ON o.id=t.organizer_id
    WHERE t.id=r.tournament_id AND o.user_id=auth.uid())
  OR EXISTS(SELECT 1 FROM public.tournament_members tm JOIN public.tournament_member_permissions p
    ON p.tournament_id=tm.tournament_id AND p.user_id=tm.user_id
    WHERE tm.tournament_id=r.tournament_id AND tm.user_id=auth.uid() AND p.participants IS TRUE)
 ) THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
 END IF;
 IF r.status<>'confirmed' OR r.payment_status<>'paid' THEN RAISE EXCEPTION 'Registration is not confirmed'; END IF;
 IF EXISTS(SELECT 1 FROM public.matches m WHERE m.tournament_id=r.tournament_id AND m.category_id IN (SELECT id FROM public.categories WHERE tournament_id=r.tournament_id AND division=r.division)
    AND (m.participant_a_id=r.participant_id OR m.participant_b_id=r.participant_id))
    OR EXISTS(SELECT 1 FROM public.results x WHERE x.tournament_id=r.tournament_id AND x.participant_id=r.participant_id AND x.category_id IN (SELECT id FROM public.categories WHERE tournament_id=r.tournament_id AND division=r.division)) THEN
  RAISE EXCEPTION 'Participant is already in a bracket; confirmation cannot be cancelled';
 END IF;
 PERFORM set_config('app.tournament_rpc_guard','1',true);
 UPDATE public.category_participants cp SET is_active=false FROM public.categories c
  WHERE cp.category_id=c.id AND c.tournament_id=r.tournament_id AND c.division=r.division AND cp.participant_id=r.participant_id AND cp.is_active;
 UPDATE public.registrations SET status='pending_confirmation',payment_status='unpaid',updated_at=now() WHERE id=r.id;
 RETURN jsonb_build_object('registration_id',r.id,'status','pending_confirmation','payment_status','unpaid');
END;
$function$;
CREATE OR REPLACE FUNCTION private.assign_registered_athlete(p_category_id uuid, p_participant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tid uuid; target_division text;
begin
 select tournament_id,division into tid,target_division from public.categories where id=p_category_id;
 if auth.uid() is null or not private.has_tournament_permission(tid,'weigh_in') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=tid for update;
 if not exists(select 1 from public.registrations where tournament_id=tid and division=target_division and participant_id=p_participant_id and status in('confirmed','pending_confirmation')) then raise exception 'Event registration not found';end if;
 if exists(select 1 from public.category_participants cp join public.categories c on c.id=cp.category_id where cp.participant_id=p_participant_id and c.tournament_id=tid and c.division=target_division and cp.is_active) then raise exception 'Athlete already has a category. Use transfer instead';end if;
 perform set_config('app.tournament_rpc_guard','1',true);
 insert into public.category_participants(category_id,participant_id,is_active,weigh_in_status) values(p_category_id,p_participant_id,true,'pending') on conflict(category_id,participant_id) do update set is_active=true,weigh_in_status='pending',weigh_in_weight=null;
end;$function$;
CREATE OR REPLACE FUNCTION public.generate_single_elimination_bracket(p_category_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.categories%rowtype;
  t public.tournaments%rowtype;
  ids uuid[];
  n integer;
  b_id uuid;
  i integer;
  j integer;
  no integer:=0;
  half integer;
  left_ids uuid[];
  right_ids uuid[];
  left_tree jsonb;
  right_tree jsonb;
  left_root uuid;
  right_root uuid;
  final_id uuid;
  bronze_id uuid;
  last_round integer;
  selected_format text;
begin
  select * into c from public.categories where id=p_category_id;
  if not found then raise exception 'Category not found'; end if;
  select * into t from public.tournaments where id=c.tournament_id for update;
  if not private.has_tournament_permission(t.id,'brackets') then raise exception 'Not authorized'; end if;
  if t.bracket_rules_version=0 then
    return public.legacy_generate_single_elimination_bracket(p_category_id);
  end if;
  if exists(select 1 from public.brackets where category_id=p_category_id) then
    raise exception 'Bracket already exists';
  end if;
  select array_agg(cp.participant_id order by rg.created_at,cp.participant_id),count(*)
    into ids,n from public.category_participants cp join public.registrations rg
      on rg.tournament_id=t.id and rg.participant_id=cp.participant_id and rg.division=c.division
    where cp.category_id=p_category_id and cp.is_active and cp.weigh_in_status='in_weight'
      and rg.status='confirmed' and rg.payment_status='paid';
  if n<2 then raise exception 'At least two eligible athletes are required'; end if;
  ids:=private.seed_group(ids);
  selected_format:=coalesce(c.bracket_format,t.bracket_format);
  insert into public.brackets(category_id,format,status,bronze_bout)
    values(p_category_id,selected_format,'draft',t.bronze_bout and selected_format='single_elimination') returning id into b_id;

  if selected_format='round_robin' then
    for i in 1..n-1 loop
      for j in i+1..n loop
        no:=no+1;
        insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status,participant_a_id,participant_b_id)
          values(b_id,t.id,p_category_id,i,no,'scheduled',ids[i],ids[j]);
      end loop;
    end loop;
  elsif n=2 then
    insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status,participant_a_id,participant_b_id)
      values(b_id,t.id,p_category_id,1,1,'scheduled',ids[1],ids[2]);
  elsif n=3 then
    -- Ordinary elimination: the BYE athlete meets the first-bout winner.
    perform private.build_bracket_group(b_id,t.id,p_category_id,ids,1);
  else
    half:=ceil(n/2.0)::integer;
    if mod(n,2)=1 and mod(half,2)=0 then
      right_ids:=ids[1:n-half];left_ids:=ids[n-half+1:n];
    else
      left_ids:=ids[1:half];right_ids:=ids[half+1:n];
    end if;
    left_tree:=private.build_bracket_group(b_id,t.id,p_category_id,left_ids,1);
    right_tree:=private.build_bracket_group(b_id,t.id,p_category_id,right_ids,1);
    left_root:=(left_tree->>'id')::uuid;
    right_root:=(right_tree->>'id')::uuid;
    last_round:=greatest((left_tree->>'depth')::integer,(right_tree->>'depth')::integer)+1;
    select coalesce(max(match_number),0)+1 into no from public.matches where bracket_id=b_id;
    insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status)
      values(b_id,t.id,p_category_id,last_round,no,'scheduled') returning id into final_id;
    if left_tree->>'kind'='participant' then
      update public.matches set participant_a_id=left_root where id=final_id;
    else
      update public.matches set next_match_id=final_id where id=left_root;
    end if;
    if right_tree->>'kind'='participant' then
      update public.matches set participant_b_id=right_root where id=final_id;
    else
      update public.matches set next_match_id=final_id where id=right_root;
    end if;
    if t.bronze_bout and left_tree->>'kind'='match' and right_tree->>'kind'='match' then
      insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status)
        values(b_id,t.id,p_category_id,last_round,no+1,'scheduled') returning id into bronze_id;
      update public.matches set loser_next_match_id=bronze_id where id in (left_root,right_root);
    end if;
  end if;
  update public.brackets set status='ready',updated_at=now() where id=b_id;
  return b_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.legacy_generate_single_elimination_bracket(p_category_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  c public.categories%rowtype;
  b_id uuid;
  n integer;
  ids uuid[];
  left_ids uuid[];
  right_ids uuid[];
  left_json jsonb;
  right_json jsonb;
  left_root uuid;
  right_root uuid;
  final_id uuid;
  third_id uuid;
  next_no integer;
  final_round integer;
  left_n integer;
  r record;
begin
  select * into c from public.categories where id=p_category_id;
  if not found then raise exception 'Category not found'; end if;
  if not private.has_tournament_permission(c.tournament_id,'brackets') then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.brackets where category_id=p_category_id) then
    raise exception 'Bracket already exists';
  end if;

  select array_agg(cp.participant_id order by rg.created_at asc, cp.participant_id),
         count(*)
  into ids,n
  from public.category_participants cp
  join public.registrations rg
    on rg.tournament_id=c.tournament_id and rg.participant_id=cp.participant_id and rg.division=c.division
  where cp.category_id=p_category_id
    and cp.is_active=true
    and cp.weigh_in_status='in_weight'
    and rg.status='confirmed'
    and rg.payment_status='paid';

  if coalesce(n,0)<2 then
    raise exception 'At least 2 paid, confirmed and weighed-in participants are required';
  end if;

  ids:=private.seed_group(ids);
  insert into public.brackets(category_id,format,status)
  values(p_category_id,'single_elimination','draft')
  returning id into b_id;

  -- For every odd group, the lightest participant is deliberately placed
  -- into the odd-sized side so the n=3 leaf rule gives that participant the BYE.
  if n=2 then
    insert into public.matches(
      bracket_id,tournament_id,category_id,round_number,match_number,status,
      participant_a_id,participant_b_id
    ) values (
      b_id,c.tournament_id,p_category_id,1,1,'scheduled',ids[1],ids[2]
    );
    update public.brackets set status='ready',updated_at=now() where id=b_id;
    return b_id;
  end if;

  if n=3 then
    insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status,participant_a_id,participant_b_id)
      values(b_id,c.tournament_id,p_category_id,1,1,'scheduled',ids[2],ids[3]) returning id into left_root;
    insert into public.matches(bracket_id,tournament_id,category_id,round_number,match_number,status,participant_a_id)
      values(b_id,c.tournament_id,p_category_id,2,2,'scheduled',ids[1]) returning id into right_root;
    update public.matches set loser_next_match_id=right_root,updated_at=now() where id=left_root;
    update public.brackets set status='ready',updated_at=now() where id=b_id;
    return b_id;
  end if;

  left_n := ceil(n/2.0)::integer;
  if mod(n,2)=1 then
    if mod(left_n,2)=1 then
      -- Odd left side: keep lightest there.
      left_ids := ids[1:left_n];
      right_ids := ids[left_n+1:n];
    else
      -- Odd right side: put lightest into the right side.
      right_ids := ids[1:(n-left_n)];
      left_ids := ids[(n-left_n)+1:n];
    end if;
  else
    left_ids := ids[1:left_n];
    right_ids := ids[left_n+1:n];
  end if;

  left_json := private.build_bracket_group(
    b_id,c.tournament_id,p_category_id,left_ids,1
  );
  right_json := private.build_bracket_group(
    b_id,c.tournament_id,p_category_id,right_ids,1
  );

  left_root := (left_json->>'id')::uuid;
  right_root := (right_json->>'id')::uuid;

  final_round := greatest(
    (left_json->>'depth')::integer,
    (right_json->>'depth')::integer
  ) + 1;

  select coalesce(max(match_number),0)+1 into next_no
  from public.matches where bracket_id=b_id;

  insert into public.matches(
    bracket_id,tournament_id,category_id,round_number,match_number,status
  ) values(
    b_id,c.tournament_id,p_category_id,final_round,next_no,'scheduled'
  ) returning id into final_id;

  if left_json->>'kind'='participant' then
    update public.matches set participant_a_id=left_root,updated_at=now() where id=final_id;
  else
    update public.matches set next_match_id=final_id,updated_at=now() where id=left_root;
  end if;

  if right_json->>'kind'='participant' then
    update public.matches set participant_b_id=right_root,updated_at=now() where id=final_id;
  else
    update public.matches set next_match_id=final_id,updated_at=now() where id=right_root;
  end if;

  -- A third-place bout is fed by the losers of the two semifinal/root bouts.
  select coalesce(max(match_number),0)+1 into next_no
  from public.matches where bracket_id=b_id;
  insert into public.matches(
    bracket_id,tournament_id,category_id,round_number,match_number,status
  ) values(
    b_id,c.tournament_id,p_category_id,final_round,next_no,'scheduled'
  ) returning id into third_id;

  if left_json->>'kind'='match' then
    update public.matches set loser_next_match_id=third_id,updated_at=now()
    where id=left_root;
  end if;
  if right_json->>'kind'='match' then
    update public.matches set loser_next_match_id=third_id,updated_at=now()
    where id=right_root;
  end if;

  update public.brackets set status='ready',updated_at=now() where id=b_id;
  return b_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.refresh_unstarted_category_bracket(p_category_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    join public.registrations rg on rg.participant_id=cp.participant_id and rg.tournament_id=tournament_uuid and rg.division=(select division from public.categories where id=p_category_id)
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
      join public.registrations rg on rg.participant_id=cp.participant_id and rg.tournament_id=tournament_uuid and rg.division=(select division from public.categories where id=p_category_id)
      where cp.category_id=p_category_id and cp.is_active and cp.weigh_in_status='in_weight'
        and rg.status='confirmed' and rg.payment_status='paid'
        and not exists (select 1 from public.matches m where m.bracket_id=previous_bracket
          and (m.participant_a_id=cp.participant_id or m.participant_b_id=cp.participant_id))
    ) and not exists (
      select 1 from public.matches m where m.bracket_id=previous_bracket
        and (m.participant_a_id is not null or m.participant_b_id is not null)
        and ( (m.participant_a_id is not null and not exists (
          select 1 from public.category_participants cp join public.registrations rg
            on rg.participant_id=cp.participant_id and rg.tournament_id=tournament_uuid and rg.division=(select division from public.categories where id=p_category_id)
          where cp.category_id=p_category_id and cp.participant_id=m.participant_a_id
            and cp.is_active and cp.weigh_in_status='in_weight'
            and rg.status='confirmed' and rg.payment_status='paid'))
          or (m.participant_b_id is not null and not exists (
          select 1 from public.category_participants cp join public.registrations rg
            on rg.participant_id=cp.participant_id and rg.tournament_id=tournament_uuid and rg.division=(select division from public.categories where id=p_category_id)
          where cp.category_id=p_category_id and cp.participant_id=m.participant_b_id
            and cp.is_active and cp.weigh_in_status='in_weight'
            and rg.status='confirmed' and rg.payment_status='paid')))
    ) and (select b.format from public.brackets b where b.id=previous_bracket)=
      (select coalesce(c.bracket_format,t.bracket_format) from public.categories c
        join public.tournaments t on t.id=c.tournament_id where c.id=p_category_id)
      then raise exception 'Category bracket is already up to date'; end if;

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
      where m.bracket_id=replacement;
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
CREATE OR REPLACE FUNCTION private.generate_checked_bracket(p_category_id uuid, p_without_unweighed boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tid uuid;
begin
 select tournament_id into tid from public.categories where id=p_category_id;
 if auth.uid() is null or not private.has_tournament_permission(tid,'brackets') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=tid for update;
 if not p_without_unweighed and exists(select 1 from public.category_participants cp join public.registrations r on r.participant_id=cp.participant_id and r.tournament_id=tid and r.division=(select division from public.categories where id=p_category_id) where cp.category_id=p_category_id and cp.is_active and cp.weigh_in_status<>'in_weight' and r.status='confirmed') then raise exception 'Unweighed athletes require explicit confirmation';end if;
 return public.generate_single_elimination_bracket(p_category_id);
end;$function$;
CREATE OR REPLACE FUNCTION public.transfer_category_participant(p_from_category_id uuid, p_to_category_id uuid, p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare from_c public.categories%rowtype; to_c public.categories%rowtype; p public.participants%rowtype; cp public.category_participants%rowtype; target_weight numeric;
begin
 select * into from_c from public.categories where id=p_from_category_id;
 select * into to_c from public.categories where id=p_to_category_id;
 if from_c.id is null then raise exception 'Source category not found'; end if;
 if to_c.id is null then raise exception 'Target category not found'; end if;
 if from_c.tournament_id<>to_c.tournament_id then raise exception 'Categories must belong to the same tournament'; end if;
 if from_c.division<>to_c.division then raise exception 'Categories must belong to the same division'; end if;
 if from_c.id=to_c.id then raise exception 'Choose another category'; end if;
 if auth.uid() is null or not private.has_tournament_permission(from_c.tournament_id,'weigh_in') then raise exception 'Not authorized'; end if; perform set_config('app.tournament_rpc_guard', '1', true);
 -- Serialize against bracket refresh and concurrent bout results.
 perform 1 from public.tournaments where id=from_c.tournament_id for update;
 perform 1 from public.brackets where category_id in (from_c.id,to_c.id) order by id for update;
 perform 1 from public.matches where category_id in (from_c.id,to_c.id) order by id for update;
 if exists (
   select 1 from public.matches
   where category_id in (from_c.id,to_c.id)
     and (status not in ('scheduled','ready') or winner_id is not null or completed_at is not null)
 ) or exists (select 1 from public.results where category_id in (from_c.id,to_c.id)) then
   raise exception 'Cannot transfer after fights start';
 end if;
 select * into p from public.participants where id=p_participant_id;
 if not found then raise exception 'Participant not found'; end if;
 select * into cp from public.category_participants where category_id=p_from_category_id and participant_id=p_participant_id and is_active=true for update;
 if not found then raise exception 'Active participant is not in the source category'; end if;
 target_weight:=cp.weigh_in_weight;
 if target_weight is null or cp.weigh_in_status not in ('in_weight','out_of_weight') then raise exception 'Actual weigh-in weight is required before transfer'; end if;
 if not exists (select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id where t.id=from_c.tournament_id and o.user_id=(select auth.uid())) and (target_weight<coalesce(to_c.weight_min,0) or target_weight>coalesce(to_c.weight_limit,100000)+coalesce(to_c.weight_allowance,0)) then raise exception 'Actual weight is outside the target category'; end if;
 update public.category_participants set is_active=false where category_id=p_from_category_id and participant_id=p_participant_id;
 select * into cp from public.category_participants where category_id=p_to_category_id and participant_id=p_participant_id for update;
 if found then
   update public.category_participants set is_active=true,weigh_in_weight=target_weight,weigh_in_status='in_weight' where category_id=p_to_category_id and participant_id=p_participant_id;
 else
   insert into public.category_participants(category_id,participant_id,is_active,weigh_in_weight,weigh_in_status)
   values(p_to_category_id,p_participant_id,true,target_weight,'in_weight');
 end if;
 return jsonb_build_object('participant_id',p_participant_id,'from_category_id',p_from_category_id,'to_category_id',p_to_category_id,'actual_weight',target_weight,'weigh_in_status','in_weight');
end;
$function$;
create function private.division_start(t public.tournaments,d text)
returns timestamptz language sql immutable set search_path='' as $$
 select coalesce(case d when 'gi' then t.gi_start_at when 'no_gi' then t.no_gi_start_at end,(t.date+t.schedule_start_time) at time zone 'Asia/Almaty');
$$;
CREATE OR REPLACE FUNCTION public.get_public_event_data(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'division',c.division,'age_min',c.age_min,'age_max',c.age_max,'weight_limit',c.weight_limit,'format',b.format,'published',b.published_at is not null) order by c.sort_order,c.id) from public.categories c left join public.brackets b on b.category_id=c.id where c.tournament_id=t.id),'[]'::jsonb),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',trim(concat_ws(' ',p.last_name,p.first_name)),'age',p.age,'weight',p.weight,'city',p.city,'club',p.club,'coach',p.coach,'status',r.status,'category_id',coalesce(c.id,inferred.id)) order by p.last_name,p.first_name) from public.registrations r join public.participants p on p.id=r.participant_id left join public.category_participants cp on cp.participant_id=p.id and cp.is_active and exists(select 1 from public.categories cc where cc.id=cp.category_id and cc.tournament_id=t.id and cc.division=r.division) left join public.categories c on c.id=cp.category_id
 left join lateral(select candidate.id from public.categories candidate where cp.category_id is null and candidate.tournament_id=t.id and candidate.division=r.division
 and (candidate.age_min is null or p.age>=candidate.age_min) and (candidate.age_max is null or p.age<=candidate.age_max)
 and (candidate.weight_min is null or p.weight>=candidate.weight_min) and (candidate.weight_limit is null or p.weight<=candidate.weight_limit+coalesce(candidate.weight_allowance,0))
 order by candidate.weight_limit asc nulls last,candidate.age_min asc nulls last,candidate.sort_order,candidate.id limit 1) inferred on true
 where r.tournament_id=t.id and r.status<>'withdrawn'),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'category_id',m.category_id,'match_number',m.match_number,'round_number',m.round_number,'status',m.status,'participant_a_id',m.participant_a_id,'participant_b_id',m.participant_b_id,'winner_id',m.winner_id,'next_match_id',m.next_match_id,'loser_next_match_id',m.loser_next_match_id,'started_at',m.started_at,'completed_at',m.completed_at,'mat_id',ms.mat_id,'mat_name',ma.name,'scheduled_order',ms.scheduled_order,'approximate_time',ms.approximate_time,'division_start_at',case when cardinality(t.divisions)>0 then private.division_start(t,mc.division) end,'duration_seconds',public.match_duration_seconds(m.id),'victory_method',sc.victory_method,'score_a',sc.score_a,'score_b',sc.score_b) order by m.round_number,m.match_number) from public.matches m join public.categories mc on mc.id=m.category_id join public.brackets b on b.id=m.bracket_id and b.published_at is not null left join public.match_scoreboards sc on sc.match_id=m.id left join public.match_schedule ms on ms.match_id=m.id left join public.mats ma on ma.id=ms.mat_id where m.tournament_id=t.id),'[]'::jsonb),
 'results',coalesce((select jsonb_agg(jsonb_build_object('category_id',r.category_id,'participant_id',r.participant_id,'place',r.place)) from public.results r where r.tournament_id=t.id and not exists(select 1 from public.matches m where m.category_id=r.category_id and m.status not in('completed','cancelled'))),'[]'::jsonb),
 'bout_minutes',t.bout_minutes,'bout_interval_minutes',t.bout_interval_minutes,'athlete_rest_minutes',t.athlete_rest_minutes)
 from public.tournaments t where t.id=p_tournament_id and t.is_public and t.status<>'draft';
$function$;
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
    tournament_id, participant_id, status, payment_status, division
  ) values (
    v_category.tournament_id, v_participant.id, 'confirmed', 'paid', v_category.division
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
$function$;

CREATE OR REPLACE FUNCTION public.refresh_tournament_schedule_times(p_tournament_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tournaments%rowtype; rec record; anchor timestamptz; cursor_at timestamptz; feeder_at timestamptz; rest_at timestamptz; cnt int:=0; pass int; changed boolean; proposed timestamptz; duration interval; gap interval; rest interval;
begin
 if not (private.has_tournament_permission(p_tournament_id,'schedule') or private.has_tournament_permission(p_tournament_id,'running')) then raise exception 'Not authorized';end if;
 select * into t from public.tournaments where id=p_tournament_id for update;
 if private.division_start(t,'') is null and (cardinality(t.divisions)=0 or exists(select 1 from unnest(t.divisions) d where private.division_start(t,d) is null) or exists(select 1 from public.categories c where c.tournament_id=t.id and c.division='')) then raise exception 'Set tournament date and schedule start time first';end if;
 duration:=make_interval(mins=>t.bout_minutes);gap:=make_interval(mins=>t.bout_interval_minutes);rest:=make_interval(mins=>t.athlete_rest_minutes);
 -- Reset unfinished projections; all passes only move times forward from this anchor.
 update public.match_schedule ms set approximate_time=case when m.status='running' then coalesce(m.started_at,greatest(private.division_start(t,c.division),now())) else greatest(private.division_start(t,c.division),now()) end from public.matches m join public.categories c on c.id=m.category_id where m.id=ms.match_id and m.tournament_id=t.id and m.status not in('completed','cancelled');
 -- Relax mat order and feeder edges until stable. Clients show the same projection between server writes.
 for pass in 1..(select count(*)+1 from public.matches where tournament_id=t.id) loop
  changed:=false;
  for rec in select ms.*,m.status,m.started_at,m.participant_a_id,m.participant_b_id,c.division from public.match_schedule ms join public.matches m on m.id=ms.match_id join public.categories c on c.id=m.category_id where m.tournament_id=t.id and m.status not in('completed','cancelled') order by case when m.status='running' then 0 else 1 end,private.division_start(t,c.division),ms.scheduled_order,ms.id loop
   if rec.status='running' then continue;end if;
   anchor:=greatest(private.division_start(t,rec.division),now());
   select max(case when m.status='completed' then m.completed_at+gap when m.status='running' then greatest(m.started_at+make_interval(secs=>public.match_duration_seconds(m.id)),now())+gap else x.approximate_time+make_interval(secs=>public.match_duration_seconds(m.id))+gap end) into cursor_at
    from public.match_schedule x join public.matches m on m.id=x.match_id join public.categories c on c.id=m.category_id where m.tournament_id=t.id and x.mat_id=rec.mat_id and m.status<>'cancelled' and (m.status in('completed','running') or (private.division_start(t,c.division),x.scheduled_order,x.id)<(private.division_start(t,rec.division),rec.scheduled_order,rec.id)) and m.id<>rec.match_id;
   select max(case when m.status='completed' then m.completed_at+rest when m.status='running' then greatest(m.started_at+make_interval(secs=>public.match_duration_seconds(m.id)),now())+rest else x.approximate_time+make_interval(secs=>public.match_duration_seconds(m.id))+rest end) into feeder_at
    from public.matches m left join public.match_schedule x on x.match_id=m.id where m.tournament_id=t.id and (m.next_match_id=rec.match_id or m.loser_next_match_id=rec.match_id);
   select max(case when m.status='completed' then m.completed_at+rest when m.status='running' then greatest(m.started_at+make_interval(secs=>public.match_duration_seconds(m.id)),now())+rest else x.approximate_time+make_interval(secs=>public.match_duration_seconds(m.id))+rest end) into rest_at
    from public.matches m join public.match_schedule x on x.match_id=m.id join public.categories c on c.id=m.category_id where m.tournament_id=t.id and m.status<>'cancelled' and m.id<>rec.match_id and (m.status in('completed','running') or (private.division_start(t,c.division),x.scheduled_order,x.id)<(private.division_start(t,rec.division),rec.scheduled_order,rec.id)) and (m.participant_a_id in(rec.participant_a_id,rec.participant_b_id) or m.participant_b_id in(rec.participant_a_id,rec.participant_b_id));
   proposed:=greatest(anchor,cursor_at,feeder_at,rest_at);
   if proposed>rec.approximate_time then update public.match_schedule set approximate_time=proposed,updated_at=now() where id=rec.id;changed:=true;end if;
  end loop;
  exit when not changed;
 end loop;
 if changed then raise exception 'Schedule order conflicts with bracket dependencies';end if;
 select count(*) into cnt from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=t.id;
 return cnt;
end;$function$;
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
   select m.id,m.category_id,m.next_match_id,m.loser_next_match_id,c.preferred_mat_id from public.matches m
   join public.categories c on c.id=m.category_id
   left join (select category_id,count(*) participant_count from public.category_participants
     where is_active and weigh_in_status='in_weight' group by category_id) cc on cc.category_id=m.category_id
   where m.tournament_id=p_tournament_id and m.status<>'completed'
     and not exists(select 1 from public.match_schedule ms where ms.match_id=m.id)
   order by m.round_number,coalesce(cc.participant_count,0) desc,m.category_id,m.match_number,m.id
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

create function public.save_division_start(p_tournament_id uuid,p_division text,p_date date,p_time time)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_tournament_permission(p_tournament_id,'schedule') then raise exception 'Not authorized'; end if;
 if p_date is null or p_time is null then raise exception 'Date and time are required'; end if;
 if p_division='gi' then
  update public.tournaments set gi_start_at=(p_date+p_time) at time zone 'Asia/Almaty' where id=p_tournament_id and p_division=any(divisions);
 elsif p_division='no_gi' then
  update public.tournaments set no_gi_start_at=(p_date+p_time) at time zone 'Asia/Almaty' where id=p_tournament_id and p_division=any(divisions);
 else raise exception 'Invalid tournament division';
 end if;
 if not found then raise exception 'Invalid tournament division'; end if;
 if exists(select 1 from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=p_tournament_id)
    and exists(select 1 from public.tournaments t where t.id=p_tournament_id and not exists(select 1 from unnest(t.divisions) d where private.division_start(t,d) is null)) then
  perform public.refresh_tournament_schedule_times(p_tournament_id);
 end if;
end;
$$;
revoke all on function public.save_division_start(uuid,text,date,time) from public,anon;
grant execute on function public.save_division_start(uuid,text,date,time) to authenticated;

create function public.add_registration_division(p_registration_id uuid,p_division text)
returns uuid language plpgsql security definer set search_path='' as $$
declare source public.registrations%rowtype; entry_id uuid;
begin
 select * into source from public.registrations where id=p_registration_id;
 if not found or not private.has_tournament_permission(source.tournament_id,'participants') then raise exception 'Not authorized'; end if;
 perform 1 from public.tournaments t where t.id=source.tournament_id and p_division=any(t.divisions) for update;
 if not found then raise exception 'Invalid tournament division'; end if;
 if source.division='' and not exists(
   select 1 from public.category_participants cp join public.categories c on c.id=cp.category_id
   where c.tournament_id=source.tournament_id and c.division='' and cp.participant_id=source.participant_id and cp.is_active
 ) and not exists(
   select 1 from public.matches m where m.tournament_id=source.tournament_id and source.participant_id in (m.participant_a_id,m.participant_b_id)
 ) and not exists(
   select 1 from public.results r where r.tournament_id=source.tournament_id and r.participant_id=source.participant_id
 ) and not exists(
   select 1 from public.registrations r where r.tournament_id=source.tournament_id and r.participant_id=source.participant_id and r.division=p_division
 ) then
  perform set_config('app.tournament_rpc_guard','1',true);
  update public.registrations set division=p_division,status='pending_confirmation',payment_status='unpaid' where id=p_registration_id and division='' returning id into entry_id;
  if found then return entry_id; end if;
 end if;
 insert into public.registrations(tournament_id,participant_id,division,status,payment_status)
 values(source.tournament_id,source.participant_id,p_division,'pending_confirmation','unpaid')
 on conflict(tournament_id,participant_id,division) do nothing returning id into entry_id;
 return entry_id;
end;
$$;
revoke all on function public.add_registration_division(uuid,text) from public,anon;
grant execute on function public.add_registration_division(uuid,text) to authenticated;


create or replace function private.record_match_result(p_match_id uuid,p_winner_id uuid,p_method text,p_score_a integer,p_score_b integer) returns void language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype; secs integer; rounds integer; rest integer;
begin
 select * into m from public.matches where id=p_match_id;
 if auth.uid() is null or not private.has_tournament_permission(m.tournament_id,'running') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=m.tournament_id for update;
 select * into m from public.matches where id=p_match_id for update;
 if p_method is null or p_method not in('points','submission','ko','tko','disqualification','walkover','retirement') then raise exception 'Invalid victory method';end if;
 if exists(select 1 from public.tournaments t where t.id=m.tournament_id and t.victory_methods is not null and not (p_method=any(t.victory_methods))) then raise exception 'Victory method is disabled'; end if;
 if m.status not in('ready','scheduled','running') or (m.status<>'running' and p_method<>'walkover') then raise exception 'Start the match first';end if;
 if p_method='points' and (p_score_a is null or p_score_b is null or p_score_a not between 0 and 999 or p_score_b not between 0 and 999) then raise exception 'Enter both scores';end if;
 -- Existing bracket advancement and medal calculation stay in the original function.
 perform public.record_match_winner(p_match_id,p_winner_id);
 select coalesce(c.round_seconds,t.bout_minutes*60),coalesce(c.round_count,1),coalesce(c.round_rest_seconds,0) into secs,rounds,rest from public.categories c join public.tournaments t on t.id=c.tournament_id where c.id=m.category_id;
 insert into public.match_scoreboards(match_id,tournament_id,round_seconds,round_count,rest_seconds,remaining_ms,score_a,score_b,victory_method) values(m.id,m.tournament_id,secs,rounds,rest,secs*1000,coalesce(p_score_a,0),coalesce(p_score_b,0),p_method)
 on conflict(match_id) do update set victory_method=p_method,score_a=coalesce(p_score_a,public.match_scoreboards.score_a),score_b=coalesce(p_score_b,public.match_scoreboards.score_b),remaining_ms=greatest(0,public.match_scoreboards.remaining_ms-case when public.match_scoreboards.timer_started_at is null then 0 else greatest(0,floor(extract(epoch from(clock_timestamp()-public.match_scoreboards.timer_started_at))*1000)::integer) end),timer_started_at=null,version=public.match_scoreboards.version+1,updated_at=clock_timestamp();
end;$$;

CREATE OR REPLACE FUNCTION public.get_public_tournament_results_detailed(p_tournament_id uuid)
 RETURNS TABLE(category_id uuid, category_name text, place integer, athlete_name text, age integer, club text, coach text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.category_id,case c.division when 'gi' then 'Gi · ' || c.name when 'no_gi' then 'No-Gi · ' || c.name else c.name end,r.place,trim(concat_ws(' ',p.last_name,p.first_name)),p.age,p.club,p.coach
  from public.results r
    join public.categories c on c.id=r.category_id
    join public.tournaments t on t.id=r.tournament_id and t.id=p_tournament_id
      and t.is_public and t.status<>'draft'
    join public.participants p on p.id=r.participant_id
  where c.tournament_id=t.id and not exists(select 1 from public.matches m where m.category_id=c.id and m.status not in ('completed','cancelled'))
  order by c.sort_order,c.id,r.place,4;
$function$;

create function public.copy_division_categories(p_tournament_id uuid,p_from text,p_to text)
returns integer language plpgsql security definer set search_path='' as $$
declare copied integer;
begin
 if not private.has_tournament_permission(p_tournament_id,'categories') then raise exception 'Not authorized'; end if;
 if p_from=p_to or p_from not in ('gi','no_gi') or p_to not in ('gi','no_gi') then raise exception 'Invalid tournament division'; end if;
 perform 1 from public.tournaments where id=p_tournament_id and array[p_from,p_to]<@divisions for update;
 if not found then raise exception 'Invalid tournament division'; end if;
 insert into public.categories(tournament_id,division,name,age_min,age_max,weight_min,weight_limit,weight_allowance,sort_order,bracket_format,round_seconds,round_count,round_rest_seconds)
 select tournament_id,p_to,name,age_min,age_max,weight_min,weight_limit,weight_allowance,sort_order,bracket_format,round_seconds,round_count,round_rest_seconds
 from public.categories c
 where c.tournament_id=p_tournament_id and c.division=p_from
 and not exists(select 1 from public.categories target where target.tournament_id=c.tournament_id and target.division=p_to
   and target.age_min is not distinct from c.age_min and target.age_max is not distinct from c.age_max
   and target.weight_min is not distinct from c.weight_min and target.weight_limit is not distinct from c.weight_limit);
 get diagnostics copied=row_count;
 return copied;
end;
$$;
revoke all on function public.copy_division_categories(uuid,text,text) from public,anon;
grant execute on function public.copy_division_categories(uuid,text,text) to authenticated;

create function private.guard_tournament_divisions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.categories c where c.tournament_id=new.id and c.division<>'' and not (c.division=any(new.divisions)))
    or exists(select 1 from public.registrations r where r.tournament_id=new.id and r.division<>'' and not (r.division=any(new.divisions)))
 then raise exception 'This division already has categories or registrations'; end if;
 return new;
end;
$$;
revoke all on function private.guard_tournament_divisions() from public,anon,authenticated;
create trigger guard_tournament_divisions before update of divisions on public.tournaments
 for each row when (old.divisions is distinct from new.divisions)
 execute function private.guard_tournament_divisions();

create function private.guard_division_entry()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.division<>'' then
  perform 1 from public.tournaments t where t.id=new.tournament_id and new.division=any(t.divisions) for update;
  if not found then raise exception 'Invalid tournament division'; end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_division_entry() from public,anon,authenticated;
create trigger guard_category_division before insert or update of tournament_id,division on public.categories
 for each row execute function private.guard_division_entry();
create trigger guard_registration_division before insert or update of tournament_id,division on public.registrations
 for each row execute function private.guard_division_entry();

create function private.guard_category_division_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare target public.categories%rowtype;
begin
 if not new.is_active then return new; end if;
 select * into target from public.categories where id=new.category_id;
 if target.division='' then return new; end if;
 perform 1 from public.tournaments where id=target.tournament_id for update;
 if not exists(select 1 from public.registrations where tournament_id=target.tournament_id and participant_id=new.participant_id and division=target.division)
 then raise exception 'Registration for this division is required'; end if;
 if exists(select 1 from public.category_participants cp join public.categories c on c.id=cp.category_id
  where cp.participant_id=new.participant_id and cp.is_active and c.tournament_id=target.tournament_id and c.division=target.division and cp.category_id<>new.category_id)
 then raise exception 'Athlete already has a category in this division'; end if;
 return new;
end;
$$;
revoke all on function private.guard_category_division_assignment() from public,anon,authenticated;
create trigger guard_category_division_assignment before insert or update of is_active,category_id,participant_id on public.category_participants
 for each row execute function private.guard_category_division_assignment();

create function public.update_division_category_limits(p_category_id uuid,p_name text,p_age_min integer,p_age_max integer,p_weight_min numeric,p_weight_limit numeric,p_allowance numeric)
returns void language plpgsql security definer set search_path='' as $$
declare category public.categories%rowtype;
begin
 select * into category from public.categories where id=p_category_id;
 if not found or category.division='' or not private.has_tournament_permission(category.tournament_id,'categories')
 then raise exception 'Not authorized'; end if;
 perform 1 from public.tournaments where id=category.tournament_id for update;
 if p_age_min<1 or p_age_max<p_age_min or num_nonnulls(p_weight_min,p_weight_limit)<>1
    or coalesce(p_weight_min,p_weight_limit)<=0 or p_allowance<0 then raise exception 'Invalid age or weight'; end if;
 if exists(select 1 from public.brackets where category_id=category.id)
    or exists(select 1 from public.category_participants where category_id=category.id and is_active and weigh_in_weight is not null)
 then raise exception 'Cannot change category limits after weigh-in or brackets'; end if;
 update public.categories set name=p_name,age_min=p_age_min,age_max=p_age_max,weight_min=p_weight_min,weight_limit=p_weight_limit,weight_allowance=p_allowance
 where id=category.id;
end;
$$;
revoke all on function public.update_division_category_limits(uuid,text,integer,integer,numeric,numeric,numeric) from public,anon;
grant execute on function public.update_division_category_limits(uuid,text,integer,integer,numeric,numeric,numeric) to authenticated;
CREATE OR REPLACE FUNCTION public.set_category_weigh_in(p_category_id uuid, p_participant_id uuid, p_actual_weight numeric, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.categories%rowtype;
  cp public.category_participants%rowtype;
  final_status text;
  within_weight boolean;
begin
  select * into c from public.categories where id=p_category_id;
  if not found then raise exception 'Category not found'; end if;
  if not private.has_tournament_permission(c.tournament_id,'weigh_in') then raise exception 'Not authorized'; end if; perform set_config('app.tournament_rpc_guard', '1', true);
  if c.division<>'' then
    perform 1 from public.tournaments where id=c.tournament_id for update;
    select * into c from public.categories where id=p_category_id;
    if not found then raise exception 'Category not found'; end if;
  end if;
  if p_status not in('in_weight','out_of_weight') then raise exception 'Invalid weigh-in status'; end if;
  if p_actual_weight is null or p_actual_weight<=0 then raise exception 'Actual weight is required'; end if;
  select * into cp from public.category_participants where category_id=p_category_id and participant_id=p_participant_id and is_active=true for update;
  if not found then raise exception 'Active participant is not in this category'; end if;

  within_weight := p_actual_weight >= coalesce(c.weight_min, 0)
    and p_actual_weight <= coalesce(c.weight_limit, 100000) + coalesce(c.weight_allowance, 0);
  final_status := case when within_weight then p_status else 'out_of_weight' end;

  update public.category_participants
  set weigh_in_weight=p_actual_weight,weigh_in_status=final_status
  where category_id=p_category_id and participant_id=p_participant_id;

  return jsonb_build_object('participant_id',p_participant_id,'category_id',p_category_id,'actual_weight',p_actual_weight,'weigh_in_status',final_status,'within_limit',final_status='in_weight');
end;
$function$;
