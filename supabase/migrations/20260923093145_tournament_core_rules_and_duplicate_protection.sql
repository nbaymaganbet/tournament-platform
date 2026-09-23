CREATE OR REPLACE FUNCTION private.build_bracket_group(p_bracket_id uuid, p_tournament_id uuid, p_category_id uuid, p_ids uuid[], p_round_base integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  n integer := coalesce(array_length(p_ids,1),0);
  left_n integer;
  left_ids uuid[];
  right_ids uuid[];
  l jsonb;
  r jsonb;
  lid uuid;
  rid uuid;
  fid uuid;
  mid uuid;
  ln integer;
  rn integer;
  next_no integer;
begin
  if n=0 then raise exception 'Empty bracket group'; end if;
  if n=1 then
    return jsonb_build_object('kind','participant','id',p_ids[1],'depth',0);
  end if;

  if n=2 then
    select coalesce(max(match_number),0)+1 into next_no
    from public.matches where bracket_id=p_bracket_id;
    insert into public.matches(
      bracket_id,tournament_id,category_id,round_number,match_number,status,
      participant_a_id,participant_b_id
    ) values (
      p_bracket_id,p_tournament_id,p_category_id,p_round_base,next_no,'scheduled',
      p_ids[1],p_ids[2]
    ) returning id into mid;
    return jsonb_build_object('kind','match','id',mid,'depth',1);
  end if;

  if n=3 then
    -- The first participant is the BYE. The other two fight first.
    select coalesce(max(match_number),0)+1 into next_no
    from public.matches where bracket_id=p_bracket_id;
    insert into public.matches(
      bracket_id,tournament_id,category_id,round_number,match_number,status,
      participant_a_id,participant_b_id
    ) values (
      p_bracket_id,p_tournament_id,p_category_id,p_round_base,next_no,'scheduled',
      p_ids[2],p_ids[3]
    ) returning id into mid;

    select coalesce(max(match_number),0)+1 into next_no
    from public.matches where bracket_id=p_bracket_id;
    insert into public.matches(
      bracket_id,tournament_id,category_id,round_number,match_number,status,
      participant_a_id
    ) values (
      p_bracket_id,p_tournament_id,p_category_id,p_round_base+1,next_no,'scheduled',
      p_ids[1]
    ) returning id into fid;

    update public.matches
    set next_match_id=fid, updated_at=now()
    where id=mid;

    return jsonb_build_object('kind','match','id',fid,'depth',2);
  end if;

  left_n := ceil(n/2.0)::integer;
  left_ids := p_ids[1:left_n];
  right_ids := p_ids[left_n+1:n];

  l := private.build_bracket_group(
    p_bracket_id,p_tournament_id,p_category_id,left_ids,p_round_base
  );
  r := private.build_bracket_group(
    p_bracket_id,p_tournament_id,p_category_id,right_ids,p_round_base
  );

  lid := (l->>'id')::uuid;
  rid := (r->>'id')::uuid;
  ln := (l->>'depth')::integer;
  rn := (r->>'depth')::integer;

  select coalesce(max(match_number),0)+1 into next_no
  from public.matches where bracket_id=p_bracket_id;
  insert into public.matches(
    bracket_id,tournament_id,category_id,round_number,match_number,status
  ) values (
    p_bracket_id,p_tournament_id,p_category_id,
    p_round_base+greatest(ln,rn)+1,next_no,'scheduled'
  ) returning id into fid;

  if l->>'kind'='participant' then
    update public.matches set participant_a_id=lid,updated_at=now() where id=fid;
  else
    update public.matches set next_match_id=fid,updated_at=now() where id=lid;
  end if;

  if r->>'kind'='participant' then
    update public.matches set participant_b_id=rid,updated_at=now() where id=fid;
  else
    update public.matches set next_match_id=fid,updated_at=now() where id=rid;
  end if;

  return jsonb_build_object('kind','match','id',fid,'depth',greatest(ln,rn)+1);
end;
$function$


CREATE OR REPLACE FUNCTION private.is_organizer_of_tournament(tournament_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (select auth.uid()) is not null and (
    exists (
      select 1 from public.organizers o
      join public.tournaments t on t.organizer_id=o.id
      where o.user_id=(select auth.uid()) and t.id=tournament_uuid
    )
    or exists (
      select 1 from public.tournament_members tm
      where tm.user_id=(select auth.uid()) and tm.tournament_id=tournament_uuid
    )
  );
$function$


CREATE OR REPLACE FUNCTION private.reject_duplicate_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if exists(
    select 1
    from public.registrations r
    join public.participants p on p.id=r.participant_id
    join public.participants np on np.id=new.participant_id
    where r.tournament_id=new.tournament_id
      and r.participant_id<>new.participant_id
      and lower(trim(p.first_name))=lower(trim(np.first_name))
      and lower(trim(p.last_name))=lower(trim(np.last_name))
      and p.age=np.age
      and regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')
          = regexp_replace(coalesce(np.phone,''),'[^0-9]','','g')
  ) then
    raise exception 'Duplicate registration: participant is already registered for this tournament';
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_single_elimination_bracket(p_category_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
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
  if not private.is_organizer_of_tournament(c.tournament_id) then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.brackets where category_id=p_category_id) then
    raise exception 'Bracket already exists';
  end if;

  select array_agg(cp.participant_id order by cp.weigh_in_weight asc nulls last, rg.created_at asc, cp.participant_id),
         count(*)
  into ids,n
  from public.category_participants cp
  join public.registrations rg
    on rg.tournament_id=c.tournament_id and rg.participant_id=cp.participant_id
  where cp.category_id=p_category_id
    and cp.is_active=true
    and cp.weigh_in_status='in_weight'
    and rg.status='confirmed'
    and rg.payment_status='paid';

  if coalesce(n,0)<2 then
    raise exception 'At least 2 paid, confirmed and weighed-in participants are required';
  end if;

  insert into public.brackets(category_id,format,status)
  values(p_category_id,'single_elimination','draft')
  returning id into b_id;

  -- For every odd group, the lightest participant is deliberately placed
  -- into the odd-sized side so the n=3 leaf rule gives that participant the BYE.
  if n=3 then
    left_ids := ids;
    left_json := private.build_bracket_group(b_id,c.tournament_id,p_category_id,left_ids,1);
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
$function$


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
  if p_winner_id is null or p_winner_id not in (m.participant_a_id,m.participant_b_id) then
    raise exception 'Winner must be one of the match participants';
  end if;

  loser_id := case
    when m.participant_a_id=p_winner_id then m.participant_b_id
    else m.participant_a_id
  end;

  update public.matches
  set winner_id=p_winner_id,status='completed',completed_at=now(),updated_at=now()
  where id=m.id;

  if m.next_match_id is not null then
    select * into next_m from public.matches where id=m.next_match_id for update;
    update public.matches
    set participant_a_id=case
      when participant_a_id is null then p_winner_id else participant_a_id end,
        participant_b_id=case
      when participant_a_id is not null and participant_b_id is null then p_winner_id
      else participant_b_id end,
        updated_at=now()
    where id=m.next_match_id;
  end if;

  if m.loser_next_match_id is not null and loser_id is not null then
    update public.matches
    set participant_a_id=case
      when participant_a_id is null then loser_id else participant_a_id end,
        participant_b_id=case
      when participant_a_id is not null and participant_b_id is null then loser_id
      else participant_b_id end,
        updated_at=now()
    where id=m.loser_next_match_id;
  end if;

  -- Dedicated 3-person flow: first fight is between the two non-BYE athletes;
  -- the BYE athlete is already in the second fight.
  if exists(
    select 1 from public.matches x
    where x.bracket_id=m.bracket_id
      and x.round_number=1
      and x.match_number=1
  ) and exists(
    select 1 from public.matches x
    where x.bracket_id=m.bracket_id
      and x.round_number=2
      and x.next_match_id is null
  ) and (
    select count(*) from public.category_participants cp
    where cp.category_id=m.category_id and cp.is_active=true
      and cp.weigh_in_status='in_weight'
  )=3 then
    select * into first_m
    from public.matches
    where bracket_id=m.bracket_id and round_number=1
    order by match_number limit 1;

    select * into final_m
    from public.matches
    where bracket_id=m.bracket_id and round_number=2
    order by match_number limit 1;

    if final_m.id=m.id and first_m.status='completed' then
      bye_id := case
        when final_m.participant_a_id=first_m.participant_a_id
          or final_m.participant_a_id=first_m.participant_b_id
        then final_m.participant_a_id
        else final_m.participant_b_id
      end;
      first_winner := first_m.winner_id;

      if p_winner_id=bye_id then
        insert into public.results(tournament_id,category_id,participant_id,place)
        values(m.tournament_id,m.category_id,p_winner_id,1)
        on conflict(category_id,participant_id) do update set place=excluded.place;
        insert into public.results(tournament_id,category_id,participant_id,place)
        values(m.tournament_id,m.category_id,first_winner,2)
        on conflict(category_id,participant_id) do update set place=excluded.place;
        insert into public.results(tournament_id,category_id,participant_id,place)
        values(m.tournament_id,m.category_id,loser_id,3)
        on conflict(category_id,participant_id) do update set place=excluded.place;
      else
        insert into public.results(tournament_id,category_id,participant_id,place)
        values(m.tournament_id,m.category_id,first_winner,1)
        on conflict(category_id,participant_id) do update set place=excluded.place;
        insert into public.results(tournament_id,category_id,participant_id,place)
        values(m.tournament_id,m.category_id,p_winner_id,2)
        on conflict(category_id,participant_id) do update set place=excluded.place;
        insert into public.results(tournament_id,category_id,participant_id,place)
        values(m.tournament_id,m.category_id,bye_id,3)
        on conflict(category_id,participant_id) do update set place=excluded.place;
      end if;
      return;
    end if;
  end if;

  select * into final_m
  from public.matches
  where bracket_id=m.bracket_id
    and next_match_id is null
    and loser_next_match_id is null
    and participant_a_id is not null
    and participant_b_id is not null
  order by round_number desc,match_number asc
  limit 1;

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
    and next_match_id is null
    and loser_next_match_id is null
  order by round_number desc,match_number asc
  limit 1;

  if third_m.id=m.id then
    insert into public.results(tournament_id,category_id,participant_id,place)
    values(m.tournament_id,m.category_id,m.winner_id,3)
    on conflict(category_id,participant_id) do update set place=excluded.place;
  end if;
end;
$function$


CREATE OR REPLACE FUNCTION public.transfer_category_participant(p_from_category_id uuid, p_to_category_id uuid, p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
  from_c public.categories%rowtype;
  to_c public.categories%rowtype;
  p public.participants%rowtype;
  cp public.category_participants%rowtype;
  target_weight numeric;
  target_status text;
begin
  select * into from_c from public.categories where id=p_from_category_id;
  select * into to_c from public.categories where id=p_to_category_id;
  if not found or from_c.id is null then raise exception 'Source category not found'; end if;
  if to_c.id is null then raise exception 'Target category not found'; end if;
  if from_c.tournament_id<>to_c.tournament_id then raise exception 'Categories must belong to the same tournament'; end if;
  if from_c.id=to_c.id then raise exception 'Choose another category'; end if;
  if not private.is_organizer_of_tournament(from_c.tournament_id) then raise exception 'Not authorized'; end if;

  select * into p from public.participants where id=p_participant_id;
  if not found then raise exception 'Participant not found'; end if;

  if to_c.age_min is not null and p.age < to_c.age_min then
    raise exception 'Participant age is outside the target category';
  end if;
  if to_c.age_max is not null and p.age > to_c.age_max then
    raise exception 'Participant age is outside the target category';
  end if;

  select * into cp
  from public.category_participants
  where category_id=p_from_category_id and participant_id=p_participant_id and is_active=true
  for update;
  if not found then raise exception 'Active participant is not in the source category'; end if;

  target_weight := cp.weigh_in_weight;
  if target_weight is null then raise exception 'Actual weigh-in weight is required before transfer'; end if;

  if target_weight < coalesce(to_c.weight_min,0)
     or target_weight > coalesce(to_c.weight_limit,100000)+coalesce(to_c.weight_allowance,0) then
    raise exception 'Actual weight is outside the target category';
  end if;

  update public.category_participants
  set is_active=false, updated_at=now()
  where category_id=p_from_category_id and participant_id=p_participant_id;

  select * into cp
  from public.category_participants
  where category_id=p_to_category_id and participant_id=p_participant_id
  for update;

  if found then
    update public.category_participants
    set is_active=true,
        weigh_in_weight=target_weight,
        weigh_in_status='in_weight',
        updated_at=now()
    where category_id=p_to_category_id and participant_id=p_participant_id;
  else
    insert into public.category_participants(
      category_id,participant_id,is_active,weigh_in_weight,weigh_in_status
    ) values(
      p_to_category_id,p_participant_id,true,target_weight,'in_weight'
    );
  end if;

  return jsonb_build_object(
    'participant_id',p_participant_id,
    'from_category_id',p_from_category_id,
    'to_category_id',p_to_category_id,
    'actual_weight',target_weight,
    'weigh_in_status','in_weight'
  );
end;
$function$
;

DROP TRIGGER IF EXISTS prevent_duplicate_registration ON public.registrations;
CREATE TRIGGER prevent_duplicate_registration BEFORE INSERT ON public.registrations FOR EACH ROW EXECUTE FUNCTION private.reject_duplicate_registration();
