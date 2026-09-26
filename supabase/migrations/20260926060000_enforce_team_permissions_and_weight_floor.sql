-- Keep the existing tournament model and participant data intact.
-- Replace only the authorization guard in the existing RPC bodies.
-- Policies execute with the caller's role, even when their helper is private.
grant execute on function private.has_tournament_permission(uuid,text) to authenticated;
do $migration$
declare
  item record;
  ddl text;
  old_guard text;
  new_guard text;
begin
  for item in
    select * from (values
      ('confirm_tournament_registration','participants','r.tournament_id'),
      ('set_category_weigh_in','weigh_in','c.tournament_id'),
      ('transfer_category_participant','weigh_in','from_c.tournament_id'),
      ('generate_single_elimination_bracket','brackets','c.tournament_id'),
      ('rebuild_single_elimination_bracket','brackets','c.tournament_id'),
      ('record_match_winner','running','m.tournament_id'),
      ('generate_tournament_schedule','schedule','p_tournament_id'),
      ('configure_tournament_schedule','schedule','p_tournament_id'),
      ('refresh_tournament_schedule_times','schedule','p_tournament_id'),
      ('reorder_tournament_schedule','schedule','p_tournament_id')
    ) as v(name, permission, tournament_expr)
  loop
    select pg_get_functiondef(p.oid) into ddl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=item.name;
    if ddl is null then raise exception 'Missing function %',item.name; end if;
    old_guard := 'private.is_organizer_of_tournament('||item.tournament_expr||')';
    new_guard := 'private.has_tournament_permission('||item.tournament_expr||','||quote_literal(item.permission)||')';
    if position(old_guard in ddl)>0 then
      ddl := replace(ddl,old_guard,new_guard);
    elsif position(new_guard in ddl)=0 then
      raise exception 'Unexpected authorization guard in %',item.name;
    end if;
    if item.name in ('confirm_tournament_registration','set_category_weigh_in','transfer_category_participant')
       and position('perform set_config' in ddl)=0 then
      -- The authorization guard is followed by a trusted context marker.
      -- It remains local to this request and is read by the row trigger.
      ddl := regexp_replace(ddl,
        '(if not private\.has_tournament_permission\([^;]+?\) then raise exception ''Not authorized''; end if;)',
        E'\\1 perform set_config(''app.tournament_rpc_guard'', ''1'', true);', 'i');
      if position('perform set_config' in ddl)=0 then raise exception 'Guard marker not installed in %',item.name; end if;
    end if;
    if item.name='confirm_tournament_registration' then
      if position('(weight_limit is null or p.weight<=weight_limit+coalesce(weight_allowance,0))' in ddl)=0
        then raise exception 'Unexpected category assignment in confirmation'; end if;
      if position('(weight_min is null or p.weight>=weight_min)' in ddl)=0 then ddl := replace(ddl,
        '(weight_limit is null or p.weight<=weight_limit+coalesce(weight_allowance,0))',
        '(weight_min is null or p.weight>=weight_min) and (weight_limit is null or p.weight<=weight_limit+coalesce(weight_allowance,0))'); end if;
    end if;
    -- These RPCs update records from more than one section. Their explicit
    -- permission guard is the authorization boundary for the whole operation.
    if position('LANGUAGE plpgsql SECURITY DEFINER' in ddl)=0 then
      ddl := replace(ddl,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER');
    end if;
    execute ddl;
  end loop;
end
$migration$;

-- Safe to replay if the live database was updated ahead of migration history.
do $cleanup$
declare item record;
begin
  for item in select tablename,policyname from pg_policies
    where schemaname='public' and policyname like 'team %'
      and tablename in ('categories','category_participants','registrations','participants',
        'tournaments','brackets','matches','match_schedule','mats','results','documents')
  loop
    execute format('drop policy if exists %I on public.%I',item.policyname,item.tablename);
  end loop;
end
$cleanup$;

-- Separate reading (needed by several permitted screens and Overview) from writing.
drop policy if exists "organizers manage own categories" on public.categories;
create policy "team read categories" on public.categories for select to authenticated
 using (private.has_tournament_permission(tournament_id,'overview') or private.has_tournament_permission(tournament_id,'categories')
 or private.has_tournament_permission(tournament_id,'weigh_in') or private.has_tournament_permission(tournament_id,'brackets')
 or private.has_tournament_permission(tournament_id,'running'));
create policy "team insert categories" on public.categories for insert to authenticated
 with check (private.has_tournament_permission(tournament_id,'categories'));
create policy "team update categories" on public.categories for update to authenticated
 using (private.has_tournament_permission(tournament_id,'categories'))
 with check (private.has_tournament_permission(tournament_id,'categories'));
create policy "team delete categories" on public.categories for delete to authenticated
 using (private.has_tournament_permission(tournament_id,'categories'));

drop policy if exists "organizers manage category participants" on public.category_participants;
create policy "team read category participants" on public.category_participants for select to authenticated
 using (exists(select 1 from public.categories c where c.id=category_id and
 (private.has_tournament_permission(c.tournament_id,'categories') or private.has_tournament_permission(c.tournament_id,'weigh_in')
 or private.has_tournament_permission(c.tournament_id,'brackets') or private.has_tournament_permission(c.tournament_id,'running'))));
create policy "team edit category participants" on public.category_participants for all to authenticated
 using (exists(select 1 from public.categories c where c.id=category_id and
 (private.has_tournament_permission(c.tournament_id,'categories') or private.has_tournament_permission(c.tournament_id,'weigh_in'))))
 with check (exists(select 1 from public.categories c where c.id=category_id and
 (private.has_tournament_permission(c.tournament_id,'categories') or private.has_tournament_permission(c.tournament_id,'weigh_in'))));

drop policy if exists "organizers read tournament registrations" on public.registrations;
drop policy if exists "organizers update tournament registrations" on public.registrations;
drop policy if exists "organizers delete tournament registrations" on public.registrations;
create policy "team read registrations" on public.registrations for select to authenticated
 using (private.has_tournament_permission(tournament_id,'overview') or private.has_tournament_permission(tournament_id,'participants')
 or private.has_tournament_permission(tournament_id,'categories') or private.has_tournament_permission(tournament_id,'weigh_in')
 or private.has_tournament_permission(tournament_id,'brackets') or private.has_tournament_permission(tournament_id,'running'));
create policy "team update registrations" on public.registrations for update to authenticated
 using (private.has_tournament_permission(tournament_id,'participants'))
 with check (private.has_tournament_permission(tournament_id,'participants'));
create policy "team delete registrations" on public.registrations for delete to authenticated
 using (private.has_tournament_permission(tournament_id,'participants'));

drop policy if exists "organizers and team manage participants" on public.participants;
create policy "team read participants" on public.participants for select to authenticated
 using (organizer_id=private.current_organizer_id() or exists
 (select 1 from public.registrations r where r.participant_id=participants.id and
 (private.has_tournament_permission(r.tournament_id,'participants') or private.has_tournament_permission(r.tournament_id,'categories')
 or private.has_tournament_permission(r.tournament_id,'weigh_in') or private.has_tournament_permission(r.tournament_id,'brackets')
 or private.has_tournament_permission(r.tournament_id,'schedule') or private.has_tournament_permission(r.tournament_id,'running')
 or private.has_tournament_permission(r.tournament_id,'results'))));
create policy "team update participants" on public.participants for update to authenticated
 using (organizer_id=private.current_organizer_id() or exists
 (select 1 from public.registrations r where r.participant_id=participants.id and private.has_tournament_permission(r.tournament_id,'participants')))
 with check (organizer_id=private.current_organizer_id() or exists
 (select 1 from public.registrations r where r.participant_id=participants.id and private.has_tournament_permission(r.tournament_id,'participants')));

drop policy if exists "organizers and team update tournaments" on public.tournaments;
create policy "team update tournament settings" on public.tournaments for update to authenticated
 using (organizer_id=private.current_organizer_id() or private.has_tournament_permission(id,'settings'))
 with check (organizer_id=private.current_organizer_id() or private.has_tournament_permission(id,'settings'));

-- Direct table mutations must obey the same permissions as the RPCs.
do $policies$
declare item record; expression text; table_name text;
begin
 for item in select * from (values
 ('brackets','brackets','(select c.tournament_id from public.categories c where c.id=category_id)'),
 ('matches','running','tournament_id'),
 ('match_schedule','schedule','(select m.tournament_id from public.matches m where m.id=match_id)'),
 ('mats','schedule','tournament_id'),
 ('results','results','tournament_id'),
 ('documents','settings','tournament_id')
 ) as v(tbl,permission,tournament_expr) loop
   table_name:=quote_ident(item.tbl);
   execute format('drop policy if exists %I on public.%I',
     case item.tbl when 'brackets' then 'organizers manage own brackets'
     when 'matches' then 'organizers manage own matches'
     when 'match_schedule' then 'organizers manage own schedule'
     when 'mats' then 'organizers manage own mats'
     when 'results' then 'organizers manage own results'
     else 'organizers manage own documents' end,item.tbl);
   expression:=format('private.has_tournament_permission(%s,%L)',item.tournament_expr,item.permission);
   execute format('create policy %I on public.%I for select to authenticated using (%s or private.has_tournament_permission(%s,%L)%s)',
     'team read '||item.tbl,item.tbl,expression,item.tournament_expr,'overview',
     case item.tbl
       when 'matches' then format(' or private.has_tournament_permission(%s,%L)',item.tournament_expr,'brackets')
       when 'results' then format(' or private.has_tournament_permission(%s,%L)',item.tournament_expr,'running')
       when 'match_schedule' then format(' or private.has_tournament_permission(%s,%L)',item.tournament_expr,'running')
       else '' end);
   execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
     'team insert '||item.tbl,item.tbl,expression);
   execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
     'team update '||item.tbl,item.tbl,expression,expression);
   execute format('create policy %I on public.%I for delete to authenticated using (%s)',
     'team delete '||item.tbl,item.tbl,expression);
 end loop;
