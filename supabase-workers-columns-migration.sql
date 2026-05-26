alter table public.workers
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists availability jsonb not null default '{}'::jsonb,
  add column if not exists radius_km integer,
  add column if not exists local_areas text[] not null default '{}';

update public.workers
set
  name = coalesce(name, data->>'name'),
  email = coalesce(email, data->>'email'),
  phone = coalesce(phone, data->>'phone'),
  skills = case
    when skills is not null and skills <> '{}'::text[] then skills
    when jsonb_typeof(data->'skills') = 'array' then array(select jsonb_array_elements_text(data->'skills'))
    else '{}'::text[]
  end,
  availability = coalesce(availability, data->'availability', '{}'::jsonb),
  radius_km = coalesce(radius_km, nullif(regexp_replace(coalesce(data->>'radiusKm', ''), '\D', '', 'g'), '')::integer),
  local_areas = case
    when local_areas is not null and local_areas <> '{}'::text[] then local_areas
    when jsonb_typeof(data->'localAreas') = 'array' then array(select jsonb_array_elements_text(data->'localAreas'))
    else '{}'::text[]
  end
where data is not null;
