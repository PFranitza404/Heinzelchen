alter table public.bookings
  add column if not exists name text,
  add column if not exists address text,
  add column if not exists contact text,
  add column if not exists extra_task text,
  add column if not exists location_notes text,
  add column if not exists availability jsonb not null default '{}'::jsonb,
  add column if not exists detail_notes jsonb not null default '{}'::jsonb;

update public.bookings
set
  name = coalesce(
    nullif(name, ''),
    nullif(trim(concat_ws(' ', first_name, last_name)), ''),
    nullif(trim(concat_ws(' ', data->'customer'->>'firstName', data->'customer'->>'lastName')), '')
  ),
  address = coalesce(
    nullif(address, ''),
    nullif(
      concat_ws(
        ', ',
        coalesce(nullif(city, ''), nullif(data->'customer'->>'city', '')),
        coalesce(nullif(street, ''), nullif(data->'customer'->>'street', '')),
        coalesce(nullif(zip, ''), nullif(data->'customer'->>'zip', ''))
      ),
      ''
    )
  ),
  contact = coalesce(
    nullif(contact, ''),
    nullif(
      concat_ws(
        ', ',
        coalesce(nullif(email, ''), nullif(data->'customer'->>'email', '')),
        coalesce(nullif(phone, ''), nullif(data->'customer'->>'phone', ''))
      ),
      ''
    )
  ),
  extra_task = coalesce(nullif(extra_task, ''), data->>'extraTask'),
  location_notes = coalesce(nullif(location_notes, ''), data->>'locationNotes'),
  availability = case
    when availability <> '{}'::jsonb then availability
    when jsonb_typeof(data->'availability') = 'object' then data->'availability'
    else '{}'::jsonb
  end,
  detail_notes = case
    when detail_notes <> '{}'::jsonb then detail_notes
    when jsonb_typeof(data->'detailNotes') = 'object' then data->'detailNotes'
    else '{}'::jsonb
  end;
