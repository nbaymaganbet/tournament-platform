-- Allow the tournament owner to make an explicit weigh-in transfer outside
-- the destination weight range. Staff retain the existing range check.
do $migration$
declare
  definition text;
  old_check text := 'if target_weight<coalesce(to_c.weight_min,0) or target_weight>coalesce(to_c.weight_limit,100000)+coalesce(to_c.weight_allowance,0) then raise exception ''Actual weight is outside the target category''; end if;';
  new_check text := 'if not exists (select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id where t.id=from_c.tournament_id and o.user_id=(select auth.uid())) and (target_weight<coalesce(to_c.weight_min,0) or target_weight>coalesce(to_c.weight_limit,100000)+coalesce(to_c.weight_allowance,0)) then raise exception ''Actual weight is outside the target category''; end if;';
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='transfer_category_participant'
    and pg_get_function_identity_arguments(p.oid)='p_from_category_id uuid, p_to_category_id uuid, p_participant_id uuid';

  if definition is null or position(old_check in definition)=0
    or position('private.has_tournament_permission(from_c.tournament_id,''weigh_in'')' in definition)=0 then
    raise exception 'Unexpected transfer_category_participant definition';
  end if;

  execute replace(definition,old_check,new_check);
end;
$migration$;
