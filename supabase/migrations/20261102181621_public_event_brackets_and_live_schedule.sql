alter table public.brackets add column published_at timestamptz;
-- Preserve the visibility of existing brackets; new brackets require publication.
update public.brackets set published_at=now();
alter table public.matches add column started_at timestamptz;
alter table public.tournaments add column bout_minutes integer not null default 5 check(bout_minutes between 1 and 120);
alter table public.tournaments add column bout_interval_minutes integer not null default 0 check(bout_interval_minutes between 0 and 60);
alter table public.tournaments add column athlete_rest_minutes integer not null default 5 check(athlete_rest_minutes between 0 and 120);

create or replace function private.seed_key(value text) returns text language sql immutable set search_path='' as $$
 select nullif(regexp_replace(lower(trim(value)),'[[:space:][:punct:]]','','g'),'');
$$;
create or replace function private.seed_group(ids uuid[]) returns uuid[] language plpgsql set search_path='' as $$
declare n int:=cardinality(ids); left_n int; left_ids uuid[]:='{}'; right_ids uuid[]:='{}';
 p record; q record; lcost numeric[]; rcost numeric[]; best numeric[]; cost numeric[]; pair uuid[]; bye uuid;
 lc int; rc int; le numeric; re numeric; ex numeric; a uuid; b uuid;
begin
 if n<=2 then return ids; end if;
 if n=3 then
  for p in select x.id,x.city,x.club,x.experience,x.coach from public.participants x where x.id=any(ids) order by array_position(ids,x.id) loop
   for q in select x.* from public.participants x where x.id=any(ids) and array_position(ids,x.id)>array_position(ids,p.id) order by array_position(ids,x.id) loop
    cost:=array[
     case when private.seed_key(p.city)=private.seed_key(q.city) then 1 else 0 end,
     case when private.seed_key(p.club)=private.seed_key(q.club) then 1 else 0 end,
     case when p.experience is null or q.experience is null then 0
       when regexp_match(p.experience,'[0-9]+(?:[.][0-9]+)?') is not null and regexp_match(q.experience,'[0-9]+(?:[.][0-9]+)?') is not null
       then abs((regexp_match(p.experience,'[0-9]+(?:[.][0-9]+)?'))[1]::numeric-(regexp_match(q.experience,'[0-9]+(?:[.][0-9]+)?'))[1]::numeric)
       when private.seed_key(p.experience)=private.seed_key(q.experience) then 0 else 1 end,
     case when private.seed_key(p.coach)=private.seed_key(q.coach) then 1 else 0 end]::numeric[];
    if best is null or cost<best then best:=cost;pair:=array[p.id,q.id];end if;
   end loop;
  end loop;
  select x into bye from unnest(ids) x where x<>all(pair);
  return array[bye]||pair;
 end if;
 left_n:=ceil(n/2.0)::int;
 -- Largest city/club groups first, with registration order as the stable tie-break.
 for p in select x.* from public.participants x where x.id=any(ids)
  order by (select count(*) from public.participants y where y.id=any(ids) and private.seed_key(y.city)=private.seed_key(x.city)) desc,
  (select count(*) from public.participants y where y.id=any(ids) and private.seed_key(y.club)=private.seed_key(x.club)) desc,
  array_position(ids,x.id)
 loop
  if cardinality(left_ids)>=left_n then right_ids:=array_append(right_ids,p.id);continue;end if;
  if cardinality(right_ids)>=n-left_n then left_ids:=array_append(left_ids,p.id);continue;end if;
  lcost:=array[(select count(*) from public.participants y where y.id=any(left_ids) and private.seed_key(y.city)=private.seed_key(p.city)),
   (select count(*) from public.participants y where y.id=any(left_ids) and private.seed_key(y.club)=private.seed_key(p.club)),
   coalesce((select min(abs((regexp_match(y.experience,'[0-9]+(?:[.][0-9]+)?'))[1]::numeric-(regexp_match(p.experience,'[0-9]+(?:[.][0-9]+)?'))[1]::numeric)) from public.participants y where y.id=any(left_ids)),0),
   (select count(*) from public.participants y where y.id=any(left_ids) and private.seed_key(y.coach)=private.seed_key(p.coach)),cardinality(left_ids)]::numeric[];
  rcost:=array[(select count(*) from public.participants y where y.id=any(right_ids) and private.seed_key(y.city)=private.seed_key(p.city)),
   (select count(*) from public.participants y where y.id=any(right_ids) and private.seed_key(y.club)=private.seed_key(p.club)),
   coalesce((select min(abs((regexp_match(y.experience,'[0-9]+(?:[.][0-9]+)?'))[1]::numeric-(regexp_match(p.experience,'[0-9]+(?:[.][0-9]+)?'))[1]::numeric)) from public.participants y where y.id=any(right_ids)),0),
   (select count(*) from public.participants y where y.id=any(right_ids) and private.seed_key(y.coach)=private.seed_key(p.coach)),cardinality(right_ids)]::numeric[];
  if lcost<=rcost then left_ids:=array_append(left_ids,p.id);else right_ids:=array_append(right_ids,p.id);end if;
 end loop;
 left_ids:=private.seed_group(left_ids);right_ids:=private.seed_group(right_ids);
 if mod(n,2)=1 and mod(left_n,2)=0 then return right_ids||left_ids;end if;
 return left_ids||right_ids;
