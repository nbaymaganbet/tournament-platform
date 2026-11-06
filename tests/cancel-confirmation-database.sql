-- Transactional cancellation regression. No test events, memberships or athletes are retained.
BEGIN;

DO $qa$
DECLARE org uuid; uid uuid; tid uuid; cid uuid; a jsonb; b jsonb; rid uuid; original_person jsonb; original_number text; blocked boolean; outsider uuid;
BEGIN
 SELECT id,user_id INTO org,uid FROM public.organizers ORDER BY created_at LIMIT 1;
 SELECT id INTO outsider FROM auth.users WHERE id<>uid ORDER BY created_at LIMIT 1;
 ASSERT outsider IS NOT NULL,'A second existing account is needed for permission regression';
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM set_config('app.tournament_rpc_guard','1',true);
 INSERT INTO public.tournaments(organizer_id,name,slug,date,status,is_public,bracket_rules_version) VALUES(org,'Cancel confirmation transactional QA',gen_random_uuid()::text,current_date,'preparation',true,1) RETURNING id INTO tid;
 INSERT INTO public.categories(tournament_id,name,age_min,age_max,weight_limit) VALUES(tid,'QA',10,15,60) RETURNING id INTO cid;
 a:=public.add_weigh_in_participant(cid,'QA cancel',gen_random_uuid()::text,12,50,null,null,null,null,null);
 SELECT id,application_number INTO rid,original_number FROM public.registrations WHERE tournament_id=tid AND participant_id=(a->>'id')::uuid;
 PERFORM public.set_category_weigh_in(cid,(a->>'id')::uuid,50,'in_weight');
 SELECT to_jsonb(p) INTO original_person FROM public.participants p WHERE id=(a->>'id')::uuid;

 -- An authenticated outsider and an anonymous caller cannot cancel.
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 blocked:=false;
 BEGIN PERFORM public.cancel_tournament_registration(rid); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 ASSERT blocked,'Outsider cancellation must fail';
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{}',true);
 blocked:=false;
 BEGIN PERFORM public.cancel_tournament_registration(rid); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 ASSERT blocked,'Anonymous cancellation must fail';
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);

 PERFORM public.cancel_tournament_registration(rid);
 ASSERT (SELECT status='pending_confirmation' AND payment_status='unpaid' AND application_number=original_number FROM public.registrations WHERE id=rid),'Cancellation must retain the application and return it to pending';
 ASSERT (SELECT NOT is_active AND weigh_in_weight=50 FROM public.category_participants WHERE category_id=cid AND participant_id=(a->>'id')::uuid),'Remove only active assignment; retain recorded weight';
 ASSERT (SELECT to_jsonb(p)=original_person FROM public.participants p WHERE id=(a->>'id')::uuid),'Athlete data must remain unchanged';
 blocked:=false;
 BEGIN PERFORM public.cancel_tournament_registration(rid); EXCEPTION WHEN raise_exception THEN blocked:=sqlerrm='Registration is not confirmed'; END;
 ASSERT blocked,'Repeated cancellation must not change the pending application';
 PERFORM public.confirm_tournament_registration(rid);
 ASSERT (SELECT status='confirmed' AND payment_status='paid' FROM public.registrations WHERE id=rid),'Reconfirmation must still work';
 ASSERT (SELECT is_active FROM public.category_participants WHERE category_id=cid AND participant_id=(a->>'id')::uuid),'Reconfirmation must restore assignment';

 INSERT INTO public.tournament_members(tournament_id,user_id,role) VALUES(tid,outsider,'operator');
 INSERT INTO public.tournament_member_permissions(tournament_id,user_id,participants) VALUES(tid,outsider,false);
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 blocked:=false;
 BEGIN PERFORM public.cancel_tournament_registration(rid); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 ASSERT blocked,'Staff without participant permission must not cancel';
 UPDATE public.tournament_member_permissions SET participants=true WHERE tournament_id=tid AND user_id=outsider;
 PERFORM public.cancel_tournament_registration(rid);
 ASSERT (SELECT status='pending_confirmation' FROM public.registrations WHERE id=rid),'Authorized participant staff must be able to cancel';
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM public.confirm_tournament_registration(rid);
 b:=public.add_weigh_in_participant(cid,'QA opponent',gen_random_uuid()::text,12,51,null,null,null,null,null);
 PERFORM public.set_category_weigh_in(cid,(a->>'id')::uuid,50,'in_weight');
 PERFORM public.set_category_weigh_in(cid,(b->>'id')::uuid,51,'in_weight');
 PERFORM public.generate_checked_bracket(cid,false);
 blocked:=false;
 BEGIN PERFORM public.cancel_tournament_registration(rid); EXCEPTION WHEN raise_exception THEN blocked:=sqlerrm LIKE '%already in a bracket%'; END;
 ASSERT blocked,'A seeded athlete must not be unconfirmed before the first match';
 ASSERT (SELECT status='confirmed' AND payment_status='paid' FROM public.registrations WHERE id=rid),'Blocked cancellation must preserve confirmation';
 ASSERT (SELECT is_active FROM public.category_participants WHERE category_id=cid AND participant_id=(a->>'id')::uuid),'Blocked cancellation must preserve assignment';
 ASSERT NOT has_function_privilege('anon','public.cancel_tournament_registration(uuid)','EXECUTE'),'Anonymous execution must not be granted';
 ASSERT has_function_privilege('authenticated','public.cancel_tournament_registration(uuid)','EXECUTE'),'Signed-in organizers and authorized staff must be able to call the endpoint';
END $qa$;

ROLLBACK;