end
$policies$;

-- Match and result rows are written by guarded RPCs; browser clients only
-- read them. A team member cannot submit a fabricated winner or placing.
drop policy if exists "team insert matches" on public.matches;
drop policy if exists "team update matches" on public.matches;
drop policy if exists "team delete matches" on public.matches;
drop policy if exists "team insert results" on public.results;
drop policy if exists "team update results" on public.results;
drop policy if exists "team delete results" on public.results;

create or replace function private.guard_category_participant_edit()
returns trigger language plpgsql security definer set search_path = ''
as $guard$
declare tournament_uuid uuid; owner_allowed boolean;
begin
  if current_setting('app.tournament_rpc_guard',true)='1' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  select c.tournament_id into tournament_uuid from public.categories c
  where c.id=coalesce(new.category_id,old.category_id);
  select exists(select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id
    where t.id=tournament_uuid and o.user_id=auth.uid()) into owner_allowed;
  if owner_allowed then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if private.has_tournament_permission(tournament_uuid,'categories') then
    if tg_op='DELETE' then return old; end if;
    if new.weigh_in_status <> 'pending' or new.weigh_in_weight is not null then
      raise exception 'Use weigh-in to record actual weight';
    end if;
  elsif private.has_tournament_permission(tournament_uuid,'weigh_in') then
    if tg_op <> 'UPDATE' or new.is_active is distinct from false
       or new.weigh_in_status is distinct from old.weigh_in_status
       or new.weigh_in_weight is distinct from old.weigh_in_weight then
      raise exception 'Weigh-in cannot change category assignment';
    end if;
  else raise exception 'Not authorized';
  end if;
  return new;
end
$guard$;
drop trigger if exists guard_category_participant_edit on public.category_participants;
create trigger guard_category_participant_edit before insert or update or delete on public.category_participants
for each row execute function private.guard_category_participant_edit();

create or replace function private.guard_tournament_owner_change()
returns trigger language plpgsql security definer set search_path = ''
as $guard$
begin
  if new.organizer_id is distinct from old.organizer_id and
     not exists(select 1 from public.organizers o where o.id=old.organizer_id and o.user_id=auth.uid())
  then raise exception 'Only tournament owner can transfer ownership'; end if;
  return new;
end
$guard$;
drop trigger if exists guard_tournament_owner_change on public.tournaments;
create trigger guard_tournament_owner_change before update of organizer_id on public.tournaments
for each row execute function private.guard_tournament_owner_change();
