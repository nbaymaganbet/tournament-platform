create function public.edit_tournament_participant(
  p_registration_id uuid, p_details jsonb, p_previous_divisions text[], p_divisions text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  source public.registrations%rowtype;
  details public.participants%rowtype;
  enabled text[];
  current_divisions text[];
  remove_divisions text[];
  entry text;
begin
  select * into source from public.registrations where id=p_registration_id;
  if not found or not private.has_tournament_permission(source.tournament_id,'participants') then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select divisions into enabled from public.tournaments where id=source.tournament_id for update;
  select * into source from public.registrations where id=p_registration_id for update;
  if not found then raise exception 'Registration changed. Refresh the list'; end if;
  if cardinality(enabled)=0 or p_divisions is null or array_position(p_divisions,null) is not null
     or not (p_divisions <@ enabled) then raise exception 'Invalid tournament division'; end if;

  select coalesce(array_agg(distinct division order by division),'{}') into current_divisions
  from public.registrations where tournament_id=source.tournament_id and participant_id=source.participant_id and division<>'';
  if p_previous_divisions is null or not (current_divisions @> p_previous_divisions and p_previous_divisions @> current_divisions)
  then raise exception 'Registration changed. Refresh the list'; end if;

  remove_divisions:=array(select unnest(current_divisions) except select unnest(p_divisions));
  if exists(
    select 1 from public.categories c
    where c.tournament_id=source.tournament_id and c.division=any(remove_divisions) and (
      exists(select 1 from public.matches m where m.category_id=c.id and source.participant_id in (m.participant_a_id,m.participant_b_id))
      or exists(select 1 from public.results r where r.category_id=c.id and r.participant_id=source.participant_id)
    )
  ) then raise exception 'Athlete is already in a bracket for this division'; end if;

  details:=jsonb_populate_record(null::public.participants,p_details);
  update public.participants
  set first_name=details.first_name,last_name=details.last_name,age=details.age,weight=details.weight,
      experience=details.experience,phone=details.phone,city=details.city,club=details.club,coach=details.coach
  where id=source.participant_id;

  for entry in select unnest(p_divisions) except select unnest(current_divisions) loop
    perform public.add_registration_division(p_registration_id,entry);
  end loop;

  if cardinality(remove_divisions)>0 then
    perform set_config('app.tournament_rpc_guard','1',true);
    update public.category_participants cp set is_active=false
    from public.categories c
    where c.id=cp.category_id and c.tournament_id=source.tournament_id and c.division=any(remove_divisions)
      and cp.participant_id=source.participant_id and cp.is_active;

    if cardinality(p_divisions)=0 and not exists(
      select 1 from public.registrations where tournament_id=source.tournament_id and participant_id=source.participant_id and division=''
    ) then
      update public.registrations set division='',status='pending_confirmation',payment_status='unpaid'
      where id=p_registration_id;
    end if;
    delete from public.registrations
    where tournament_id=source.tournament_id and participant_id=source.participant_id and division=any(remove_divisions);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'division',division,'application_number',application_number,
      'status',status,'payment_status',payment_status) order by created_at desc,id)
    from public.registrations where tournament_id=source.tournament_id and participant_id=source.participant_id
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.edit_tournament_participant(uuid,jsonb,text[],text[]) from public,anon;
grant execute on function public.edit_tournament_participant(uuid,jsonb,text[],text[]) to authenticated;
