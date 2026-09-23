create or replace function public.transfer_category_participant(p_from_category_id uuid,p_to_category_id uuid,p_participant_id uuid)
returns jsonb language plpgsql set search_path to public,private
as $$
declare from_c public.categories%rowtype; to_c public.categories%rowtype; p public.participants%rowtype; cp public.category_participants%rowtype; target_weight numeric;
begin
 select * into from_c from public.categories where id=p_from_category_id;
 select * into to_c from public.categories where id=p_to_category_id;
 if from_c.id is null then raise exception 'Source category not found'; end if;
 if to_c.id is null then raise exception 'Target category not found'; end if;
 if from_c.tournament_id<>to_c.tournament_id then raise exception 'Categories must belong to the same tournament'; end if;
 if from_c.id=to_c.id then raise exception 'Choose another category'; end if;
 if not private.is_organizer_of_tournament(from_c.tournament_id) then raise exception 'Not authorized'; end if;
 select * into p from public.participants where id=p_participant_id;
 if not found then raise exception 'Participant not found'; end if;
 if to_c.age_min is not null and p.age<to_c.age_min then raise exception 'Participant age is outside the target category'; end if;
 if to_c.age_max is not null and p.age>to_c.age_max then raise exception 'Participant age is outside the target category'; end if;
 select * into cp from public.category_participants where category_id=p_from_category_id and participant_id=p_participant_id and is_active=true for update;
 if not found then raise exception 'Active participant is not in the source category'; end if;
 target_weight:=cp.weigh_in_weight;
 if target_weight is null then raise exception 'Actual weigh-in weight is required before transfer'; end if;
 if target_weight<coalesce(to_c.weight_min,0) or target_weight>coalesce(to_c.weight_limit,100000)+coalesce(to_c.weight_allowance,0) then raise exception 'Actual weight is outside the target category'; end if;
 update public.category_participants set is_active=false where category_id=p_from_category_id and participant_id=p_participant_id;
 select * into cp from public.category_participants where category_id=p_to_category_id and participant_id=p_participant_id for update;
 if found then
   update public.category_participants set is_active=true,weigh_in_weight=target_weight,weigh_in_status='in_weight' where category_id=p_to_category_id and participant_id=p_participant_id;
 else
   insert into public.category_participants(category_id,participant_id,is_active,weigh_in_weight,weigh_in_status)
   values(p_to_category_id,p_participant_id,true,target_weight,'in_weight');
 end if;
 return jsonb_build_object('participant_id',p_participant_id,'from_category_id',p_from_category_id,'to_category_id',p_to_category_id,'actual_weight',target_weight,'weigh_in_status','in_weight');
end;
$$;