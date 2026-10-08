-- Keep every pre-existing tournament on its original, unmodified match logic.
alter table public.tournaments add column bracket_format text not null default 'single_elimination'
  check (bracket_format in ('single_elimination','round_robin'));
alter table public.tournaments add column bronze_bout boolean not null default true;
alter table public.tournaments add column bracket_rules_version integer not null default 0;
alter table public.tournaments alter column bracket_rules_version set default 1;
alter table public.categories add column bracket_format text
  check (bracket_format in ('single_elimination','round_robin'));
alter table public.brackets drop constraint brackets_format_check;
alter table public.brackets add constraint brackets_format_check
  check (format in ('single_elimination','round_robin'));
alter table public.brackets add column bronze_bout boolean;
-- Two semifinalists may share bronze when the organizer disables a bronze bout.
alter table public.results drop constraint results_category_id_place_key;

create or replace function private.guard_new_category_format()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if new.bracket_format is distinct from old.bracket_format and
    (exists(select 1 from public.tournaments t where t.id=new.tournament_id and t.bracket_rules_version=0)
     or exists(select 1 from public.matches m where m.category_id=new.id
        and (m.status not in ('scheduled','ready') or m.winner_id is not null or m.completed_at is not null))
     or exists(select 1 from public.results r where r.category_id=new.id)) then
    raise exception 'Category format cannot change after bouts start or on historical tournaments';
  end if;
  return new;
end;
$function$;
create trigger guard_new_category_format before update of bracket_format on public.categories
for each row execute function private.guard_new_category_format();

alter function public.generate_single_elimination_bracket(uuid)
  rename to legacy_generate_single_elimination_bracket;
alter function public.record_match_winner(uuid,uuid)
  rename to legacy_record_match_winner;
revoke all on function public.legacy_generate_single_elimination_bracket(uuid) from public,anon,authenticated;
revoke all on function public.legacy_record_match_winner(uuid,uuid) from public,anon,authenticated;

