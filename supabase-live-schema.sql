create table if not exists public.arbeiter (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  role text not null default 'worker',
  name text not null,
  email text not null unique,
  telefon text,
  stadt text,
  skills text[] not null default '{}',
  verfuegbarkeit jsonb not null default '{}'::jsonb,
  status text not null default 'neu',
  verifiziert boolean not null default false,
  ausweis_url text,
  ausweis_pfad text,
  created_at timestamptz not null default now()
);

create table if not exists public.buchungen (
  id uuid primary key default gen_random_uuid(),
  kunde_name text not null,
  email text not null,
  telefon text,
  dienst text not null,
  datum date not null,
  uhrzeit time not null,
  adresse text not null,
  status text not null default 'Neu',
  arbeiter_id uuid references public.arbeiter(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.verfuegbarkeiten (
  id uuid primary key default gen_random_uuid(),
  arbeiter_id uuid not null references public.arbeiter(id) on delete cascade,
  datum date not null,
  uhrzeit_von time not null,
  uhrzeit_bis time not null,
  gebucht boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  aktion text not null,
  details jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create table if not exists public.email_logs (
  id text primary key,
  recipient text,
  subject text,
  status text not null,
  error text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists buchungen_status_idx on public.buchungen(status);
create index if not exists buchungen_datum_idx on public.buchungen(datum);
create index if not exists buchungen_arbeiter_idx on public.buchungen(arbeiter_id);
create index if not exists arbeiter_status_idx on public.arbeiter(status);
create index if not exists arbeiter_verifiziert_idx on public.arbeiter(verifiziert);
create index if not exists arbeiter_auth_user_idx on public.arbeiter(auth_user_id);
create index if not exists arbeiter_role_idx on public.arbeiter(role);
create index if not exists verfuegbarkeiten_arbeiter_datum_idx on public.verfuegbarkeiten(arbeiter_id, datum);
create index if not exists logs_timestamp_idx on public.logs(timestamp desc);
create index if not exists email_logs_created_idx on public.email_logs(created_at desc);
create index if not exists email_logs_status_idx on public.email_logs(status);

alter table public.buchungen enable row level security;
alter table public.arbeiter enable row level security;
alter table public.verfuegbarkeiten enable row level security;
alter table public.logs enable row level security;
alter table public.email_logs enable row level security;

drop policy if exists "public can create bookings" on public.buchungen;
create policy "public can create bookings"
on public.buchungen
for insert
to anon
with check (true);

drop policy if exists "public can create worker applications" on public.arbeiter;
create policy "public can create worker applications"
on public.arbeiter
for insert
to anon
with check (status = 'neu' and verifiziert = false);

drop policy if exists "public can read available slots" on public.verfuegbarkeiten;
create policy "public can read available slots"
on public.verfuegbarkeiten
for select
to anon
using (gebucht = false);

drop policy if exists "service role can manage bookings" on public.buchungen;
create policy "service role can manage bookings"
on public.buchungen
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage workers" on public.arbeiter;
create policy "service role can manage workers"
on public.arbeiter
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage availability" on public.verfuegbarkeiten;
create policy "service role can manage availability"
on public.verfuegbarkeiten
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage logs" on public.logs;
create policy "service role can manage logs"
on public.logs
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage email logs" on public.email_logs;
create policy "service role can manage email logs"
on public.email_logs
for all
to service_role
using (true)
with check (true);
