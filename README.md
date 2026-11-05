# Tournament Platform

Mobile-first web platform for organizing and running sports tournaments.

## MVP

- RU / Қазақша interface
- First-launch presentation
- Public tournament pages
- Participant registration and application status
- Organizer authentication and isolated data
- Participants, categories, single-elimination brackets
- Multi-mat schedule and live tournament running
- Realtime updates for multiple phones
- Results and public live state
- Supabase Auth / PostgreSQL / Realtime / Storage
- Next.js + TypeScript + Vercel

## Current state

The repository starts from a clean Next.js application shell. Backend integration is intentionally not fabricated: the connected Supabase account currently exposes no project, so database/Auth/Realtime/Storage implementation will be connected once a project is available.

## Development rule

Build the MVP end-to-end first. Do not add social, marketplace, coach ratings, complex CRM/analytics, online acquiring, native apps, or automatic category/matchmaking decisions.


## Runtime source and historical migrations

- Next.js route files (including metadata routes such as `opengraph-image.tsx`) are active entry points even when no component imports them.
- Unreferenced former ticket and live-tournament components have been removed. Public event views use `PublicEventList` and `BracketView`.
- `supabase/migrations/` is chronological schema history, not a list of active APIs. Replay the full history; the latest migration determines the current schema. Do not delete applied migrations to remove an obsolete feature.
- Database functions named `legacy_*` are still called by active bracket generation and result recording. Keep them until their callers are replaced.

- `supabase/migrations/20261105164540_remove_unused_runtime_and_ticket_keys.sql` records the applied database cleanup. Its guards preserve application rows and roll back its regression fixtures. `tests/runtime-cleanup-database.sql` verifies the current registration contract in a rollback-only transaction.
