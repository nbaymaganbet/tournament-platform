-- Fix tournament member RLS qualification and clean only historical duplicate registrations.
DROP POLICY IF EXISTS "members read own memberships" ON public.tournament_members;
CREATE POLICY "members read own memberships"
ON public.tournament_members
FOR SELECT
USING ((select auth.uid()) = tournament_members.user_id);

WITH ranked AS (
  SELECT
    r.id,
    r.status,
    r.payment_status,
    row_number() over (
      partition by
        r.tournament_id,
        lower(trim(p.first_name)),
        lower(trim(p.last_name)),
        p.age,
        regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')
      order by
        case when r.status='confirmed' and r.payment_status='paid' then 0 else 1 end,
        r.created_at asc,
        r.id
    ) as rn,
    bool_or(r.status='confirmed' and r.payment_status='paid') over (
      partition by
        r.tournament_id,
        lower(trim(p.first_name)),
        lower(trim(p.last_name)),
        p.age,
        regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')
    ) as has_confirmed
  FROM public.registrations r
  JOIN public.participants p ON p.id=r.participant_id
),
to_delete AS (
  SELECT id
  FROM ranked
  WHERE (has_confirmed AND NOT (status='confirmed' AND payment_status='paid'))
     OR (NOT has_confirmed AND rn>1)
)
DELETE FROM public.registrations r
USING to_delete d
WHERE r.id=d.id;

DELETE FROM public.participants p
WHERE NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.participant_id=p.id)
  AND NOT EXISTS (SELECT 1 FROM public.category_participants cp WHERE cp.participant_id=p.id)
  AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.participant_a_id=p.id OR m.participant_b_id=p.id)
  AND NOT EXISTS (SELECT 1 FROM public.results res WHERE res.participant_id=p.id);
