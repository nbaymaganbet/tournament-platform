create table if not exists public.tournament_member_permissions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overview boolean not null default true,
  participants boolean not null default true,
  categories boolean not null default false,
  weigh_in boolean not null default true,
  brackets boolean not null default false,
  schedule boolean not null default true,
  running boolean not null default true,
  results boolean not null default true,
  settings boolean not null default false,
  team boolean not null default false,
  all_tournaments boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

alter table public.tournament_member_permissions enable row level security;
revoke all on table public.tournament_member_permissions from anon, authenticated;

create or replace function private.has_tournament_permission(
  p_tournament_uuid uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_owner boolean;
  v_completed boolean;
  v_allowed boolean := false;
begin
  if v_user_id is null then return false; end if;
  select exists (
    select 1 from public.tournaments t
    join public.organizers o on o.id = t.organizer_id
    where t.id = p_tournament_uuid and o.user_id = v_user_id
  ) into v_is_owner;
  if v_is_owner then return true; end if;

  select t.status = 'completed' into v_completed
  from public.tournaments t where t.id = p_tournament_uuid;
  if not found then return false; end if;

  select case p_permission_key
    when 'overview' then p.overview
    when 'participants' then p.participants
    when 'categories' then p.categories
    when 'weigh_in' then p.weigh_in
    when 'brackets' then p.brackets
    when 'schedule' then p.schedule
    when 'running' then p.running
    when 'results' then p.results
    when 'settings' then p.settings
    when 'team' then p.team
    when 'all_tournaments' then p.all_tournaments
    else false
  end into v_allowed
  from public.tournament_member_permissions p
  where p.tournament_id = p_tournament_uuid and p.user_id = v_user_id;

  if not v_allowed then return false; end if;
  if v_completed and p_permission_key in ('categories','weigh_in','running','settings','team') then return false; end if;
  return true;
end;
$function$;

create or replace function private.list_tournament_members_with_permissions(p_tournament_uuid uuid)
returns table(
  user_id uuid, display_name text, email text, role text, created_at timestamptz,
  overview boolean, participants boolean, categories boolean, weigh_in boolean, brackets boolean,
  schedule boolean, running boolean, results boolean, settings boolean, team boolean, all_tournaments boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.tournaments t
    join public.organizers o on o.id = t.organizer_id
    where t.id = p_tournament_uuid and o.user_id = v_user_id
  ) then raise exception 'Only tournament owner can manage team permissions'; end if;

  return query
  select tm.user_id,o.display_name,o.email,tm.role,tm.created_at,
    coalesce(p.overview,true),coalesce(p.participants,true),coalesce(p.categories,false),
    coalesce(p.weigh_in,true),coalesce(p.brackets,false),coalesce(p.schedule,true),
    coalesce(p.running,true),coalesce(p.results,true),coalesce(p.settings,false),
    coalesce(p.team,false),coalesce(p.all_tournaments,false)
  from public.tournament_members tm
  join public.organizers o on o.user_id=tm.user_id
  left join public.tournament_member_permissions p
    on p.tournament_id=tm.tournament_id and p.user_id=tm.user_id
  where tm.tournament_id=p_tournament_uuid
  order by tm.created_at;
end;
$function$;

create or replace function private.set_tournament_member_permissions(
  p_tournament_uuid uuid,p_member_user_id uuid,p_overview boolean,p_participants boolean,p_categories boolean,
  p_weigh_in boolean,p_brackets boolean,p_schedule boolean,p_running boolean,p_results boolean,
  p_settings boolean,p_team boolean,p_all_tournaments boolean
)
returns void language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id
    where t.id=p_tournament_uuid and o.user_id=v_user_id
  ) then raise exception 'Only tournament owner can change team permissions'; end if;
  if not exists (
    select 1 from public.tournament_members tm
    where tm.tournament_id=p_tournament_uuid and tm.user_id=p_member_user_id
  ) then raise exception 'Tournament member not found'; end if;

  insert into public.tournament_member_permissions(
    tournament_id,user_id,overview,participants,categories,weigh_in,brackets,schedule,running,
    results,settings,team,all_tournaments,updated_at
  ) values(
    p_tournament_uuid,p_member_user_id,p_overview,p_participants,p_categories,p_weigh_in,p_brackets,
    p_schedule,p_running,p_results,p_settings,p_team,p_all_tournaments,now()
  )
  on conflict (tournament_id,user_id) do update set
    overview=excluded.overview,participants=excluded.participants,categories=excluded.categories,
    weigh_in=excluded.weigh_in,brackets=excluded.brackets,schedule=excluded.schedule,
    running=excluded.running,results=excluded.results,settings=excluded.settings,
    team=excluded.team,all_tournaments=excluded.all_tournaments,updated_at=now();
