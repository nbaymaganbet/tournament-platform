revoke execute on function private.list_tournament_members_with_permissions(uuid) from public;
grant execute on function private.list_tournament_members_with_permissions(uuid) to authenticated;
