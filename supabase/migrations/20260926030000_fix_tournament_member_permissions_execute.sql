grant execute on function private.set_tournament_member_permissions(
  uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;

revoke execute on function public.set_tournament_member_permissions(
  uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) from public, anon;

grant execute on function public.set_tournament_member_permissions(
  uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;
