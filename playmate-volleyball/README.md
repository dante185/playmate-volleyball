# PlayMate — Volleyball (Vercel + Supabase)

A lightweight web app to run volleyball drop‑in events: create events, RSVP, waitlist, check‑ins, CSV export. 
Frontend: React (Vite + Tailwind). Backend: Supabase (Postgres + REST).

## 1) Supabase Setup
In your Supabase project, open **SQL Editor** and paste:

```sql
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  level text not null,
  location text not null,
  lat double precision not null,
  lon double precision not null,
  capacity int not null,
  courts int not null,
  price numeric not null,
  contact text,
  pay_in_person boolean not null default true,
  waitlist_enabled boolean not null default true,
  notes text,
  start timestamptz not null,
  finish timestamptz not null,
  inserted_at timestamptz not null default now()
);

create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  checked_in boolean not null default false,
  inserted_at timestamptz not null default now()
);
create index if not exists attendees_event_idx on attendees(event_id);

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  position int generated always as identity,
  inserted_at timestamptz not null default now()
);
create index if not exists waitlist_event_idx on waitlist(event_id);

alter table events enable row level security;
alter table attendees enable row level security;
alter table waitlist enable row level security;

-- ⚠️ Demo policies (public read/write). For production, add auth rules.
create policy if not exists public_read_events on events for select using (true);
create policy if not exists public_write_events on events for all using (true) with check (true);
create policy if not exists public_read_attendees on attendees for select using (true);
create policy if not exists public_write_attendees on attendees for all using (true) with check (true);
create policy if not exists public_read_waitlist on waitlist for select using (true);
create policy if not exists public_write_waitlist on waitlist for all using (true) with check (true);
```

## 2) Local dev (optional)
```bash
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## 3) Deploy on Vercel (free)
1. Push this folder to a GitHub repo.
2. Go to Vercel → New Project → Import the repo.
3. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
4. Deploy → your site goes live (e.g. https://playmate.vercel.app)

## Notes
- If env vars are missing, the app runs in **demo mode** (data isn't saved).
- Only the **anon key** is used client-side. Use stricter RLS rules for production.