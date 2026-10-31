-- Enable change notifications only. No tournament rows, RLS policies or grants are modified.
do $migration$
declare target text;
begin
  foreach target in array array['registrations','participants','category_participants','mats','brackets','tournament_members'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=target) then
      execute format('alter publication supabase_realtime add table public.%I',target);
    end if;
  end loop;
end;
$migration$;
