-- Manual registration from weigh-in uses the existing confirmed/paid admission
-- state. Actual weight is deliberately left pending for the normal weigh-in flow.
create or replace function private.add_weigh_in_participant(
  p_category_id uuid, p_first_name text, p_last_name text, p_age integer,
  p_weight numeric, p_experience text, p_phone text, p_city text,
  p_club text, p_coach text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_category public.categories%rowtype;
  v_organizer_id uuid;
  v_participant public.participants%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into v_category from public.categories where id = p_category_id;
  if not found then raise exception 'Category not found'; end if;
  if not private.has_tournament_permission(v_category.tournament_id, 'weigh_in') then
    raise exception 'Not authorized';
  end if;
  if nullif(trim(p_first_name), '') is null
     or nullif(trim(p_last_name), '') is null
     or p_age is null or p_age < 0
     or p_weight is null or p_weight <= 0 or p_weight::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid participant data';
  end if;
  select organizer_id into v_organizer_id from public.tournaments
    where id = v_category.tournament_id;
  insert into public.participants(
    organizer_id, first_name, last_name, age, weight, experience, phone, city, club, coach
  ) values (
    v_organizer_id, trim(p_first_name), trim(p_last_name), p_age, p_weight,
    nullif(trim(p_experience), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_city), ''), nullif(trim(p_club), ''), nullif(trim(p_coach), '')
  ) returning * into v_participant;
  insert into public.registrations(
    tournament_id, participant_id, status, payment_status, status_token_hash
  ) values (
    v_category.tournament_id, v_participant.id, 'confirmed', 'paid',
    encode(extensions.digest(extensions.gen_random_bytes(24), 'sha256'), 'hex')
  );
  perform set_config('app.tournament_rpc_guard', '1', true);
  insert into public.category_participants(
    category_id, participant_id, is_active, weigh_in_status, weigh_in_weight
  ) values (p_category_id, v_participant.id, true, 'pending', null);
  return jsonb_build_object(
    'id', v_participant.id, 'first_name', v_participant.first_name,
    'last_name', v_participant.last_name, 'age', v_participant.age,
    'weight', v_participant.weight, 'club', v_participant.club, 'coach', v_participant.coach
  );
end;
$$;
revoke all on function private.add_weigh_in_participant(uuid,text,text,integer,numeric,text,text,text,text,text) from public, anon;
grant execute on function private.add_weigh_in_participant(uuid,text,text,integer,numeric,text,text,text,text,text) to authenticated;

create or replace function public.add_weigh_in_participant(
  p_category_id uuid, p_first_name text, p_last_name text, p_age integer,
  p_weight numeric, p_experience text, p_phone text, p_city text,
  p_club text, p_coach text
) returns jsonb
language sql security invoker set search_path = ''
as $$
  select private.add_weigh_in_participant(
    p_category_id,p_first_name,p_last_name,p_age,p_weight,p_experience,
    p_phone,p_city,p_club,p_coach
  );
$$;
revoke all on function public.add_weigh_in_participant(uuid,text,text,integer,numeric,text,text,text,text,text) from public, anon;
grant execute on function public.add_weigh_in_participant(uuid,text,text,integer,numeric,text,text,text,text,text) to authenticated;
