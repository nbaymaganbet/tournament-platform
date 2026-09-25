create or replace function private.list_tournament_members_with_permissions(p_tournament_uuid uuid)
returns table(
  user_id uuid, display_name text, email text, role text, created_at timestamptz,
  overview boolean, participants boolean, categories boolean, weigh_in boolean,
  brackets boolean, schedule boolean, running boolean, results boolean,
  settings boolean, team boolean, all_tournaments boolean
)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.tournaments t
    join public.organizers owner_org on owner_org.id=t.organizer_id
    where t.id=p_tournament_uuid and owner_org.user_id=v_user_id
  ) then raise exception 'Only tournament owner can manage team permissions'; end if;
  return query
  select tm.user_id,
    coalesce(o.display_name, nullif(au.raw_user_meta_data->>'full_name',''), split_part(au.email,'@',1)),
    coalesce(o.email, au.email), tm.role, tm.created_at,
    coalesce(p.overview,true), coalesce(p.participants,true), coalesce(p.categories,false),
    coalesce(p.weigh_in,true), coalesce(p.brackets,false), coalesce(p.schedule,true),
    coalesce(p.running,true), coalesce(p.results,true), coalesce(p.settings,false),
    coalesce(p.team,false), coalesce(p.all_tournaments,false)
  from public.tournament_members tm
  join auth.users au on au.id=tm.user_id
  left join public.organizers o on o.user_id=tm.user_id
  left join public.tournament_member_permissions p
    on p.tournament_id=tm.tournament_id and p.user_id=tm.user_id
  where tm.tournament_id=p_tournament_uuid
  order by tm.created_at;
end;
$function$;

-- Keep the existing public wrapper and make sure authenticated users can call it.
grant execute on function public.list_tournament_members_with_permissions(uuid) to authenticated;
grant execute on function public.has_tournament_permission(uuid,text) to authenticated;
