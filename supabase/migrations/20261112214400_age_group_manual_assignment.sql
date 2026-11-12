alter table public.categories add column age_group_name text, add column manual_assignment_only boolean not null default false;

create function private.inherit_age_group_settings()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (old.tournament_id,old.division,old.age_min,old.age_max) is not distinct from
     (new.tournament_id,new.division,new.age_min,new.age_max) then return new; end if;
 end if;
 perform 1 from public.tournaments where id=new.tournament_id for update;
 select c.age_group_name,c.manual_assignment_only into new.age_group_name,new.manual_assignment_only
 from public.categories c where c.tournament_id=new.tournament_id and c.division=new.division
   and c.age_min is not distinct from new.age_min and c.age_max is not distinct from new.age_max
   and c.id is distinct from new.id order by c.sort_order,c.id limit 1;
 new.manual_assignment_only:=coalesce(new.manual_assignment_only,false);
 return new;
end;
$$;
revoke all on function private.inherit_age_group_settings() from public,anon,authenticated;
create trigger inherit_age_group_settings before insert or update of tournament_id,division,age_min,age_max on public.categories
 for each row execute function private.inherit_age_group_settings();

create function public.save_age_group_settings(p_category_id uuid,p_name text,p_manual boolean)
returns void language plpgsql security definer set search_path='' as $$
declare c public.categories%rowtype;
begin
 select * into c from public.categories where id=p_category_id;
 if not found or not private.has_tournament_permission(c.tournament_id,'categories') then raise exception 'Not authorized'; end if;
 perform 1 from public.tournaments where id=c.tournament_id for update;
 select * into strict c from public.categories where id=p_category_id;
 update public.categories set age_group_name=nullif(btrim(p_name),''),manual_assignment_only=p_manual
 where tournament_id=c.tournament_id and division=c.division
 and age_min is not distinct from c.age_min and age_max is not distinct from c.age_max;
end;
$$;
revoke all on function public.save_age_group_settings(uuid,text,boolean) from public,anon;
grant execute on function public.save_age_group_settings(uuid,text,boolean) to authenticated;

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
 select c.id into assigned_category
 from public.category_participants cp join public.categories c on c.id=cp.category_id
 where cp.participant_id=r.participant_id and cp.is_active and c.tournament_id=r.tournament_id and c.division=r.division
 order by c.sort_order,c.id limit 1;
 if found then
  return jsonb_build_object('registration_id',r.id,'status','confirmed','payment_status','paid','category_id',assigned_category);
 end if;
 select id into assigned_category from public.categories where tournament_id=r.tournament_id and division=r.division and not manual_assignment_only and (age_min is null or p.age>=age_min) and (age_max is null or p.age<=age_max) and (weight_min is null or p.weight>=weight_min) and (weight_limit is null or p.weight<=weight_limit+coalesce(weight_allowance,0)) order by weight_limit asc nulls last,age_min asc nulls last,sort_order asc,id limit 1;
 if assigned_category is not null then
   insert into public.category_participants(category_id,participant_id,is_active,weigh_in_status) values(assigned_category,p.id,true,'pending') on conflict(category_id,participant_id) do update set is_active=true,weigh_in_status='pending';
 end if;
 return jsonb_build_object('registration_id',r.id,'status','confirmed','payment_status','paid','category_id',assigned_category);
end; $function$;

CREATE OR REPLACE FUNCTION public.get_public_event_data(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',concat_ws(' · ',c.age_group_name,c.name),'division',c.division,'age_min',c.age_min,'age_max',c.age_max,'weight_min',c.weight_min,'weight_limit',c.weight_limit,'format',b.format,'published',b.published_at is not null) order by c.sort_order,c.id) from public.categories c left join public.brackets b on b.category_id=c.id where c.tournament_id=t.id),'[]'::jsonb),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',trim(concat_ws(' ',p.last_name,p.first_name)),'age',p.age,'weight',p.weight,'city',p.city,'club',p.club,'coach',p.coach,'status',r.status,'category_id',coalesce(c.id,inferred.id)) order by p.last_name,p.first_name) from public.registrations r join public.participants p on p.id=r.participant_id left join public.category_participants cp on cp.participant_id=p.id and cp.is_active and exists(select 1 from public.categories cc where cc.id=cp.category_id and cc.tournament_id=t.id and cc.division=r.division) left join public.categories c on c.id=cp.category_id
 left join lateral(select candidate.id from public.categories candidate where cp.category_id is null and candidate.tournament_id=t.id and candidate.division=r.division and not candidate.manual_assignment_only
 and (candidate.age_min is null or p.age>=candidate.age_min) and (candidate.age_max is null or p.age<=candidate.age_max)
 and (candidate.weight_min is null or p.weight>=candidate.weight_min) and (candidate.weight_limit is null or p.weight<=candidate.weight_limit+coalesce(candidate.weight_allowance,0))
 order by candidate.weight_limit asc nulls last,candidate.age_min asc nulls last,candidate.sort_order,candidate.id limit 1) inferred on true
 where r.tournament_id=t.id and r.status<>'withdrawn'),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'category_id',m.category_id,'match_number',m.match_number,'round_number',m.round_number,'status',m.status,'participant_a_id',m.participant_a_id,'participant_b_id',m.participant_b_id,'winner_id',m.winner_id,'next_match_id',m.next_match_id,'loser_next_match_id',m.loser_next_match_id,'started_at',m.started_at,'completed_at',m.completed_at,'mat_id',ms.mat_id,'mat_name',ma.name,'scheduled_order',ms.scheduled_order,'approximate_time',ms.approximate_time,'division_start_at',case when cardinality(t.divisions)>0 then private.division_start(t,mc.division) end,'duration_seconds',public.match_duration_seconds(m.id),'victory_method',sc.victory_method,'score_a',sc.score_a,'score_b',sc.score_b) order by m.round_number,m.match_number) from public.matches m join public.categories mc on mc.id=m.category_id join public.brackets b on b.id=m.bracket_id and b.published_at is not null left join public.match_scoreboards sc on sc.match_id=m.id left join public.match_schedule ms on ms.match_id=m.id left join public.mats ma on ma.id=ms.mat_id where m.tournament_id=t.id),'[]'::jsonb),
 'results',coalesce((select jsonb_agg(jsonb_build_object('category_id',r.category_id,'participant_id',r.participant_id,'place',r.place)) from public.results r where r.tournament_id=t.id and not exists(select 1 from public.matches m where m.category_id=r.category_id and m.status not in('completed','cancelled'))),'[]'::jsonb),
 'bout_minutes',t.bout_minutes,'bout_interval_minutes',t.bout_interval_minutes,'athlete_rest_minutes',t.athlete_rest_minutes)
 from public.tournaments t where t.id=p_tournament_id and t.is_public and t.status<>'draft';