end;$$;
revoke all on function private.seed_key(text),private.seed_group(uuid[]) from public,anon,authenticated;


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
      on rg.tournament_id=t.id and rg.participant_id=cp.participant_id
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
    on rg.tournament_id=c.tournament_id and rg.participant_id=cp.participant_id
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


CREATE OR REPLACE FUNCTION public.get_public_category_bracket(p_tournament_id uuid, p_category_id uuid)
 RETURNS TABLE(id uuid, match_number integer, round_number integer, status text, participant_a_name text, participant_b_name text, next_match_number integer, next_match_id uuid, loser_next_match_id uuid, has_winner boolean, participant_a_is_bye boolean, participant_b_is_bye boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id,m.match_number,m.round_number,m.status,
    nullif(concat_ws(' ',a.first_name,a.last_name),'') as participant_a_name,
    nullif(concat_ws(' ',b.first_name,b.last_name),'') as participant_b_name,
    next_match.match_number,m.next_match_id,m.loser_next_match_id,m.winner_id is not null,
    m.participant_a_id is not null and m.round_number>1 and not exists (
      select 1 from public.matches prev where prev.category_id=m.category_id
        and prev.round_number<m.round_number
        and m.participant_a_id in (prev.participant_a_id,prev.participant_b_id)
    ),
    m.participant_b_id is not null and m.round_number>1 and not exists (
      select 1 from public.matches prev where prev.category_id=m.category_id
        and prev.round_number<m.round_number
        and m.participant_b_id in (prev.participant_a_id,prev.participant_b_id)
    )
  from public.matches m
  join public.brackets published on published.id=m.bracket_id and published.published_at is not null
  join public.categories c on c.id=m.category_id and c.tournament_id=p_tournament_id
  join public.tournaments t on t.id=c.tournament_id and t.is_public=true and t.status<>'draft'
  left join public.participants a on a.id=m.participant_a_id
  left join public.participants b on b.id=m.participant_b_id
  left join public.matches next_match on next_match.id=m.next_match_id
  where m.tournament_id=p_tournament_id and m.category_id=p_category_id
  order by m.round_number,m.match_number;
$function$;


CREATE OR REPLACE FUNCTION public.get_public_category_format(p_tournament_id uuid, p_category_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.format from public.brackets b join public.categories c on c.id=b.category_id
    join public.tournaments t on t.id=c.tournament_id
  where t.id=p_tournament_id and c.id=p_category_id and t.is_public and t.status<>'draft' and b.published_at is not null;
$function$;


CREATE OR REPLACE FUNCTION public.get_public_tournament_results_detailed(p_tournament_id uuid)
 RETURNS TABLE(category_id uuid, category_name text, place integer, athlete_name text, age integer, club text, coach text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.category_id,c.name,r.place,trim(concat_ws(' ',p.last_name,p.first_name)),p.age,p.club,p.coach
  from public.results r
    join public.categories c on c.id=r.category_id
    join public.tournaments t on t.id=r.tournament_id and t.id=p_tournament_id
      and t.is_public and t.status<>'draft'
    join public.participants p on p.id=r.participant_id
  where c.tournament_id=t.id and not exists(select 1 from public.matches m where m.category_id=c.id and m.status not in ('completed','cancelled'))
  order by c.sort_order,c.id,r.place,4;
$function$;


create or replace function public.publish_category_bracket(p_category_id uuid) returns void language plpgsql set search_path='' as $$
begin perform private.publish_category_bracket(p_category_id);end;$$;
create or replace function private.publish_category_bracket(p_category_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 select tournament_id into tid from public.categories where id=p_category_id;
 if auth.uid() is null or not private.has_tournament_permission(tid,'brackets') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=tid for update;
 update public.brackets set published_at=coalesce(published_at,now()) where category_id=p_category_id;
 if not found then raise exception 'Bracket not found';end if;
end;$$;
revoke all on function private.publish_category_bracket(uuid) from public,anon;
grant execute on function private.publish_category_bracket(uuid) to authenticated;
revoke all on function public.publish_category_bracket(uuid) from public,anon;
grant execute on function public.publish_category_bracket(uuid) to authenticated;

create or replace function public.get_public_event_data(p_tournament_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'age_min',c.age_min,'age_max',c.age_max,'weight_limit',c.weight_limit,'format',b.format,'published',b.published_at is not null) order by c.sort_order,c.id) from public.categories c left join public.brackets b on b.category_id=c.id where c.tournament_id=t.id),'[]'::jsonb),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',trim(concat_ws(' ',p.last_name,p.first_name)),'age',p.age,'weight',p.weight,'city',p.city,'club',p.club,'coach',p.coach,'status',r.status,'category_id',c.id) order by p.last_name,p.first_name) from public.registrations r join public.participants p on p.id=r.participant_id left join public.category_participants cp on cp.participant_id=p.id and cp.is_active and exists(select 1 from public.categories cc where cc.id=cp.category_id and cc.tournament_id=t.id) left join public.categories c on c.id=cp.category_id where r.tournament_id=t.id and r.status<>'withdrawn'),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'category_id',m.category_id,'match_number',m.match_number,'round_number',m.round_number,'status',m.status,'participant_a_id',m.participant_a_id,'participant_b_id',m.participant_b_id,'winner_id',m.winner_id,'next_match_id',m.next_match_id,'loser_next_match_id',m.loser_next_match_id,'started_at',m.started_at,'completed_at',m.completed_at,'mat_id',ms.mat_id,'mat_name',ma.name,'scheduled_order',ms.scheduled_order,'approximate_time',ms.approximate_time) order by m.round_number,m.match_number) from public.matches m join public.brackets b on b.id=m.bracket_id and b.published_at is not null left join public.match_schedule ms on ms.match_id=m.id left join public.mats ma on ma.id=ms.mat_id where m.tournament_id=t.id),'[]'::jsonb),
 'results',coalesce((select jsonb_agg(jsonb_build_object('category_id',r.category_id,'participant_id',r.participant_id,'place',r.place)) from public.results r where r.tournament_id=t.id and not exists(select 1 from public.matches m where m.category_id=r.category_id and m.status not in('completed','cancelled'))),'[]'::jsonb),
 'bout_minutes',t.bout_minutes,'bout_interval_minutes',t.bout_interval_minutes,'athlete_rest_minutes',t.athlete_rest_minutes)
 from public.tournaments t where t.id=p_tournament_id and t.is_public and t.status<>'draft';
