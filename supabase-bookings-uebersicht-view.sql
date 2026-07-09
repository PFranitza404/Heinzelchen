create or replace view public.bookings_uebersicht
with (security_invoker = true)
as
select
  coalesce(
    nullif(services_summary, ''),
    nullif(array_to_string(services, ', '), ''),
    extra_task,
    'Buchung'
  ) as aufgabe_uebersicht,
  services_summary,
  services,
  service_durations,
  date,
  time,
  frequency,
  duration,
  extra_task,
  detail_notes,
  availability,
  street,
  zip,
  city,
  address,
  location_notes,
  contact_summary,
  first_name,
  last_name,
  name,
  email,
  phone,
  contact,
  id,
  created_at,
  status,
  assigned_worker_id,
  raw_payload
from public.bookings;
