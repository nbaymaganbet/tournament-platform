create function public.save_age_group_timing(p_category_id uuid,p_seconds integer,p_rounds integer,p_rest integer)
returns void language plpgsql security definer set search_path='' as $$
declare category public.categories%rowtype; tid uuid; group_ids uuid[];
begin
 select tournament_id into tid from public.categories where id=p_category_id;
 if auth.uid() is null or tid is null or not private.has_tournament_permission(tid,'categories') then
  raise exception 'Not authorized';
 end if;
 perform 1 from public.tournaments where id=tid for update;
 select * into strict category from public.categories where id=p_category_id and tournament_id=tid;
 select array_agg(c.id) into group_ids from public.categories c
 where c.tournament_id=tid and c.division=category.division
 and c.age_min is not distinct from category.age_min and c.age_max is not distinct from category.age_max;
 if exists(select 1 from public.matches where category_id=any(group_ids) and status='running') then
  raise exception 'Cannot change timing during an active match';
 end if;
 update public.categories set round_seconds=p_seconds,round_count=p_rounds,round_rest_seconds=p_rest where id=any(group_ids);
 if exists(select 1 from public.match_schedule s join public.matches m on m.id=s.match_id where m.tournament_id=tid) then
  perform public.refresh_tournament_schedule_times(tid);
 end if;
end;
$$;
revoke all on function public.save_age_group_timing(uuid,integer,integer,integer) from public,anon;
grant execute on function public.save_age_group_timing(uuid,integer,integer,integer) to authenticated;

create or replace function private.inherit_age_group_settings()
returns trigger language plpgsql security definer set search_path='' as $$
declare group_settings public.categories%rowtype;
begin
 if tg_op='UPDATE' then
  if (old.tournament_id,old.division,old.age_min,old.age_max) is not distinct from
     (new.tournament_id,new.division,new.age_min,new.age_max) then return new; end if;
 end if;
 perform 1 from public.tournaments where id=new.tournament_id for update;
 select c.* into group_settings from public.categories c
 where c.tournament_id=new.tournament_id and c.division=new.division
   and c.age_min is not distinct from new.age_min and c.age_max is not distinct from new.age_max
   and c.id is distinct from new.id order by c.sort_order,c.id limit 1;
 new.age_group_name:=group_settings.age_group_name;
 new.manual_assignment_only:=coalesce(group_settings.manual_assignment_only,false);
 if found then
  new.round_seconds:=group_settings.round_seconds;
  new.round_count:=group_settings.round_count;
  new.round_rest_seconds:=group_settings.round_rest_seconds;
 end if;
 return new;
end;
$$;
