-- Additive only: existing tournament, category and match values are preserved.
alter table public.categories add column round_seconds integer check(round_seconds between 1 and 7200), add column round_count integer check(round_count between 1 and 20), add column round_rest_seconds integer check(round_rest_seconds between 0 and 3600);
alter table public.categories add constraint category_timing_complete check ((round_seconds is null and round_count is null and round_rest_seconds is null) or (round_seconds is not null and round_count is not null and round_rest_seconds is not null));
create table public.match_scoreboards (
 match_id uuid primary key references public.matches(id) on delete cascade,
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 score_a integer not null default 0 check(score_a between 0 and 999), score_b integer not null default 0 check(score_b between 0 and 999),
 current_round integer not null default 1 check(current_round between 1 and 20),
 round_seconds integer not null check(round_seconds between 1 and 7200), round_count integer not null check(round_count between 1 and 20), rest_seconds integer not null check(rest_seconds between 0 and 3600),
 remaining_ms integer not null check(remaining_ms>=0), timer_started_at timestamptz, is_rest boolean not null default false,
 victory_method text check(victory_method in ('points','submission','ko','tko','disqualification','walkover','retirement')),
 version integer not null default 0, updated_at timestamptz not null default now()
);
alter table public.match_scoreboards enable row level security;
create policy "scoreboard read" on public.match_scoreboards for select to anon,authenticated using (
 exists(select 1 from public.tournaments t where t.id=tournament_id and t.is_public and t.status<>'draft') or (auth.uid() is not null and private.has_tournament_permission(tournament_id,'running'))
);
grant select on public.match_scoreboards to anon,authenticated;
revoke insert,update,delete on public.match_scoreboards from anon,authenticated;
create function public.match_duration_seconds(p_match_id uuid) returns integer language sql stable set search_path='' as $$
 select coalesce(c.round_seconds*c.round_count+c.round_rest_seconds*(c.round_count-1),t.bout_minutes*60) from public.matches m join public.categories c on c.id=m.category_id join public.tournaments t on t.id=m.tournament_id where m.id=p_match_id;
$$;
create function private.save_category_timing(p_category_id uuid,p_seconds integer,p_rounds integer,p_rest integer) returns void language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 select tournament_id into tid from public.categories where id=p_category_id;
 if auth.uid() is null or not private.has_tournament_permission(tid,'categories') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=tid for update;
 if exists(select 1 from public.matches where category_id=p_category_id and status='running') then raise exception 'Cannot change timing during an active match';end if;
 update public.categories set round_seconds=p_seconds,round_count=p_rounds,round_rest_seconds=p_rest where id=p_category_id;
 if exists(select 1 from public.match_schedule s join public.matches m on m.id=s.match_id where m.tournament_id=tid) then perform public.refresh_tournament_schedule_times(tid);end if;