create or replace function public.generate_single_elimination_bracket(p_category_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $function$
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
  select array_agg(cp.participant_id order by cp.weigh_in_weight asc nulls last,rg.created_at,cp.participant_id),count(*)
    into ids,n from public.category_participants cp join public.registrations rg
      on rg.tournament_id=t.id and rg.participant_id=cp.participant_id
    where cp.category_id=p_category_id and cp.is_active and cp.weigh_in_status='in_weight'
      and rg.status='confirmed' and rg.payment_status='paid';
  if n<2 then raise exception 'At least two eligible athletes are required'; end if;
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

create or replace function public.record_match_winner(p_match_id uuid,p_winner_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  m public.matches%rowtype;
  b public.brackets%rowtype;
  legacy boolean;
  loser uuid;
  target public.matches%rowtype;
  champion uuid;
  runner_up uuid;
  tied boolean;
begin
  select * into m from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  select t.bracket_rules_version=0 into legacy from public.tournaments t where t.id=m.tournament_id;
  if legacy then perform public.legacy_record_match_winner(p_match_id,p_winner_id);return;end if;
  if not private.has_tournament_permission(m.tournament_id,'running') then raise exception 'Not authorized'; end if;
  if m.status='completed' then raise exception 'Match already completed'; end if;
  if m.participant_a_id is null or m.participant_b_id is null
    or p_winner_id is null or p_winner_id not in (m.participant_a_id,m.participant_b_id) then
    raise exception 'Both athletes must be known and the winner must be one of them';
  end if;
  select * into b from public.brackets where id=m.bracket_id;
  loser:=case when p_winner_id=m.participant_a_id then m.participant_b_id else m.participant_a_id end;
  update public.matches set winner_id=p_winner_id,status='completed',completed_at=now(),updated_at=now() where id=m.id;
  if b.format='round_robin' then
    if exists(select 1 from public.matches where bracket_id=b.id and status<>'completed') then return;end if;
    -- Two-way ties are resolved by their mutual bout. Cycles and larger ties
    -- remain unresolved for an explicit organizer decision, never an arbitrary medal.
    with scores as (
      select p.id,count(x.id) filter(where x.winner_id=p.id)::integer wins
      from (select participant_a_id id from public.matches where bracket_id=b.id
            union select participant_b_id from public.matches where bracket_id=b.id) p
      left join public.matches x on x.bracket_id=b.id and x.winner_id=p.id
      group by p.id
    ), ordered as (
      select s.id,s.wins,row_number() over(order by s.wins desc,s.id) rank_no,
        count(*) over(partition by s.wins) tied_count from scores s
    )
    select exists(select 1 from ordered where tied_count>2) into tied;
    if tied then return;end if;
    -- The resolver below also handles two-way ties with a head-to-head result.
    perform public.finalize_round_robin_results(m.category_id);
    return;
  end if;
  if m.next_match_id is not null then
    select * into target from public.matches where id=m.next_match_id for update;
    update public.matches set participant_a_id=case when participant_a_id is null then p_winner_id else participant_a_id end,
      participant_b_id=case when participant_a_id is not null and participant_b_id is null then p_winner_id else participant_b_id end,
      updated_at=now() where id=target.id;
  end if;
  if m.loser_next_match_id is not null then
    select * into target from public.matches where id=m.loser_next_match_id for update;
    update public.matches set participant_a_id=case when participant_a_id is null then loser else participant_a_id end,
      participant_b_id=case when participant_a_id is not null and participant_b_id is null then loser else participant_b_id end,
      updated_at=now() where id=target.id;
  end if;
  if exists(select 1 from public.matches where bracket_id=b.id and loser_next_match_id=m.id) then
    insert into public.results(tournament_id,category_id,participant_id,place)
      values(m.tournament_id,m.category_id,p_winner_id,3)
      on conflict(category_id,participant_id) do update set place=excluded.place;
    return;
  end if;
  if m.next_match_id is null and m.loser_next_match_id is null then
    -- A final has incoming winner links, or is the only bout in a two-athlete category.
    if exists(select 1 from public.matches where bracket_id=b.id and next_match_id=m.id)
      or (select count(*) from public.matches where bracket_id=b.id)=1 then
      insert into public.results(tournament_id,category_id,participant_id,place)
        values(m.tournament_id,m.category_id,p_winner_id,1),(m.tournament_id,m.category_id,loser,2)
        on conflict(category_id,participant_id) do update set place=excluded.place;
      if not exists(select 1 from public.matches third_bout
        where third_bout.bracket_id=b.id and exists(
          select 1 from public.matches feeder where feeder.loser_next_match_id=third_bout.id)) then
        insert into public.results(tournament_id,category_id,participant_id,place)
          select m.tournament_id,m.category_id,
            case when sf.winner_id=sf.participant_a_id then sf.participant_b_id else sf.participant_a_id end,3
          from public.matches sf where sf.bracket_id=b.id and sf.next_match_id=m.id and sf.winner_id is not null
          on conflict(category_id,participant_id) do update set place=excluded.place;
      end if;
    end if;
  end if;
end;
$function$;

create or replace function public.finalize_round_robin_results(p_category_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  b public.brackets%rowtype;
  tournament_uuid uuid;
  unresolved boolean;
begin
  select br.* into b from public.brackets br where br.category_id=p_category_id;
  if b.id is null or b.format<>'round_robin' then raise exception 'Round robin bracket not found'; end if;
  select c.tournament_id into tournament_uuid from public.categories c where c.id=p_category_id;
  if not private.has_tournament_permission(tournament_uuid,'running') then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.matches where bracket_id=b.id and status<>'completed') then
    raise exception 'All fights must finish first';
  end if;
  with scores as (
    select p.id,count(m.id) filter(where m.winner_id=p.id)::integer wins
    from (select participant_a_id id from public.matches where bracket_id=b.id
          union select participant_b_id from public.matches where bracket_id=b.id) p
    left join public.matches m on m.bracket_id=b.id and m.winner_id=p.id
    group by p.id
  ) select exists(select 1 from scores group by wins having count(*)>2) into unresolved;
  if unresolved then raise exception 'Three-way tie requires organizer decision'; end if;
  with scores as (
    select p.id,count(m.id) filter(where m.winner_id=p.id)::integer wins
    from (select participant_a_id id from public.matches where bracket_id=b.id
          union select participant_b_id from public.matches where bracket_id=b.id) p
    left join public.matches m on m.bracket_id=b.id and m.winner_id=p.id group by p.id
  ), rankings as (
    select s.id,s.wins,
      case when (select count(*) from scores opp where opp.wins=s.wins and opp.id<>s.id)=1
        and exists(select 1 from public.matches direct join scores opp
          on opp.id<>s.id and opp.wins=s.wins
          where direct.bracket_id=b.id and direct.winner_id=s.id
            and opp.id in (direct.participant_a_id,direct.participant_b_id))
        then 1 else 0 end head_to_head from scores s
  )
  insert into public.results(tournament_id,category_id,participant_id,place)
    select tournament_uuid,p_category_id,rankings.id,
      row_number() over(order by rankings.wins desc,rankings.head_to_head desc,rankings.id)::integer
    from rankings
    on conflict(category_id,participant_id) do update set place=excluded.place;
end;
$function$;

-- An organizer resolves only multi-athlete circular ties. Win totals must
-- remain ordered; the choice cannot promote an athlete with fewer victories.
create or replace function public.resolve_round_robin_tie(p_category_id uuid,p_order uuid[])
returns void language plpgsql security definer set search_path to '' as $function$
declare
  b public.brackets%rowtype;
  tournament_uuid uuid;
  athlete_count integer;
  last_wins integer:=2147483647;
  current_wins integer;
  athlete uuid;
  position integer:=0;
begin
  select * into b from public.brackets where category_id=p_category_id for update;
  select tournament_id into tournament_uuid from public.categories where id=p_category_id;
  if b.format<>'round_robin' or not private.has_tournament_permission(tournament_uuid,'running') then
    raise exception 'Not authorized';
  end if;
  if exists(select 1 from public.matches where bracket_id=b.id and status<>'completed')
    or exists(select 1 from public.results where category_id=p_category_id) then
    raise exception 'Round robin is unfinished or already ranked';
  end if;
  select count(distinct id) into athlete_count from (
    select participant_a_id id from public.matches where bracket_id=b.id
    union select participant_b_id from public.matches where bracket_id=b.id) x;
  if cardinality(p_order)<>athlete_count
    or (select count(distinct x) from unnest(p_order) x)<>athlete_count then
    raise exception 'Order must include every athlete exactly once';
  end if;
  foreach athlete in array p_order loop
    if not exists(select 1 from public.matches where bracket_id=b.id
      and athlete in (participant_a_id,participant_b_id)) then raise exception 'Unknown athlete'; end if;
    select count(*) into current_wins from public.matches where bracket_id=b.id and winner_id=athlete;
    if current_wins>last_wins then raise exception 'Win totals must remain in order'; end if;
    last_wins:=current_wins;position:=position+1;
    insert into public.results(tournament_id,category_id,participant_id,place)
      values(tournament_uuid,p_category_id,athlete,position);
  end loop;
end;
$function$;

-- Public results expose names and clubs only, never contact or payment details.
create or replace function public.get_public_tournament_results(p_tournament_id uuid)
returns table(category_id uuid,category_name text,place integer,athlete_name text,club text)
language sql stable security definer set search_path to '' as $function$
  select r.category_id,c.name,r.place,trim(concat_ws(' ',p.last_name,p.first_name)),p.club
  from public.results r join public.categories c on c.id=r.category_id
    join public.tournaments t on t.id=r.tournament_id and t.id=p_tournament_id
      and t.is_public and t.status='completed'
    left join public.participants p on p.id=r.participant_id
  where c.tournament_id=t.id and r.participant_id is not null
  order by c.sort_order,c.id,r.place,4;
$function$;
revoke all on function public.get_public_tournament_results(uuid) from public;
grant execute on function public.get_public_tournament_results(uuid) to anon,authenticated;
create or replace function public.get_public_category_format(p_tournament_id uuid,p_category_id uuid)
returns text language sql stable security definer set search_path to '' as $function$
  select b.format from public.brackets b join public.categories c on c.id=b.category_id
    join public.tournaments t on t.id=c.tournament_id
  where t.id=p_tournament_id and c.id=p_category_id and t.is_public and t.status<>'draft';
$function$;
revoke all on function public.get_public_category_format(uuid,uuid) from public;
grant execute on function public.get_public_category_format(uuid,uuid) to anon,authenticated;
revoke all on function public.finalize_round_robin_results(uuid) from public,anon;
grant execute on function public.finalize_round_robin_results(uuid) to authenticated;
revoke all on function public.resolve_round_robin_tie(uuid,uuid[]) from public,anon;
grant execute on function public.resolve_round_robin_tie(uuid,uuid[]) to authenticated;
revoke all on function public.generate_single_elimination_bracket(uuid) from public,anon;
grant execute on function public.generate_single_elimination_bracket(uuid) to authenticated;
revoke all on function public.record_match_winner(uuid,uuid) from public,anon;
grant execute on function public.record_match_winner(uuid,uuid) to authenticated;

-- The existing refresh function already preserves other categories' schedule.
-- Permit a refresh when only the chosen format changes and the roster is stable.
do $patch$
declare definition text;
begin
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='refresh_unstarted_category_bracket'
      and pg_get_function_identity_arguments(p.oid)='p_category_id uuid';
  if definition is null or position(') then raise exception ''Category bracket is already up to date''; end if;' in definition)=0 then
    raise exception 'Unexpected refresh function';
  end if;
  definition:=replace(definition,
    ') then raise exception ''Category bracket is already up to date''; end if;',
    ') and (select b.format from public.brackets b where b.id=previous_bracket)=
      (select coalesce(c.bracket_format,t.bracket_format) from public.categories c
        join public.tournaments t on t.id=c.tournament_id where c.id=p_category_id)
      then raise exception ''Category bracket is already up to date''; end if;');
  execute definition;
end;
$patch$;

create or replace function public.set_category_bracket_format(p_category_id uuid,p_format text)
returns void language plpgsql security definer set search_path to '' as $function$
declare tournament_uuid uuid;
begin
  select tournament_id into tournament_uuid from public.categories where id=p_category_id;
  if p_format not in ('single_elimination','round_robin') or tournament_uuid is null
    or not private.has_tournament_permission(tournament_uuid,'categories')
    or not private.has_tournament_permission(tournament_uuid,'brackets') then
    raise exception 'Not authorized or invalid format';
  end if;
  perform 1 from public.tournaments t where t.id=tournament_uuid and t.bracket_rules_version=1 for update;
  if not found then raise exception 'Historical tournament format cannot change'; end if;
  update public.categories set bracket_format=p_format where id=p_category_id;
  if exists(select 1 from public.brackets where category_id=p_category_id) then
    perform public.refresh_unstarted_category_bracket(p_category_id);
  end if;
end;
$function$;
revoke all on function public.set_category_bracket_format(uuid,text) from public,anon;
grant execute on function public.set_category_bracket_format(uuid,text) to authenticated;
