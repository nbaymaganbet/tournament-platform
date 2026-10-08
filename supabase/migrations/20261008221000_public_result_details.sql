-- Expose only public completed results and the display fields shown to visitors.
create or replace function public.get_public_tournament_results_detailed(p_tournament_id uuid)
returns table(category_id uuid,category_name text,place integer,athlete_name text,age integer,club text,coach text)
language sql stable security definer set search_path to '' as $function$
  select r.category_id,c.name,r.place,trim(concat_ws(' ',p.last_name,p.first_name)),p.age,p.club,p.coach
  from public.results r
    join public.categories c on c.id=r.category_id
    join public.tournaments t on t.id=r.tournament_id and t.id=p_tournament_id
      and t.is_public and t.status='completed'
    join public.participants p on p.id=r.participant_id
  where c.tournament_id=t.id
  order by c.sort_order,c.id,r.place,4;
$function$;
revoke all on function public.get_public_tournament_results_detailed(uuid) from public;
grant execute on function public.get_public_tournament_results_detailed(uuid) to anon,authenticated;
