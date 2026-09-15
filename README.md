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