end;$$;
create function public.save_category_timing(p_category_id uuid,p_seconds integer,p_rounds integer,p_rest integer) returns void language plpgsql set search_path='' as $$begin perform private.save_category_timing(p_category_id,p_seconds,p_rounds,p_rest);end;$$;
create function private.update_match_scoreboard(p_match_id uuid,p_action text,p_value integer,p_side text,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype; board public.match_scoreboards%rowtype; secs integer; rounds integer; rest integer; elapsed integer;
begin
 select * into m from public.matches where id=p_match_id;
 if auth.uid() is null or not private.has_tournament_permission(m.tournament_id,'running') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=m.tournament_id for update;
 select * into m from public.matches where id=p_match_id for update;
 if m.status<>'running' then raise exception 'Match must be running';end if;
 select coalesce(c.round_seconds,t.bout_minutes*60),coalesce(c.round_count,1),coalesce(c.round_rest_seconds,0) into secs,rounds,rest from public.categories c join public.tournaments t on t.id=c.tournament_id where c.id=m.category_id;
 insert into public.match_scoreboards(match_id,tournament_id,round_seconds,round_count,rest_seconds,remaining_ms) values(m.id,m.tournament_id,secs,rounds,rest,secs*1000) on conflict(match_id) do nothing;
 select * into board from public.match_scoreboards where match_id=m.id for update;
 if board.version<>p_version then raise exception 'Scoreboard changed. Refresh and try again.';end if;
 elapsed:=case when board.timer_started_at is null then 0 else greatest(0,floor(extract(epoch from (clock_timestamp()-board.timer_started_at))*1000)::integer) end;
 board.remaining_ms:=greatest(0,board.remaining_ms-elapsed);board.timer_started_at:=case when board.timer_started_at is not null and board.remaining_ms>0 then clock_timestamp() else null end;
 if p_action='score' then
   if p_value not between 0 and 999 or p_value is null then raise exception 'Invalid score';end if;
   if p_side='a' then board.score_a:=p_value;elsif p_side='b' then board.score_b:=p_value;else raise exception 'Invalid side';end if;
 elsif p_action='start' then
   if board.remaining_ms=0 then raise exception 'Select the next round or rest';end if;
   board.timer_started_at:=clock_timestamp();
 elsif p_action='pause' then board.timer_started_at:=null;
 elsif p_action='rest' then
   if board.is_rest or board.current_round>=board.round_count or board.rest_seconds=0 then raise exception 'Rest is not available';end if;
   board.is_rest:=true;board.remaining_ms:=board.rest_seconds*1000;board.timer_started_at:=null;
 elsif p_action='round' then
   if board.current_round>=board.round_count then raise exception 'Last round';end if;
   board.current_round:=board.current_round+1;board.is_rest:=false;board.remaining_ms:=board.round_seconds*1000;board.timer_started_at:=null;
 else raise exception 'Invalid action';end if;
 update public.match_scoreboards set score_a=board.score_a,score_b=board.score_b,current_round=board.current_round,is_rest=board.is_rest,remaining_ms=board.remaining_ms,timer_started_at=board.timer_started_at,version=version+1,updated_at=clock_timestamp() where match_id=m.id returning * into board;
 return to_jsonb(board)||jsonb_build_object('server_now',clock_timestamp());
end;$$;
create function public.update_match_scoreboard(p_match_id uuid,p_action text,p_value integer default null,p_side text default null,p_version integer default 0) returns jsonb language plpgsql set search_path='' as $$begin return private.update_match_scoreboard(p_match_id,p_action,p_value,p_side,p_version);end;$$;
create function private.record_match_result(p_match_id uuid,p_winner_id uuid,p_method text,p_score_a integer,p_score_b integer) returns void language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype; secs integer; rounds integer; rest integer;
begin
 select * into m from public.matches where id=p_match_id;
 if auth.uid() is null or not private.has_tournament_permission(m.tournament_id,'running') then raise exception 'Not authorized';end if;
 perform 1 from public.tournaments where id=m.tournament_id for update;
 select * into m from public.matches where id=p_match_id for update;
 if p_method is null or p_method not in('points','submission','ko','tko','disqualification','walkover','retirement') then raise exception 'Invalid victory method';end if;
 if m.status not in('ready','scheduled','running') or (m.status<>'running' and p_method<>'walkover') then raise exception 'Start the match first';end if;
 if p_method='points' and (p_score_a is null or p_score_b is null or p_score_a not between 0 and 999 or p_score_b not between 0 and 999) then raise exception 'Enter both scores';end if;
 -- Existing bracket advancement and medal calculation stay in the original function.
 perform public.record_match_winner(p_match_id,p_winner_id);
 select coalesce(c.round_seconds,t.bout_minutes*60),coalesce(c.round_count,1),coalesce(c.round_rest_seconds,0) into secs,rounds,rest from public.categories c join public.tournaments t on t.id=c.tournament_id where c.id=m.category_id;
 insert into public.match_scoreboards(match_id,tournament_id,round_seconds,round_count,rest_seconds,remaining_ms,score_a,score_b,victory_method) values(m.id,m.tournament_id,secs,rounds,rest,secs*1000,coalesce(p_score_a,0),coalesce(p_score_b,0),p_method)
 on conflict(match_id) do update set victory_method=p_method,score_a=coalesce(p_score_a,public.match_scoreboards.score_a),score_b=coalesce(p_score_b,public.match_scoreboards.score_b),remaining_ms=greatest(0,public.match_scoreboards.remaining_ms-case when public.match_scoreboards.timer_started_at is null then 0 else greatest(0,floor(extract(epoch from(clock_timestamp()-public.match_scoreboards.timer_started_at))*1000)::integer) end),timer_started_at=null,version=public.match_scoreboards.version+1,updated_at=clock_timestamp();
end;$$;
create function public.record_match_result(p_match_id uuid,p_winner_id uuid,p_method text,p_score_a integer default null,p_score_b integer default null) returns void language plpgsql set search_path='' as $$begin perform private.record_match_result(p_match_id,p_winner_id,p_method,p_score_a,p_score_b);end;$$;
create table public.registration_reads(user_id uuid not null references auth.users(id) on delete cascade,tournament_id uuid not null references public.tournaments(id) on delete cascade,seen_through timestamptz not null default '-infinity',primary key(user_id,tournament_id));
alter table public.registration_reads enable row level security;
create policy "own notification state" on public.registration_reads for select to authenticated using(user_id=(select auth.uid()));
grant select on public.registration_reads to authenticated;
revoke insert,update,delete on public.registration_reads from anon,authenticated;
create function private.registration_notifications(p_tournament_id uuid,p_mark_read boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare latest timestamptz; seen timestamptz;
begin
 if auth.uid() is null or not private.has_tournament_permission(p_tournament_id,'participants') then raise exception 'Not authorized';end if;
 select max(created_at) into latest from public.registrations where tournament_id=p_tournament_id;
 if p_mark_read then insert into public.registration_reads(user_id,tournament_id,seen_through) values(auth.uid(),p_tournament_id,coalesce(latest,'-infinity')) on conflict(user_id,tournament_id) do update set seen_through=greatest(public.registration_reads.seen_through,excluded.seen_through);end if;
 select seen_through into seen from public.registration_reads where user_id=auth.uid() and tournament_id=p_tournament_id;
 return coalesce(latest>coalesce(seen,'-infinity'),false);
end;$$;
create function public.registration_notifications(p_tournament_id uuid,p_mark_read boolean default false) returns boolean language plpgsql set search_path='' as $$begin return private.registration_notifications(p_tournament_id,p_mark_read);end;$$;
create function private.get_mat_scoreboard(p_mat_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare zone public.mats%rowtype; result jsonb;
begin
 select * into zone from public.mats where id=p_mat_id;
 if zone.id is null then return null;end if;
 if not exists(select 1 from public.tournaments t where t.id=zone.tournament_id and t.is_public and t.status<>'draft') and not (auth.uid() is not null and private.has_tournament_permission(zone.tournament_id,'running')) then return null;end if;
 select jsonb_build_object('id',m.id,'match_number',m.match_number,'status',m.status,'winner_id',m.winner_id,'participant_a_id',m.participant_a_id,'participant_b_id',m.participant_b_id,'name_a',concat_ws(' ',a.last_name,a.first_name),'name_b',concat_ws(' ',b.last_name,b.first_name),'club_a',a.club,'club_b',b.club,'category',c.name,'round_seconds',coalesce(c.round_seconds,t.bout_minutes*60),'round_count',coalesce(c.round_count,1),'round_rest_seconds',coalesce(c.round_rest_seconds,0),'board',to_jsonb(sb)) into result
 from public.matches m join public.match_schedule ms on ms.match_id=m.id join public.categories c on c.id=m.category_id join public.tournaments t on t.id=m.tournament_id left join public.participants a on a.id=m.participant_a_id left join public.participants b on b.id=m.participant_b_id left join public.match_scoreboards sb on sb.match_id=m.id
 where ms.mat_id=zone.id and m.tournament_id=zone.tournament_id and (m.status='running' or (m.status='completed' and sb.victory_method is not null))
 order by (m.status='running') desc,m.completed_at desc nulls last limit 1;
 return jsonb_build_object('mat_name',zone.name,'tournament_id',zone.tournament_id,'match',result,'server_now',clock_timestamp());
end;$$;
create function public.get_mat_scoreboard(p_mat_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select private.get_mat_scoreboard(p_mat_id);$$;
revoke all on function private.save_category_timing(uuid,integer,integer,integer),public.save_category_timing(uuid,integer,integer,integer),private.update_match_scoreboard(uuid,text,integer,text,integer),public.update_match_scoreboard(uuid,text,integer,text,integer),private.record_match_result(uuid,uuid,text,integer,integer),public.record_match_result(uuid,uuid,text,integer,integer),private.registration_notifications(uuid,boolean),public.registration_notifications(uuid,boolean) from public,anon;
grant execute on function private.save_category_timing(uuid,integer,integer,integer),public.save_category_timing(uuid,integer,integer,integer),private.update_match_scoreboard(uuid,text,integer,text,integer),public.update_match_scoreboard(uuid,text,integer,text,integer),private.record_match_result(uuid,uuid,text,integer,integer),public.record_match_result(uuid,uuid,text,integer,integer),private.registration_notifications(uuid,boolean),public.registration_notifications(uuid,boolean) to authenticated;
revoke all on function private.get_mat_scoreboard(uuid),public.get_mat_scoreboard(uuid) from public;
grant execute on function private.get_mat_scoreboard(uuid),public.get_mat_scoreboard(uuid) to anon,authenticated;
-- Publish only the new scoreboard table; timer ticks themselves do not write rows.
alter publication supabase_realtime add table public.match_scoreboards;
CREATE OR REPLACE FUNCTION public.refresh_tournament_schedule_times(p_tournament_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   select max(case when m.status='completed' then m.completed_at+gap when m.status='running' then greatest(m.started_at+make_interval(secs=>public.match_duration_seconds(m.id)),now())+gap else x.approximate_time+make_interval(secs=>public.match_duration_seconds(m.id))+gap end) into cursor_at
    from public.match_schedule x join public.matches m on m.id=x.match_id where m.tournament_id=t.id and x.mat_id=rec.mat_id and m.status<>'cancelled' and (m.status in('completed','running') or x.scheduled_order<rec.scheduled_order) and m.id<>rec.match_id;
   select max(case when m.status='completed' then m.completed_at+rest when m.status='running' then greatest(m.started_at+make_interval(secs=>public.match_duration_seconds(m.id)),now())+rest else x.approximate_time+make_interval(secs=>public.match_duration_seconds(m.id))+rest end) into feeder_at
    from public.matches m left join public.match_schedule x on x.match_id=m.id where m.tournament_id=t.id and (m.next_match_id=rec.match_id or m.loser_next_match_id=rec.match_id);
   select max(case when m.status='completed' then m.completed_at+rest when m.status='running' then greatest(m.started_at+make_interval(secs=>public.match_duration_seconds(m.id)),now())+rest else x.approximate_time+make_interval(secs=>public.match_duration_seconds(m.id))+rest end) into rest_at
    from public.matches m join public.match_schedule x on x.match_id=m.id where m.tournament_id=t.id and m.status<>'cancelled' and m.id<>rec.match_id and (m.status in('completed','running') or x.scheduled_order<rec.scheduled_order) and (m.participant_a_id in(rec.participant_a_id,rec.participant_b_id) or m.participant_b_id in(rec.participant_a_id,rec.participant_b_id));
   proposed:=greatest(base,coalesce(cursor_at,base),coalesce(feeder_at,base),coalesce(rest_at,base));
   if proposed>rec.approximate_time then update public.match_schedule set approximate_time=proposed,updated_at=now() where id=rec.id;changed:=true;end if;
  end loop;
  exit when not changed;
 end loop;
 if changed then raise exception 'Schedule order conflicts with bracket dependencies';end if;
 select count(*) into cnt from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=t.id;
 return cnt;
end;$function$;

CREATE OR REPLACE FUNCTION public.get_public_event_data(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'age_min',c.age_min,'age_max',c.age_max,'weight_limit',c.weight_limit,'format',b.format,'published',b.published_at is not null) order by c.sort_order,c.id) from public.categories c left join public.brackets b on b.category_id=c.id where c.tournament_id=t.id),'[]'::jsonb),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',trim(concat_ws(' ',p.last_name,p.first_name)),'age',p.age,'weight',p.weight,'city',p.city,'club',p.club,'coach',p.coach,'status',r.status,'category_id',coalesce(c.id,inferred.id)) order by p.last_name,p.first_name) from public.registrations r join public.participants p on p.id=r.participant_id left join public.category_participants cp on cp.participant_id=p.id and cp.is_active and exists(select 1 from public.categories cc where cc.id=cp.category_id and cc.tournament_id=t.id) left join public.categories c on c.id=cp.category_id
 left join lateral(select candidate.id from public.categories candidate where cp.category_id is null and candidate.tournament_id=t.id
 and (candidate.age_min is null or p.age>=candidate.age_min) and (candidate.age_max is null or p.age<=candidate.age_max)
 and (candidate.weight_min is null or p.weight>=candidate.weight_min) and (candidate.weight_limit is null or p.weight<=candidate.weight_limit+coalesce(candidate.weight_allowance,0))
 order by candidate.weight_limit asc nulls last,candidate.age_min asc nulls last,candidate.sort_order,candidate.id limit 1) inferred on true
 where r.tournament_id=t.id and r.status<>'withdrawn'),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'category_id',m.category_id,'match_number',m.match_number,'round_number',m.round_number,'status',m.status,'participant_a_id',m.participant_a_id,'participant_b_id',m.participant_b_id,'winner_id',m.winner_id,'next_match_id',m.next_match_id,'loser_next_match_id',m.loser_next_match_id,'started_at',m.started_at,'completed_at',m.completed_at,'mat_id',ms.mat_id,'mat_name',ma.name,'scheduled_order',ms.scheduled_order,'approximate_time',ms.approximate_time,'duration_seconds',public.match_duration_seconds(m.id),'victory_method',sc.victory_method,'score_a',sc.score_a,'score_b',sc.score_b) order by m.round_number,m.match_number) from public.matches m join public.brackets b on b.id=m.bracket_id and b.published_at is not null left join public.match_scoreboards sc on sc.match_id=m.id left join public.match_schedule ms on ms.match_id=m.id left join public.mats ma on ma.id=ms.mat_id where m.tournament_id=t.id),'[]'::jsonb),
 'results',coalesce((select jsonb_agg(jsonb_build_object('category_id',r.category_id,'participant_id',r.participant_id,'place',r.place)) from public.results r where r.tournament_id=t.id and not exists(select 1 from public.matches m where m.category_id=r.category_id and m.status not in('completed','cancelled'))),'[]'::jsonb),
 'bout_minutes',t.bout_minutes,'bout_interval_minutes',t.bout_interval_minutes,'athlete_rest_minutes',t.athlete_rest_minutes)
 from public.tournaments t where t.id=p_tournament_id and t.is_public and t.status<>'draft';
$function$;

