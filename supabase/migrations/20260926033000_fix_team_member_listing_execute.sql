revoke execute on function public.list_tournament_members_with_permissions(uuid) from anon;
grant execute on function public.list_tournament_members_with_permissions(uuid) to authenticated;
