create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.workers (
  id text primary key,
  active boolean not null default true,
  city text,
  service_area text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id text primary key,
  status text not null default 'Neu',
  assigned_worker_id text references public.workers(id),
  appointment_date date,
  city text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists bookings_assigned_worker_idx on public.bookings(assigned_worker_id);
create index if not exists bookings_appointment_date_idx on public.bookings(appointment_date);
create index if not exists workers_active_idx on public.workers(active);

alter table public.admin_profiles enable row level security;
alter table public.workers enable row level security;
alter table public.bookings enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
  );
$$;

drop policy if exists "admins can read admin profiles" on public.admin_profiles;
create policy "admins can read admin profiles"
on public.admin_profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can manage workers" on public.workers;
create policy "admins can manage workers"
on public.workers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage bookings" on public.bookings;
create policy "admins can manage bookings"
on public.bookings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Nach dem Erstellen deines Supabase-Auth-Users die Admin-ID eintragen:
-- insert into public.admin_profiles (user_id, email)
-- values ('DEINE_AUTH_USER_ID', 'deine@email.de');
