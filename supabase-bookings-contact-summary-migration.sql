alter table public.bookings
  add column if not exists contact_summary text;
