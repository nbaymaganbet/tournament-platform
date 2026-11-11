create or replace function private.guard_category_division_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare target public.categories%rowtype;
begin
 if not new.is_active then return new; end if;
 select * into target from public.categories where id=new.category_id;
 if target.division='' then return new; end if;
 perform 1 from public.tournaments where id=target.tournament_id for update;
 if not exists(select 1 from public.registrations where tournament_id=target.tournament_id and participant_id=new.participant_id and division=target.division)
 then raise exception 'Registration for this division is required'; end if;
 if current_setting('app.allow_additional_category',true)='1' then return new; end if;
 if exists(select 1 from public.category_participants cp join public.categories c on c.id=cp.category_id
  where cp.participant_id=new.participant_id and cp.is_active and c.tournament_id=target.tournament_id and c.division=target.division and cp.category_id<>new.category_id)
 then raise exception 'Athlete already has a category in this division'; end if;
 return new;
end;
$$;

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
 select id into assigned_category from public.categories where tournament_id=r.tournament_id and division=r.division and (age_min is null or p.age>=age_min) and (age_max is null or p.age<=age_max) and (weight_min is null or p.weight>=weight_min) and (weight_limit is null or p.weight<=weight_limit+coalesce(weight_allowance,0)) order by weight_limit asc nulls last,age_min asc nulls last,sort_order asc,id limit 1;
 if assigned_category is not null then
   insert into public.category_participants(category_id,participant_id,is_active,weigh_in_status) values(assigned_category,p.id,true,'pending') on conflict(category_id,participant_id) do update set is_active=true,weigh_in_status='pending';
 end if;
 return jsonb_build_object('registration_id',r.id,'status','confirmed','payment_status','paid','category_id',assigned_category);
end; $function$;

CREATE OR REPLACE FUNCTION public.transfer_category_participant(p_from_category_id uuid, p_to_category_id uuid, p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare from_c public.categories%rowtype; to_c public.categories%rowtype; p public.participants%rowtype; cp public.category_participants%rowtype; target_weight numeric; previous_guard text;
begin
 select * into from_c from public.categories where id=p_from_category_id;
 select * into to_c from public.categories where id=p_to_category_id;
 if from_c.id is null then raise exception 'Source category not found'; end if;
 if to_c.id is null then raise exception 'Target category not found'; end if;
 if from_c.tournament_id<>to_c.tournament_id then raise exception 'Categories must belong to the same tournament'; end if;
 if from_c.division<>to_c.division then raise exception 'Categories must belong to the same division'; end if;
 if from_c.id=to_c.id then raise exception 'Choose another category'; end if;
 if auth.uid() is null or not private.has_tournament_permission(from_c.tournament_id,'weigh_in') then raise exception 'Not authorized'; end if; perform set_config('app.tournament_rpc_guard', '1', true);
 -- Serialize against bracket refresh and concurrent bout results.
 perform 1 from public.tournaments where id=from_c.tournament_id for update;
 perform 1 from public.brackets where category_id in (from_c.id,to_c.id) order by id for update;
 perform 1 from public.matches where category_id in (from_c.id,to_c.id) order by id for update;
 if exists (
   select 1 from public.matches
   where category_id in (from_c.id,to_c.id)
     and (status not in ('scheduled','ready') or winner_id is not null or completed_at is not null)
 ) or exists (select 1 from public.results where category_id in (from_c.id,to_c.id)) then
   raise exception 'Cannot transfer after fights start';
 end if;
 select * into p from public.participants where id=p_participant_id;
 if not found then raise exception 'Participant not found'; end if;
 select * into cp from public.category_participants where category_id=p_from_category_id and participant_id=p_participant_id and is_active=true for update;
 if not found then raise exception 'Active participant is not in the source category'; end if;
 target_weight:=cp.weigh_in_weight;
 if target_weight is null or cp.weigh_in_status not in ('in_weight','out_of_weight') then raise exception 'Actual weigh-in weight is required before transfer'; end if;
 if not exists (select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id where t.id=from_c.tournament_id and o.user_id=(select auth.uid())) and (target_weight<coalesce(to_c.weight_min,0) or target_weight>coalesce(to_c.weight_limit,100000)+coalesce(to_c.weight_allowance,0)) then raise exception 'Actual weight is outside the target category'; end if;
 if exists(select 1 from public.category_participants where category_id=to_c.id and participant_id=p_participant_id and is_active)
 then raise exception 'Athlete is already in the target category'; end if;
 previous_guard:=current_setting('app.allow_additional_category',true);
 perform set_config('app.allow_additional_category','1',true);
 update public.category_participants set is_active=false where category_id=p_from_category_id and participant_id=p_participant_id;
 select * into cp from public.category_participants where category_id=p_to_category_id and participant_id=p_participant_id for update;
 if found then
   update public.category_participants set is_active=true,weigh_in_weight=target_weight,weigh_in_status='in_weight' where category_id=p_to_category_id and participant_id=p_participant_id;
 else
   insert into public.category_participants(category_id,participant_id,is_active,weigh_in_weight,weigh_in_status)
   values(p_to_category_id,p_participant_id,true,target_weight,'in_weight');
 end if;
 perform set_config('app.allow_additional_category',coalesce(previous_guard,''),true);
 return jsonb_build_object('participant_id',p_participant_id,'from_category_id',p_from_category_id,'to_category_id',p_to_category_id,'actual_weight',target_weight,'weigh_in_status','in_weight');
end;
$function$;

create function public.add_athlete_to_category(p_from_category_id uuid,p_to_category_id uuid,p_participant_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare source public.categories%rowtype; target public.categories%rowtype; previous_guard text; added integer;
begin
 select * into source from public.categories where id=p_from_category_id;
 if not found or not private.has_tournament_permission(source.tournament_id,'weigh_in')
 then raise exception 'Not authorized'; end if;
 perform 1 from public.tournaments where id=source.tournament_id for update;
 select * into target from public.categories where id=p_to_category_id;
 if not found or target.tournament_id<>source.tournament_id or target.division<>source.division or target.id=source.id
 then raise exception 'Choose another category in the same division'; end if;
 if not exists(select 1 from public.registrations where tournament_id=source.tournament_id and division=source.division
   and participant_id=p_participant_id and status='confirmed' and payment_status='paid')
 then raise exception 'A confirmed registration is required'; end if;
 if not exists(select 1 from public.category_participants where category_id=source.id and participant_id=p_participant_id and is_active)
 then raise exception 'Athlete is not in the source category'; end if;
 if exists(select 1 from public.category_participants where category_id=target.id and participant_id=p_participant_id and is_active)
 then return false; end if;
 perform set_config('app.tournament_rpc_guard','1',true);
 previous_guard:=current_setting('app.allow_additional_category',true);
 perform set_config('app.allow_additional_category','1',true);
 insert into public.category_participants(category_id,participant_id,is_active,weigh_in_status)
 values(target.id,p_participant_id,true,'pending')
 on conflict(category_id,participant_id) do update set is_active=true,weigh_in_status='pending',weigh_in_weight=null;
 get diagnostics added=row_count;
 perform set_config('app.allow_additional_category',coalesce(previous_guard,''),true);
 return added>0;
end;
$$;
revoke all on function public.add_athlete_to_category(uuid,uuid,uuid) from public,anon;
grant execute on function public.add_athlete_to_category(uuid,uuid,uuid) to authenticated;
