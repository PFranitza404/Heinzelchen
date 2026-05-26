alter table public.bookings
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists street text,
  add column if not exists zip text,
  add column if not exists services text[] not null default '{}',
  add column if not exists date date,
  add column if not exists time text,
  add column if not exists frequency text,
  add column if not exists duration integer;

update public.bookings
set
  first_name = coalesce(first_name, data->'customer'->>'firstName'),
  last_name = coalesce(last_name, data->'customer'->>'lastName'),
  email = coalesce(email, data->'customer'->>'email'),
  phone = coalesce(phone, data->'customer'->>'phone'),
  street = coalesce(street, data->'customer'->>'street'),
  zip = coalesce(zip, data->'customer'->>'zip'),
  city = coalesce(city, data->'customer'->>'city'),
  services = case
    when services is not null and services <> '{}'::text[] then services
    when jsonb_typeof(data->'services') = 'array' then array(select jsonb_array_elements_text(data->'services'))
    else '{}'::text[]
  end,
  date = coalesce(date, nullif(data->'appointment'->>'date', '')::date),
  time = coalesce(time, data->'appointment'->>'time'),
  frequency = coalesce(frequency, data->>'frequency'),
  duration = coalesce(duration, nullif(regexp_replace(coalesce(data->>'duration', ''), '\D', '', 'g'), '')::integer)
where data is not null;
