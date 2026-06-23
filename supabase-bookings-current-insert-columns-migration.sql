alter table public.bookings
  add column if not exists services_summary text,
  add column if not exists service_durations jsonb not null default '[]'::jsonb,
  add column if not exists raw_payload jsonb;
