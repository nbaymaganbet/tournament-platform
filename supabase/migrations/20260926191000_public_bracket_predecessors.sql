-- Expose only the public bracket links and names needed to label each slot.
drop function public.get_public_category_bracket(uuid,uuid);
create function public.get_public_category_bracket(p_tournament_id uuid,p_category_id uuid)
returns table(
  id uuid, match_number integer, round_number integer, status text,
  participant_a_name text, participant_b_name text, next_match_number integer,
  next_match_id uuid, loser_next_match_id uuid, has_winner boolean,
  participant_a_is_bye boolean, participant_b_is_bye boolean
)
language sql stable security definer set search_path to ''
as $function$
  select m.id,m.match_number,m.round_number,m.status,
    nullif(concat_ws(' ',a.first_name,a.last_name),'') as participant_a_name,
    nullif(concat_ws(' ',b.first_name,b.last_name),'') as participant_b_name,
    next_match.match_number,m.next_match_id,m.loser_next_match_id,m.winner_id is not null,
    m.participant_a_id is not null and m.round_number>1 and not exists (
      select 1 from public.matches prev where prev.category_id=m.category_id
        and prev.round_number<m.round_number
        and m.participant_a_id in (prev.participant_a_id,prev.participant_b_id)
    ),
    m.participant_b_id is not null and m.round_number>1 and not exists (
      select 1 from public.matches prev where prev.category_id=m.category_id
        and prev.round_number<m.round_number
        and m.participant_b_id in (prev.participant_a_id,prev.participant_b_id)
    )
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