end;
$function$;

create or replace function public.has_tournament_permission(p_tournament_uuid uuid,p_permission_key text)
returns boolean language sql stable set search_path=''
as $function$ select private.has_tournament_permission(p_tournament_uuid,p_permission_key); $function$;

create or replace function public.list_tournament_members_with_permissions(p_tournament_uuid uuid)
returns table(
  user_id uuid,display_name text,email text,role text,created_at timestamptz,
  overview boolean,participants boolean,categories boolean,weigh_in boolean,brackets boolean,
  schedule boolean,running boolean,results boolean,settings boolean,team boolean,all_tournaments boolean
)
language sql stable set search_path=''
as $function$ select * from private.list_tournament_members_with_permissions(p_tournament_uuid); $function$;

create or replace function public.set_tournament_member_permissions(
  p_tournament_uuid uuid,p_member_user_id uuid,p_overview boolean,p_participants boolean,p_categories boolean,
  p_weigh_in boolean,p_brackets boolean,p_schedule boolean,p_running boolean,p_results boolean,
  p_settings boolean,p_team boolean,p_all_tournaments boolean
)
returns void language sql set search_path=''
as $function$
select private.set_tournament_member_permissions(
 p_tournament_uuid,p_member_user_id,p_overview,p_participants,p_categories,p_weigh_in,p_brackets,
 p_schedule,p_running,p_results,p_settings,p_team,p_all_tournaments);
$function$;

revoke execute on function private.has_tournament_permission(uuid,text) from public,anon,authenticated;
revoke execute on function private.list_tournament_members_with_permissions(uuid) from public,anon,authenticated;
revoke execute on function private.set_tournament_member_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.has_tournament_permission(uuid,text) to authenticated;
grant execute on function public.list_tournament_members_with_permissions(uuid) to authenticated;
grant execute on function public.set_tournament_member_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

create or replace function private.add_tournament_member_by_email(
  tournament_uuid uuid,member_email text,member_role text default 'operator'
)
returns table(user_id uuid,display_name text,email text,role text)
language plpgsql security definer set search_path=''
as $function$
declare
  v_caller_user_id uuid := (select auth.uid());
  v_caller_organizer uuid; v_target_user_id uuid; v_target_display_name text; v_target_email text;
  v_normalized_email text := lower(trim(member_email));
begin
  select o.id into v_caller_organizer from public.organizers o where o.user_id=v_caller_user_id limit 1;
  if v_caller_organizer is null then raise exception 'Organizer profile not found'; end if;
  if not exists(select 1 from public.tournaments t where t.id=tournament_uuid and t.organizer_id=v_caller_organizer)
    then raise exception 'Only tournament owner can add members'; end if;
  if member_role not in ('manager','operator') then raise exception 'Invalid member role'; end if;

  select o.user_id,o.display_name,o.email into v_target_user_id,v_target_display_name,v_target_email
  from public.organizers o where lower(o.email)=v_normalized_email limit 1;
  if v_target_user_id is null then raise exception 'No registered organizer account found for this email'; end if;
  if v_target_user_id=v_caller_user_id then raise exception 'Owner is already a tournament manager'; end if;

  insert into public.tournament_members(tournament_id,user_id,role)
  values(tournament_uuid,v_target_user_id,member_role)
  on conflict on constraint tournament_members_tournament_id_user_id_key do update set role=excluded.role;

  insert into public.tournament_member_permissions(tournament_id,user_id)
  values(tournament_uuid,v_target_user_id)
  on conflict on constraint tournament_member_permissions_tournament_id_user_id_key do nothing;

  return query select v_target_user_id,v_target_display_name,v_target_email,member_role;
end;
$function$;

create or replace function public.add_tournament_member_by_email(
  tournament_uuid uuid,member_email text,member_role text default 'operator'
)
returns table(user_id uuid,display_name text,email text,role text)
language sql set search_path=''
as $function$ select * from private.add_tournament_member_by_email(tournament_uuid,member_email,member_role); $function$;

grant execute on function public.add_tournament_member_by_email(uuid,text,text) to authenticated;
