-- Run in a transaction after the unused-runtime cleanup; retain no QA rows.
BEGIN;

DO $registration_test$
DECLARE org uuid; uid uuid; tid uuid; cid uuid; reg jsonb; added jsonb; label text:=gen_random_uuid()::text;
BEGIN
 SELECT id,user_id INTO org,uid FROM public.organizers ORDER BY created_at LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM set_config('app.tournament_rpc_guard','1',true);
 INSERT INTO public.tournaments(organizer_id,name,slug,date,status,is_public) VALUES(org,'Cleanup transactional QA',gen_random_uuid()::text,current_date,'registration_open',true) RETURNING id INTO tid;
 INSERT INTO public.categories(tournament_id,name,age_min,age_max,weight_limit) VALUES(tid,'QA',10,15,60) RETURNING id INTO cid;
 SELECT to_jsonb(r) INTO reg FROM public.submit_tournament_registration(tid,'QA',label,12,50,null,null,null,null,null) r;
 ASSERT reg ? 'registration_id' AND reg ? 'application_number','Registration must retain its ID and application number';
 ASSERT NOT(reg ? 'status_token'),'Registration must not generate or return a ticket key';
 ASSERT (SELECT status='pending_confirmation' FROM public.registrations WHERE id=(reg->>'registration_id')::uuid),'New application must keep its pending status';
 PERFORM public.confirm_tournament_registration((reg->>'registration_id')::uuid);
 ASSERT (SELECT status='confirmed' FROM public.registrations WHERE id=(reg->>'registration_id')::uuid),'Organizer confirmation must still work';
 added:=public.add_weigh_in_participant(cid,'QA manual',gen_random_uuid()::text,12,51,null,null,null,null,null);
 ASSERT (SELECT status='confirmed' AND payment_status='paid' FROM public.registrations WHERE participant_id=(added->>'id')::uuid),'Manual weigh-in registration must remain confirmed';
 ASSERT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='registrations' AND column_name='status_token_hash'),'Ticket-only column must be absent';
END $registration_test$;

ROLLBACK;
