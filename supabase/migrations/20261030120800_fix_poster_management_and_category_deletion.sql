-- Check authorization while the category still exists, then remove its links
-- before the parent so the existing link guard can resolve the tournament.
create or replace function private.delete_tournament_category(p_category_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_tournament_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select tournament_id into v_tournament_id from public.categories
    where id=p_category_id for update;
  if not found then raise exception 'Category not found'; end if;
  if not exists(select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id
      where t.id=v_tournament_id and o.user_id=auth.uid())
     and not exists(select 1 from public.tournament_members m
       join public.tournament_member_permissions p on p.tournament_id=m.tournament_id and p.user_id=m.user_id
       join public.tournaments t on t.id=m.tournament_id
       where m.tournament_id=v_tournament_id and m.user_id=auth.uid()
         and p.categories is true and t.status<>'completed') then
    raise exception 'Not authorized';
  end if;
  delete from public.category_participants where category_id=p_category_id;
  delete from public.categories where id=p_category_id;
  return p_category_id;
end;
$$;
revoke all on function private.delete_tournament_category(uuid) from public,anon;
grant execute on function private.delete_tournament_category(uuid) to authenticated;
create or replace function public.delete_tournament_category(p_category_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.delete_tournament_category(p_category_id); $$;
revoke all on function public.delete_tournament_category(uuid) from public,anon;
grant execute on function public.delete_tournament_category(uuid) to authenticated;

-- Remove a saved poster and update the public cover together. Storage files
-- are removed through the Storage API by the caller, using existing policies.
create or replace function private.delete_tournament_poster(p_poster_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_poster public.tournament_posters%rowtype; v_cover text;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into v_poster from public.tournament_posters where id=p_poster_id for update;
  if not found then raise exception 'Poster not found'; end if;
  if not exists(select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id
    where t.id=v_poster.tournament_id and o.user_id=auth.uid()) then
    raise exception 'Not authorized';
  end if;
  perform 1 from public.tournaments where id=v_poster.tournament_id for update;
  delete from public.tournament_posters where id=p_poster_id;
  select public_url into v_cover from public.tournament_posters
    where tournament_id=v_poster.tournament_id order by sort_order,id limit 1;
  update public.tournaments set poster_url=v_cover where id=v_poster.tournament_id;
  return jsonb_build_object('poster_url',v_cover);
end;
$$;
revoke all on function private.delete_tournament_poster(uuid) from public,anon;
grant execute on function private.delete_tournament_poster(uuid) to authenticated;
create or replace function public.delete_tournament_poster(p_poster_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.delete_tournament_poster(p_poster_id); $$;
revoke all on function public.delete_tournament_poster(uuid) from public,anon;
grant execute on function public.delete_tournament_poster(uuid) to authenticated;
