-- Swap two seeded athletes without recreating matches or changing their schedule.
create or replace function public.swap_bracket_participants(p_category_id uuid, p_first_id uuid, p_second_id uuid)
returns void
language plpgsql security definer set search_path to ''
as $function$
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
    raise exception 'Choose two different participants';
  end if;

  -- Serialize changes in this bracket, including concurrent winner updates.
  perform 1 from public.brackets b where b.category_id=p_category_id for update;
  if not found then raise exception 'Bracket not found'; end if;
  perform 1 from public.matches m where m.category_id=p_category_id order by m.id for update;
  if exists (
    select 1 from public.matches m where m.category_id=p_category_id
      and (m.winner_id is not null or m.completed_at is not null or m.status not in ('scheduled','ready'))
  ) then raise exception 'Bracket can only be changed before fights start'; end if;

  select count(*) filter (where m.participant_a_id=p_first_id or m.participant_b_id=p_first_id),
         count(*) filter (where m.participant_a_id=p_second_id or m.participant_b_id=p_second_id)
  into first_count,second_count
  from public.matches m where m.category_id=p_category_id;
  if first_count<>1 or second_count<>1 then
    raise exception 'Both participants must have exactly one starting position in this bracket';
  end if;

  update public.matches m set
    participant_a_id=case m.participant_a_id when p_first_id then p_second_id when p_second_id then p_first_id else m.participant_a_id end,
    participant_b_id=case m.participant_b_id when p_first_id then p_second_id when p_second_id then p_first_id else m.participant_b_id end,
    updated_at=now()
  where m.category_id=p_category_id and
    (m.participant_a_id in (p_first_id,p_second_id) or m.participant_b_id in (p_first_id,p_second_id));
end;
$function$;
revoke all on function public.swap_bracket_participants(uuid,uuid,uuid) from public, anon;
grant execute on function public.swap_bracket_participants(uuid,uuid,uuid) to authenticated;

-- Return only names and bracket positions for a public tournament.
create or replace function public.get_public_category_bracket(p_tournament_id uuid,p_category_id uuid)
returns table(match_number integer,round_number integer,status text,participant_a_name text,participant_b_name text,next_match_number integer)
language sql stable security definer set search_path to ''
as $function$
  select m.match_number,m.round_number,m.status,
    nullif(concat_ws(' ',a.first_name,a.last_name),'') as participant_a_name,
    nullif(concat_ws(' ',b.first_name,b.last_name),'') as participant_b_name,
    next_match.match_number as next_match_number
  from public.matches m
  join public.categories c on c.id=m.category_id and c.tournament_id=p_tournament_id
  join public.tournaments t on t.id=c.tournament_id and t.is_public=true and t.status<>'draft'
  left join public.participants a on a.id=m.participant_a_id
  left join public.participants b on b.id=m.participant_b_id
  left join public.matches next_match on next_match.id=m.next_match_id
  where m.tournament_id=p_tournament_id and m.category_id=p_category_id
  order by m.round_number,m.match_number;
$function$;
revoke all on function public.get_public_category_bracket(uuid,uuid) from public;
grant execute on function public.get_public_category_bracket(uuid,uuid) to anon,authenticated;