$$;
revoke all on function public.get_public_event_data(uuid) from public;
grant execute on function public.get_public_event_data(uuid) to anon,authenticated;

drop policy "public read published matches" on public.matches;
create policy "public read published matches" on public.matches for select to anon,authenticated using(exists(select 1 from public.brackets b join public.categories c on c.id=b.category_id join public.tournaments t on t.id=c.tournament_id where b.id=matches.bracket_id and b.published_at is not null and t.is_public and t.status<>'draft'));
drop policy "public read published brackets" on public.brackets;
create policy "public read published brackets" on public.brackets for select to anon,authenticated using(published_at is not null and exists(select 1 from public.categories c join public.tournaments t on t.id=c.tournament_id where c.id=brackets.category_id and t.is_public and t.status<>'draft'));

create or replace function public.bracket_roster_alert(p_tournament_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id where t.id=p_tournament_id and o.user_id=auth.uid()) and exists(
 select 1 from public.categories c join public.brackets b on b.category_id=c.id join public.category_participants cp on cp.category_id=c.id and cp.is_active and cp.weigh_in_status='in_weight' join public.registrations r on r.participant_id=cp.participant_id and r.tournament_id=c.tournament_id and r.status='confirmed' and r.payment_status='paid'
 where c.tournament_id=p_tournament_id and not exists(select 1 from public.matches m where m.bracket_id=b.id and cp.participant_id in(m.participant_a_id,m.participant_b_id)));
