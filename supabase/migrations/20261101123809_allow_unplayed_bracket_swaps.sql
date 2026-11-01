-- Exchange only unplayed starting positions, preserving completed bouts and links.
create or replace function public.swap_bracket_participants(p_category_id uuid, p_first_id uuid, p_second_id uuid)
returns void
language plpgsql security definer set search_path to '' as $function$
declare
  tournament_uuid uuid;
  first_count integer;
  second_count integer;
begin
  select c.tournament_id into tournament_uuid from public.categories c where c.id=p_category_id;
  if tournament_uuid is null or not exists (
    select 1 from public.tournaments t join public.organizers o on o.id=t.organizer_id
    where t.id=tournament_uuid and o.user_id=(select auth.uid())
  ) then raise exception 'Not authorized'; end if;
  if p_first_id is null or p_second_id is null or p_first_id=p_second_id then
    raise exception 'Выберите двух разных спортсменов / Екі түрлі спортшыны таңдаңыз';
  end if;

  -- Fail promptly if a result or schedule update is being recorded concurrently.
  perform 1 from public.tournaments where id=tournament_uuid for update nowait;
  perform 1 from public.brackets where category_id=p_category_id for update nowait;
  if not found then raise exception 'Bracket not found'; end if;
  if exists(select 1 from public.brackets where category_id=p_category_id and format<>'single_elimination') then
    raise exception 'Перестановка доступна только в олимпийской сетке / Орын ауыстыру тек олимпиадалық торда қолжетімді';
  end if;
  perform 1 from public.matches where category_id=p_category_id order by id for update nowait;

  select count(*) filter (where m.participant_a_id=p_first_id),
         count(*) filter (where m.participant_b_id=p_first_id)
    into first_count,second_count from public.matches m where m.category_id=p_category_id;
  if first_count+second_count<>1 then
    raise exception 'У спортсмена должен быть один стартовый слот / Спортшының бір бастапқы орны болуы керек';
  end if;
  select count(*) filter (where m.participant_a_id=p_second_id),
         count(*) filter (where m.participant_b_id=p_second_id)
    into first_count,second_count from public.matches m where m.category_id=p_category_id;
  if first_count+second_count<>1 then
    raise exception 'У спортсмена должен быть один стартовый слот / Спортшының бір бастапқы орны болуы керек';
  end if;
  if exists(select 1 from public.results where category_id=p_category_id and participant_id in (p_first_id,p_second_id)) then
    raise exception 'У спортсмена уже есть результат / Спортшының нәтижесі бар';
  end if;

  if exists (
    with recursive affected(id) as (
      select m.id from public.matches m where m.category_id=p_category_id
        and (m.participant_a_id in (p_first_id,p_second_id) or m.participant_b_id in (p_first_id,p_second_id))
      union
      select target.id from affected a join public.matches source on source.id=a.id
        join public.matches target on target.id in (source.next_match_id,source.loser_next_match_id)
    )
    select 1 from affected a join public.matches m on m.id=a.id
    where m.category_id<>p_category_id or m.winner_id is not null or m.completed_at is not null
      or m.status not in ('scheduled','ready')
  ) then
    raise exception 'Первый бой спортсмена или связанный следующий бой уже начался / Спортшының алғашқы немесе келесі байланысты жекпе-жегі басталды';
  end if;

  update public.matches m set
    participant_a_id=case m.participant_a_id when p_first_id then p_second_id when p_second_id then p_first_id else m.participant_a_id end,
    participant_b_id=case m.participant_b_id when p_first_id then p_second_id when p_second_id then p_first_id else m.participant_b_id end,
    updated_at=now()
  where m.category_id=p_category_id and
    (m.participant_a_id in (p_first_id,p_second_id) or m.participant_b_id in (p_first_id,p_second_id));
exception when lock_not_available then
  raise exception 'Сетка сейчас обновляется. Повторите попытку / Тор жаңартылып жатыр. Қайталап көріңіз';
end;
$function$;
revoke all on function public.swap_bracket_participants(uuid,uuid,uuid) from public,anon;
grant execute on function public.swap_bracket_participants(uuid,uuid,uuid) to authenticated;

-- A swap replaces names in occupied slots; it must not recalculate the schedule.
-- Keep automatic queue updates when a previously empty slot is filled.
create or replace function public.queue_newly_ready_match()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
 if ((old.participant_a_id is null and new.participant_a_id is not null)
   or (old.participant_b_id is null and new.participant_b_id is not null))
 and (private.has_tournament_permission(new.tournament_id,'running') or private.has_tournament_permission(new.tournament_id,'schedule'))
 and new.status<>'completed' and new.participant_a_id is not null and new.participant_b_id is not null
 and exists(select 1 from public.match_schedule ms join public.matches m on m.id=ms.match_id where m.tournament_id=new.tournament_id)
 and exists(select 1 from public.mats where tournament_id=new.tournament_id and is_active) then
   perform public.generate_tournament_schedule(new.tournament_id);
 end if;
 return new;
end;
$function$;
