-- Remove only endpoints and ticket internals unused by the current application.
-- Application numbers, event rows, active legacy bracket helpers, RLS and migration history are retained.
SET LOCAL lock_timeout='5s';

CREATE TEMP TABLE _runtime_cleanup_rows(table_name text PRIMARY KEY,row_count bigint,digest text) ON COMMIT DROP;
DO $capture$
DECLARE item record; n bigint; h text;
BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg((to_jsonb(t)-''status_token_hash'')::text,E''\\n'' ORDER BY (to_jsonb(t)-''status_token_hash'')::text),'''')) FROM public.%I t',item.tablename) INTO n,h;
  INSERT INTO _runtime_cleanup_rows VALUES(item.tablename,n,h);
 END LOOP;
END $capture$;

DROP FUNCTION IF EXISTS public.list_tournament_members(uuid);
DROP FUNCTION IF EXISTS public.get_public_tournament_results(uuid);
DROP FUNCTION IF EXISTS public.get_public_category_format(uuid,uuid);
DROP FUNCTION IF EXISTS public.rebuild_single_elimination_bracket(uuid);
DROP FUNCTION IF EXISTS public.get_registration_status(text);
DROP FUNCTION IF EXISTS public.get_public_category_bracket(uuid,uuid);
DROP FUNCTION IF EXISTS public.configure_tournament_schedule(uuid,integer,time without time zone);
DROP FUNCTION IF EXISTS private.list_tournament_members(uuid);
DROP FUNCTION IF EXISTS private.is_tournament_member(uuid);
DROP FUNCTION public.submit_tournament_registration(uuid,text,text,integer,numeric,text,text,text,text,text);
CREATE OR REPLACE FUNCTION public.submit_tournament_registration(p_tournament_id uuid, p_first_name text, p_last_name text, p_age integer, p_weight numeric, p_experience text, p_phone text, p_city text, p_club text, p_coach text)
 RETURNS TABLE(registration_id uuid, application_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_organizer_id uuid;
  v_participant_id uuid;
  v_registration_id uuid;
  v_application_number text;
begin
  select t.organizer_id
    into v_organizer_id
  from public.tournaments t
  where t.id = p_tournament_id
    and t.is_public = true
    and t.status = 'registration_open';

  if v_organizer_id is null then
    raise exception 'Registration is not open';
  end if;

  insert into public.participants(
    organizer_id, first_name, last_name, age, weight, experience,
    phone, city, club, coach
  )
  values(
    v_organizer_id,
    trim(p_first_name),
    trim(p_last_name),
    p_age,
    p_weight,
    nullif(trim(p_experience), ''),
    trim(p_phone),
    nullif(trim(p_city), ''),
    nullif(trim(p_club), ''),
    nullif(trim(p_coach), '')
  )
  returning id into v_participant_id;

  insert into public.registrations(
    tournament_id,
    participant_id,
    status,
    payment_status
  )
  values(
    p_tournament_id,
    v_participant_id,
    'pending_confirmation',
    'unpaid'
  )
  returning registrations.id, registrations.application_number
    into v_registration_id, v_application_number;

  return query
  select v_registration_id, v_application_number;
end;
$function$
;
REVOKE ALL ON FUNCTION public.submit_tournament_registration(uuid,text,text,integer,numeric,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_tournament_registration(uuid,text,text,integer,numeric,text,text,text,text,text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.add_weigh_in_participant(p_category_id uuid, p_first_name text, p_last_name text, p_age integer, p_weight numeric, p_experience text, p_phone text, p_city text, p_club text, p_coach text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    tournament_id, participant_id, status, payment_status
  ) values (
    v_category.tournament_id, v_participant.id, 'confirmed', 'paid'
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
$function$
;
ALTER TABLE public.registrations DROP COLUMN status_token_hash;

DO $verify$
DECLARE item record; n bigint; h text;
BEGIN
 FOR item IN SELECT * FROM _runtime_cleanup_rows LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg((to_jsonb(t)-''status_token_hash'')::text,E''\\n'' ORDER BY (to_jsonb(t)-''status_token_hash'')::text),'''')) FROM public.%I t',item.table_name) INTO n,h;
  IF n<>item.row_count OR h<>item.digest THEN RAISE EXCEPTION 'Application rows changed during cleanup: %',item.table_name; END IF;
 END LOOP;
END $verify$;

NOTIFY pgrst,'reload schema';