$$;
revoke all on function public.bracket_roster_alert(uuid) from public,anon;
grant execute on function public.bracket_roster_alert(uuid) to authenticated;


create or replace function public.generate_checked_bracket(p_category_id uuid,p_without_unweighed boolean default false) returns uuid language plpgsql set search_path='' as $$
begin return private.generate_checked_bracket(p_category_id,p_without_unweighed);end;$$;
create or replace function private.generate_checked_bracket(p_category_id uuid,p_without_unweighed boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 select tournament_id into tid from public.categories where id=p_category_id;
 if auth.uid() is null or not private.has_tournament_permission(tid,'brackets') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=tid for update;
 if not p_without_unweighed and exists(select 1 from public.category_participants cp join public.registrations r on r.participant_id=cp.participant_id and r.tournament_id=tid where cp.category_id=p_category_id and cp.is_active and cp.weigh_in_status<>'in_weight' and r.status='confirmed') then raise exception 'Unweighed athletes require explicit confirmation';end if;
 return public.generate_single_elimination_bracket(p_category_id);
end;$$;
revoke all on function private.generate_checked_bracket(uuid,boolean),public.generate_checked_bracket(uuid,boolean) from public,anon;
grant execute on function private.generate_checked_bracket(uuid,boolean),public.generate_checked_bracket(uuid,boolean) to authenticated;


CREATE OR REPLACE FUNCTION public.generate_tournament_schedule(p_tournament_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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


create or replace function public.refresh_tournament_schedule_times(p_tournament_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare t public.tournaments%rowtype; rec record; base timestamptz; cursor_at timestamptz; feeder_at timestamptz; rest_at timestamptz; cnt int:=0; pass int; changed boolean; proposed timestamptz; duration interval; gap interval; rest interval;
begin
 if not (private.has_tournament_permission(p_tournament_id,'schedule') or private.has_tournament_permission(p_tournament_id,'running')) then raise exception 'Not authorized';end if;
 select * into t from public.tournaments where id=p_tournament_id for update;
 if t.date is null or t.schedule_start_time is null then raise exception 'Set tournament date and schedule start time first';end if;
 base:=(t.date+t.schedule_start_time) at time zone 'Asia/Almaty';
 duration:=make_interval(mins=>t.bout_minutes);gap:=make_interval(mins=>t.bout_interval_minutes);rest:=make_interval(mins=>t.athlete_rest_minutes);
 if exists(select 1 from public.matches where tournament_id=t.id and (started_at is not null or completed_at is not null)) then base:=greatest(base,now());end if;
 -- Reset unfinished projections; all passes only move times forward from this anchor.
 update public.match_schedule ms set approximate_time=case when m.status='running' then coalesce(m.started_at,base) else base end from public.matches m where m.id=ms.match_id and m.tournament_id=t.id and m.status not in('completed','cancelled');
 -- Relax mat order and feeder edges until stable. Clients show the same projection between server writes.
 for pass in 1..(select count(*)+1 from public.matches where tournament_id=t.id) loop
  changed:=false;
  for rec in select ms.*,m.status,m.started_at,m.participant_a_id,m.participant_b_id from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=t.id and m.status not in('completed','cancelled') order by case when m.status='running' then 0 else 1 end,ms.scheduled_order,ms.id loop
   if rec.status='running' then continue;end if;
   select max(case when m.status='completed' then m.completed_at+gap when m.status='running' then greatest(m.started_at+duration,now())+gap else x.approximate_time+duration+gap end) into cursor_at
    from public.match_schedule x join public.matches m on m.id=x.match_id where m.tournament_id=t.id and x.mat_id=rec.mat_id and m.status<>'cancelled' and (m.status in('completed','running') or x.scheduled_order<rec.scheduled_order) and m.id<>rec.match_id;
   select max(case when m.status='completed' then m.completed_at+rest when m.status='running' then greatest(m.started_at+duration,now())+rest else x.approximate_time+duration+rest end) into feeder_at
    from public.matches m left join public.match_schedule x on x.match_id=m.id where m.tournament_id=t.id and (m.next_match_id=rec.match_id or m.loser_next_match_id=rec.match_id);
   select max(case when m.status='completed' then m.completed_at+rest when m.status='running' then greatest(m.started_at+duration,now())+rest else x.approximate_time+duration+rest end) into rest_at
    from public.matches m join public.match_schedule x on x.match_id=m.id where m.tournament_id=t.id and m.status<>'cancelled' and m.id<>rec.match_id and (m.status in('completed','running') or x.scheduled_order<rec.scheduled_order) and (m.participant_a_id in(rec.participant_a_id,rec.participant_b_id) or m.participant_b_id in(rec.participant_a_id,rec.participant_b_id));
   proposed:=greatest(base,coalesce(cursor_at,base),coalesce(feeder_at,base),coalesce(rest_at,base));
   if proposed>rec.approximate_time then update public.match_schedule set approximate_time=proposed,updated_at=now() where id=rec.id;changed:=true;end if;
  end loop;
  exit when not changed;
 end loop;
 if changed then raise exception 'Schedule order conflicts with bracket dependencies';end if;
 select count(*) into cnt from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=t.id;
 return cnt;
end;$$;

create or replace function public.start_match(p_match_id uuid) returns void language plpgsql set search_path='' as $$ begin perform private.start_match(p_match_id);end;$$;
create or replace function private.start_match(p_match_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype; zone uuid;
begin
 select * into m from public.matches where id=p_match_id;
 if auth.uid() is null or not private.has_tournament_permission(m.tournament_id,'running') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=m.tournament_id for update;
 select * into m from public.matches where id=p_match_id for update;
 if m.status='running' then return;end if;
 if m.status not in('scheduled','ready') or m.participant_a_id is null or m.participant_b_id is null then raise exception 'Match is not ready';end if;
 select mat_id into zone from public.match_schedule where match_id=m.id;
 if zone is null then raise exception 'Assign a mat first';end if;
 if exists(select 1 from public.matches x join public.match_schedule s on s.match_id=x.id where x.tournament_id=m.tournament_id and x.status='running' and (s.mat_id=zone or x.participant_a_id in(m.participant_a_id,m.participant_b_id) or x.participant_b_id in(m.participant_a_id,m.participant_b_id))) then raise exception 'Mat or athlete already has a running match';end if;
 update public.matches set status='running',started_at=now() where id=m.id;
 perform public.refresh_tournament_schedule_times(m.tournament_id);
end;$$;
revoke all on function private.start_match(uuid),public.start_match(uuid) from public,anon;
grant execute on function private.start_match(uuid),public.start_match(uuid) to authenticated;

create or replace function private.refresh_after_match_end() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status is distinct from new.status and new.status='completed' and exists(select 1 from public.match_schedule s where s.match_id=new.id) then
  perform public.generate_tournament_schedule(new.tournament_id);
 end if;
 return new;
end;$$;
revoke all on function private.refresh_after_match_end() from public,anon,authenticated;
create trigger refresh_after_match_end after update of status on public.matches for each row execute function private.refresh_after_match_end();

create or replace function public.save_bout_timing(p_tournament_id uuid,p_duration integer,p_interval integer,p_rest integer) returns void language plpgsql set search_path='' as $$ begin perform private.save_bout_timing(p_tournament_id,p_duration,p_interval,p_rest);end;$$;
create or replace function private.save_bout_timing(p_tournament_id uuid,p_duration integer,p_interval integer,p_rest integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.has_tournament_permission(p_tournament_id,'schedule') then raise exception 'Not authorized';end if;
 update public.tournaments set bout_minutes=p_duration,bout_interval_minutes=p_interval,athlete_rest_minutes=p_rest where id=p_tournament_id;
 if exists(select 1 from public.matches m join public.match_schedule s on s.match_id=m.id where m.tournament_id=p_tournament_id) then perform public.refresh_tournament_schedule_times(p_tournament_id);end if;
end;$$;
revoke all on function private.save_bout_timing(uuid,integer,integer,integer),public.save_bout_timing(uuid,integer,integer,integer) from public,anon;
grant execute on function private.save_bout_timing(uuid,integer,integer,integer),public.save_bout_timing(uuid,integer,integer,integer) to authenticated;


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


revoke all on function public.get_registration_status(text) from public,anon,authenticated;
-- Add an existing event registration without collecting their information again.
create or replace function public.assign_registered_athlete(p_category_id uuid,p_participant_id uuid) returns void language plpgsql set search_path='' as $$ begin perform private.assign_registered_athlete(p_category_id,p_participant_id);end;$$;
create or replace function private.assign_registered_athlete(p_category_id uuid,p_participant_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 select tournament_id into tid from public.categories where id=p_category_id;
 if auth.uid() is null or not private.has_tournament_permission(tid,'weigh_in') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=tid for update;
 if not exists(select 1 from public.registrations where tournament_id=tid and participant_id=p_participant_id and status in('confirmed','pending_confirmation')) then raise exception 'Event registration not found';end if;
 if exists(select 1 from public.category_participants cp join public.categories c on c.id=cp.category_id where cp.participant_id=p_participant_id and c.tournament_id=tid and cp.is_active) then raise exception 'Athlete already has a category. Use transfer instead';end if;
 perform set_config('app.tournament_rpc_guard','1',true);
 insert into public.category_participants(category_id,participant_id,is_active,weigh_in_status) values(p_category_id,p_participant_id,true,'pending') on conflict(category_id,participant_id) do update set is_active=true,weigh_in_status='pending',weigh_in_weight=null;
end;$$;
revoke all on function public.assign_registered_athlete(uuid,uuid),private.assign_registered_athlete(uuid,uuid) from public,anon;
grant execute on function public.assign_registered_athlete(uuid,uuid),private.assign_registered_athlete(uuid,uuid) to authenticated;

create or replace function private.guard_late_category_addition() returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid; seeded boolean;
begin
 if tg_op='UPDATE' and old.category_id=new.category_id and old.participant_id=new.participant_id and old.is_active then return new;end if;
 if not new.is_active then return new;end if;
 select tournament_id into tid from public.categories where id=new.category_id;
 perform 1 from public.tournaments where id=tid for update;
 if exists(select 1 from public.matches where category_id=new.category_id and (status in('running','completed') or started_at is not null)) then raise exception 'Cannot add athletes after category fights start';end if;
 return new;
end;$$;
revoke all on function private.guard_late_category_addition() from public,anon,authenticated;
create trigger guard_late_category_addition before insert or update of is_active,category_id,participant_id on public.category_participants for each row execute function private.guard_late_category_addition();
