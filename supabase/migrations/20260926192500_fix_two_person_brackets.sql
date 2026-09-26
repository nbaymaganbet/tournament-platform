-- With two athletes there is one final and no third-place fight.
do $migration$
declare
  definition text;
  marker text := '  if n=3 then';
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='generate_single_elimination_bracket'
    and pg_get_function_identity_arguments(p.oid)='p_category_id uuid';
  if definition is null or position(marker in definition)=0
    or position('private.has_tournament_permission(c.tournament_id,''brackets'')' in definition)=0
    or position('if n=2 then' in definition)>0 then
    raise exception 'Unexpected bracket generator definition';
  end if;
  definition := replace(definition,marker,
    '  if n=2 then
    insert into public.matches(
      bracket_id,tournament_id,category_id,round_number,match_number,status,
      participant_a_id,participant_b_id
    ) values (
      b_id,c.tournament_id,p_category_id,1,1,''scheduled'',ids[1],ids[2]
    );
    update public.brackets set status=''ready'',updated_at=now() where id=b_id;
    return b_id;
  end if;

' || marker);
  execute definition;
end;
$migration$;

-- Remove only empty, unconnected extra matches from existing two-athlete brackets.
with ghosts as (
  select m.id
  from public.matches m
  where m.match_number=2 and m.round_number=1 and m.status='scheduled'
    and m.participant_a_id is null and m.participant_b_id is null
    and m.winner_id is null and m.completed_at is null
    and m.next_match_id is null and m.loser_next_match_id is null
    and (select count(*) from public.matches x where x.bracket_id=m.bracket_id)=2
    and exists (
      select 1 from public.matches real
      where real.bracket_id=m.bracket_id and real.id<>m.id
        and real.match_number=1 and real.round_number=1
        and real.status='scheduled' and real.winner_id is null
        and real.participant_a_id is not null and real.participant_b_id is not null
    )
    and not exists (select 1 from public.matches x where x.next_match_id=m.id or x.loser_next_match_id=m.id)
    and not exists (select 1 from public.match_schedule s where s.match_id=m.id)
    and not exists (select 1 from public.results r where r.category_id=m.category_id)
  for update of m
)
delete from public.matches m using ghosts g where m.id=g.id;
