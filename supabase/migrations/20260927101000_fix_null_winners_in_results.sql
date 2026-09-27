-- A result used the pre-update match row (m.winner_id is still NULL).
-- Use the winner passed to the function for final and third-place results.
do $migration$
declare definition text;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='record_match_winner'
    and pg_get_function_identity_arguments(p.oid)='p_match_id uuid, p_winner_id uuid';
  if definition is null
    or position('values(m.tournament_id,m.category_id,m.winner_id,1)' in definition)=0
    or position('values(m.tournament_id,m.category_id,m.winner_id,3)' in definition)=0 then
    raise exception 'Unexpected winner function; result fix was not applied';
  end if;
  definition:=replace(definition,
    'values(m.tournament_id,m.category_id,m.winner_id,1)',
    'values(m.tournament_id,m.category_id,p_winner_id,1)');
  definition:=replace(definition,
    'values(m.tournament_id,m.category_id,m.winner_id,3)',
    'values(m.tournament_id,m.category_id,p_winner_id,3)');
  execute definition;
end;
$migration$;

-- Restore only blank medalist IDs for which the completed final/third-place
-- bout unambiguously identifies a winner. Never overwrite an existing result.
with terminal as (
  select m.category_id,m.winner_id,
    row_number() over (partition by m.category_id order by m.round_number desc,m.match_number asc) ordinal,
    count(*) over (partition by m.category_id) terminal_count
  from public.matches m
  where m.next_match_id is null and m.loser_next_match_id is null
    and m.status='completed' and m.winner_id is not null
), candidates as (
  select r.id,r.category_id,t.winner_id
  from public.results r join terminal t on t.category_id=r.category_id
    and ((r.place=1 and t.ordinal=1)
      or (r.place=3 and t.ordinal=2 and t.terminal_count>=2))
  where r.participant_id is null
)
update public.results r set participant_id=c.winner_id
from candidates c
where r.id=c.id and not exists (
  select 1 from public.results existing
  where existing.category_id=c.category_id and existing.participant_id=c.winner_id
);