$function$;

CREATE OR REPLACE FUNCTION public.add_athlete_to_category(p_from_category_id uuid, p_to_category_id uuid, p_participant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare source public.categories%rowtype; target public.categories%rowtype; previous_guard text; added integer; actual numeric; target_status text;
begin
 select * into source from public.categories where id=p_from_category_id;
 if not found or not private.has_tournament_permission(source.tournament_id,'weigh_in')
 then raise exception 'Not authorized'; end if;
 perform 1 from public.tournaments where id=source.tournament_id for update;
 select * into target from public.categories where id=p_to_category_id;
 if not found or target.tournament_id<>source.tournament_id or target.id=source.id
 then raise exception 'Choose another category in the same tournament'; end if;
 if not exists(select 1 from public.registrations where tournament_id=source.tournament_id and division=source.division
   and participant_id=p_participant_id and status='confirmed' and payment_status='paid')
 then raise exception 'A confirmed registration is required'; end if;
 select weigh_in_weight into actual from public.category_participants
 where category_id=source.id and participant_id=p_participant_id and is_active;
 if not found then raise exception 'Athlete is not in the source category'; end if;
 if actual is null and (target.manual_assignment_only or source.division<>target.division) then
  raise exception 'Record the actual weight in the source category first';
 end if;
 if exists(select 1 from public.matches where category_id=target.id
   and (status not in ('scheduled','ready') or winner_id is not null or completed_at is not null))
   or exists(select 1 from public.results where category_id=target.id)
 then raise exception 'Cannot add athlete after category fights start'; end if;
 if exists(select 1 from public.category_participants where category_id=target.id and participant_id=p_participant_id and is_active)
 then return false; end if;
 perform set_config('app.tournament_rpc_guard','1',true);
 if source.division<>target.division then
  if not exists(select 1 from public.registrations where tournament_id=target.tournament_id
    and division=target.division and participant_id=p_participant_id) then
   insert into public.registrations(tournament_id,division,participant_id,status,payment_status)
   values(target.tournament_id,target.division,p_participant_id,'confirmed','paid');
  elsif not exists(select 1 from public.registrations where tournament_id=target.tournament_id
    and division=target.division and participant_id=p_participant_id and status='confirmed' and payment_status='paid') then
   raise exception 'Confirm the existing registration in the target division first';
  end if;
 end if;
 target_status:=case when actual is null then 'pending'
  when (target.weight_min is not null and actual<target.weight_min)
    or (target.weight_limit is not null and actual>target.weight_limit+coalesce(target.weight_allowance,0))
  then 'out_of_weight' else 'in_weight' end;
 previous_guard:=current_setting('app.allow_additional_category',true);
 perform set_config('app.allow_additional_category','1',true);
 insert into public.category_participants(category_id,participant_id,is_active,weigh_in_status,weigh_in_weight)
 values(target.id,p_participant_id,true,target_status,actual)
 on conflict(category_id,participant_id) do update set is_active=true,weigh_in_status=excluded.weigh_in_status,weigh_in_weight=excluded.weigh_in_weight;
 get diagnostics added=row_count;
 perform set_config('app.allow_additional_category',coalesce(previous_guard,''),true);
 return added>0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_tournament_results_detailed(p_tournament_id uuid)
 RETURNS TABLE(category_id uuid, category_name text, place integer, athlete_name text, age integer, club text, coach text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.category_id,case c.division when 'gi' then 'Gi · ' || concat_ws(' · ',c.age_group_name,c.name) when 'no_gi' then 'No-Gi · ' || concat_ws(' · ',c.age_group_name,c.name) else concat_ws(' · ',c.age_group_name,c.name) end,r.place,trim(concat_ws(' ',p.last_name,p.first_name)),p.age,p.club,p.coach
  from public.results r
    join public.categories c on c.id=r.category_id
    join public.tournaments t on t.id=r.tournament_id and t.id=p_tournament_id
      and t.is_public and t.status<>'draft'
    join public.participants p on p.id=r.participant_id
  where c.tournament_id=t.id and not exists(select 1 from public.matches m where m.category_id=c.id and m.status not in ('completed','cancelled'))
  order by c.sort_order,c.id,r.place,4;
$function$;
