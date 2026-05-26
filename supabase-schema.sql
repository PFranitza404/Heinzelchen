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

alter table public.workers enable row level security;
alter table public.bookings enable row level security;
