-- Resolve pending applications to their matching public category without modifying assignments.
create or replace function public.get_public_event_data(p_tournament_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'age_min',c.age_min,'age_max',c.age_max,'weight_limit',c.weight_limit,'format',b.format,'published',b.published_at is not null) order by c.sort_order,c.id) from public.categories c left join public.brackets b on b.category_id=c.id where c.tournament_id=t.id),'[]'::jsonb),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',trim(concat_ws(' ',p.last_name,p.first_name)),'age',p.age,'weight',p.weight,'city',p.city,'club',p.club,'coach',p.coach,'status',r.status,'category_id',coalesce(c.id,inferred.id)) order by p.last_name,p.first_name) from public.registrations r join public.participants p on p.id=r.participant_id left join public.category_participants cp on cp.participant_id=p.id and cp.is_active and exists(select 1 from public.categories cc where cc.id=cp.category_id and cc.tournament_id=t.id) left join public.categories c on c.id=cp.category_id
 left join lateral(select candidate.id from public.categories candidate where cp.category_id is null and candidate.tournament_id=t.id
 and (candidate.age_min is null or p.age>=candidate.age_min) and (candidate.age_max is null or p.age<=candidate.age_max)
 and (candidate.weight_min is null or p.weight>=candidate.weight_min) and (candidate.weight_limit is null or p.weight<=candidate.weight_limit+coalesce(candidate.weight_allowance,0))
 order by candidate.weight_limit asc nulls last,candidate.age_min asc nulls last,candidate.sort_order,candidate.id limit 1) inferred on true
 where r.tournament_id=t.id and r.status<>'withdrawn'),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'category_id',m.category_id,'match_number',m.match_number,'round_number',m.round_number,'status',m.status,'participant_a_id',m.participant_a_id,'participant_b_id',m.participant_b_id,'winner_id',m.winner_id,'next_match_id',m.next_match_id,'loser_next_match_id',m.loser_next_match_id,'started_at',m.started_at,'completed_at',m.completed_at,'mat_id',ms.mat_id,'mat_name',ma.name,'scheduled_order',ms.scheduled_order,'approximate_time',ms.approximate_time) order by m.round_number,m.match_number) from public.matches m join public.brackets b on b.id=m.bracket_id and b.published_at is not null left join public.match_schedule ms on ms.match_id=m.id left join public.mats ma on ma.id=ms.mat_id where m.tournament_id=t.id),'[]'::jsonb),
 'results',coalesce((select jsonb_agg(jsonb_build_object('category_id',r.category_id,'participant_id',r.participant_id,'place',r.place)) from public.results r where r.tournament_id=t.id and not exists(select 1 from public.matches m where m.category_id=r.category_id and m.status not in('completed','cancelled'))),'[]'::jsonb),
 'bout_minutes',t.bout_minutes,'bout_interval_minutes',t.bout_interval_minutes,'athlete_rest_minutes',t.athlete_rest_minutes)
 from public.tournaments t where t.id=p_tournament_id and t.is_public and t.status<>'draft';
$$;

create or replace function public.refresh_tournament_schedule_times(p_tournament_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare t public.tournaments%rowtype; rec record; base timestamptz; cursor_at timestamptz; feeder_at timestamptz; rest_at timestamptz; cnt int:=0; pass int; changed boolean; proposed timestamptz; duration interval; gap interval; rest interval;
begin
 if not (private.has_tournament_permission(p_tournament_id,'schedule') or private.has_tournament_permission(p_tournament_id,'running')) then raise exception 'Not authorized';end if;
 select * into t from public.tournaments where id=p_tournament_id for update;
 if t.date is null or t.schedule_start_time is null then raise exception 'Set tournament date and schedule start time first';end if;
 base:=(t.date+t.schedule_start_time) at time zone 'Asia/Almaty';
 duration:=make_interval(mins=>t.bout_minutes);gap:=make_interval(mins=>t.bout_interval_minutes);rest:=make_interval(mins=>t.athlete_rest_minutes);
 base:=greatest(base,now());
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


CREATE OR REPLACE FUNCTION public.record_match_winner(p_match_id uuid, p_winner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select * into m from public.matches where id=p_match_id;
  if not private.has_tournament_permission(m.tournament_id,'running') then raise exception 'Not authorized';end if;
  perform 1 from public.tournaments where id=m.tournament_id for update;
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
