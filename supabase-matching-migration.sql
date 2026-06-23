-- Heinzelchen Matching-Migration
-- Additiv und reversibel gedacht: keine bestehenden Tabellen oder Daten werden geloescht.
-- Vor Ausfuehrung pruefen, insbesondere die Datenuebernahme aus bestehenden JSON/text[]-Feldern.

begin;

create extension if not exists postgis with schema extensions;

create table if not exists public.fertigkeiten (
  id uuid primary key default gen_random_uuid(),
  bezeichnung text not null unique,
  created_at timestamptz not null default now()
);

insert into public.fertigkeiten (bezeichnung)
values
  ('Gartenarbeit'),
  ('Nachhilfe'),
  ('Kinderbetreuung'),
  ('Haustierbetreuung'),
  ('Aufbau'),
  ('Malereiarbeiten'),
  ('Putzen & Reinigen'),
  ('Wäscheservice'),
  ('Sonstiges')
on conflict (bezeichnung) do nothing;

-- Temporäre Aliasliste fuer die Migration: alte/freie Bezeichnungen werden
-- normalisiert und auf die zentrale Fertigkeitenliste gemappt.
create temp table if not exists _fertigkeit_aliases (
  alias text primary key,
  bezeichnung text not null references public.fertigkeiten(bezeichnung)
) on commit drop;

insert into _fertigkeit_aliases (alias, bezeichnung)
values
  ('Gartenarbeit', 'Gartenarbeit'),
  ('Garten', 'Gartenarbeit'),
  ('Nachhilfe', 'Nachhilfe'),
  ('Kinderbetreuung', 'Kinderbetreuung'),
  ('Kinder Betreuung', 'Kinderbetreuung'),
  ('Haustierbetreuung', 'Haustierbetreuung'),
  ('Tierbetreuung', 'Haustierbetreuung'),
  ('Aufbau', 'Aufbau'),
  ('Aufbau / Montage', 'Aufbau'),
  ('Montage', 'Aufbau'),
  ('Malereiarbeiten', 'Malereiarbeiten'),
  ('Malerarbeiten', 'Malereiarbeiten'),
  ('Putzen & Reinigen', 'Putzen & Reinigen'),
  ('Reinigung', 'Putzen & Reinigen'),
  ('Reinigung/Putzen', 'Putzen & Reinigen'),
  ('Putzen', 'Putzen & Reinigen'),
  ('Wäscheservice', 'Wäscheservice'),
  ('Waschen', 'Wäscheservice'),
  ('Bügeln', 'Wäscheservice'),
  ('Zusammenlegen', 'Wäscheservice'),
  ('Sonstiges', 'Sonstiges')
on conflict (alias) do update set bezeichnung = excluded.bezeichnung;

alter table public.arbeiter
  add column if not exists standort_lat double precision,
  add column if not exists standort_lng double precision,
  add column if not exists standort extensions.geography(Point, 4326),
  add column if not exists verfuegbar boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Falls lat/lng bereits in JSON oder spaeter manuell in den neuen Spalten liegen,
-- wird daraus der PostGIS-Punkt aufgebaut. Ungueltige oder fehlende Koordinaten
-- bleiben null und matchen nicht ueber Entfernung.
update public.arbeiter as a
set
  standort_lat = coalesce(
    a.standort_lat,
    nullif(regexp_replace(coalesce((to_jsonb(a)->>'lat'), ''), '[^0-9\.\-]', '', 'g'), '')::double precision,
    nullif(regexp_replace(coalesce((to_jsonb(a)->>'latitude'), ''), '[^0-9\.\-]', '', 'g'), '')::double precision
  ),
  standort_lng = coalesce(
    a.standort_lng,
    nullif(regexp_replace(coalesce((to_jsonb(a)->>'lng'), ''), '[^0-9\.\-]', '', 'g'), '')::double precision,
    nullif(regexp_replace(coalesce((to_jsonb(a)->>'longitude'), ''), '[^0-9\.\-]', '', 'g'), '')::double precision
  )
where a.standort_lat is null or a.standort_lng is null;

update public.arbeiter
set standort = extensions.ST_SetSRID(extensions.ST_MakePoint(standort_lng, standort_lat), 4326)::extensions.geography
where standort is null
  and standort_lat between -90 and 90
  and standort_lng between -180 and 180;

create table if not exists public.arbeiter_fertigkeiten (
  arbeiter_id uuid not null references public.arbeiter(id) on delete cascade,
  fertigkeit_id uuid not null references public.fertigkeiten(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (arbeiter_id, fertigkeit_id)
);

-- Bestehende skills text[] aus public.arbeiter in die neue n:m-Struktur uebernehmen.
-- Freitext wird ueber _fertigkeit_aliases normalisiert. SELECT DISTINCT und der
-- Primaerschluessel verhindern doppelte Fertigkeiten pro Arbeiter.
insert into public.arbeiter_fertigkeiten (arbeiter_id, fertigkeit_id)
select distinct a.id, f.id
from public.arbeiter a
cross join lateral unnest(coalesce(a.skills, '{}'::text[])) as skill(raw_bezeichnung)
join _fertigkeit_aliases fa
  on lower(regexp_replace(trim(fa.alias), '[^[:alnum:]äöüß]+', '', 'g'))
   = lower(regexp_replace(trim(skill.raw_bezeichnung), '[^[:alnum:]äöüß]+', '', 'g'))
join public.fertigkeiten f
  on f.bezeichnung = fa.bezeichnung
on conflict do nothing;

create table if not exists public.aufgaben (
  id uuid primary key default gen_random_uuid(),
  buchung_id uuid references public.buchungen(id) on delete set null,
  titel text not null,
  beschreibung text,
  dauer numeric(4,1),
  aufgabenort_lat double precision,
  aufgabenort_lng double precision,
  aufgabenort extensions.geography(Point, 4326),
  benoetigte_fertigkeit_id uuid not null references public.fertigkeiten(id) on delete restrict,
  status text not null default 'neu',
  selected_arbeiter_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists arbeiter_standort_gix
  on public.arbeiter using gist (standort);

create index if not exists arbeiter_verfuegbar_idx
  on public.arbeiter (verfuegbar);

create index if not exists arbeiter_fertigkeiten_fertigkeit_idx
  on public.arbeiter_fertigkeiten (fertigkeit_id, arbeiter_id);

create index if not exists aufgaben_aufgabenort_gix
  on public.aufgaben using gist (aufgabenort);

create index if not exists aufgaben_fertigkeit_status_idx
  on public.aufgaben (benoetigte_fertigkeit_id, status);

-- Optionale additive Datenuebernahme aus bestehenden Buchungen.
-- Es wird nur eine Aufgabe je Buchung angelegt, wenn noch keine Aufgabe fuer diese Buchung existiert
-- und genau eine bekannte Fertigkeit aus dienst/services ableitbar ist.
-- Nicht zuordenbare Buchungen werden bewusst uebersprungen; benoetigte_fertigkeit_id
-- bleibt not null, damit jede Aufgabe matchbar ist.
insert into public.aufgaben (
  buchung_id,
  titel,
  beschreibung,
  dauer,
  benoetigte_fertigkeit_id,
  status
)
select
  b.id,
  coalesce(nullif(b.dienst, ''), 'Buchungsanfrage') as titel,
  nullif(b.adresse, '') as beschreibung,
  null::numeric(4,1) as dauer,
  f.id as benoetigte_fertigkeit_id,
  coalesce(nullif(b.status, ''), 'neu') as status
from public.buchungen b
join _fertigkeit_aliases fa
  on lower(regexp_replace(trim(fa.alias), '[^[:alnum:]äöüß]+', '', 'g'))
   = lower(regexp_replace(trim(coalesce(b.dienst, '')), '[^[:alnum:]äöüß]+', '', 'g'))
join public.fertigkeiten f
  on f.bezeichnung = fa.bezeichnung
where not exists (
  select 1 from public.aufgaben a where a.buchung_id = b.id
);

create or replace function public.passende_arbeiter(
  aufgabe_id uuid,
  max_distanz_km double precision default 20
)
returns table (
  arbeiter_id uuid,
  name text,
  email text,
  distanz_km double precision,
  fertigkeit text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    a.id as arbeiter_id,
    a.name,
    a.email,
    round((extensions.ST_Distance(a.standort, au.aufgabenort) / 1000.0)::numeric, 2)::double precision as distanz_km,
    f.bezeichnung as fertigkeit
  from public.aufgaben au
  join public.fertigkeiten f
    on f.id = au.benoetigte_fertigkeit_id
  join public.arbeiter_fertigkeiten af
    on af.fertigkeit_id = au.benoetigte_fertigkeit_id
  join public.arbeiter a
    on a.id = af.arbeiter_id
  where au.id = aufgabe_id
    and a.verfuegbar is true
    and a.standort is not null
    and au.aufgabenort is not null
    and extensions.ST_DWithin(a.standort, au.aufgabenort, greatest(max_distanz_km, 0) * 1000.0)
  order by extensions.ST_Distance(a.standort, au.aufgabenort) asc;
$$;

alter table public.fertigkeiten enable row level security;
alter table public.arbeiter_fertigkeiten enable row level security;
alter table public.aufgaben enable row level security;

-- Keine direkte oeffentliche Lesbarkeit fuer Arbeiter/Aufgaben/Junction.
drop policy if exists "anon can read fertigkeiten" on public.fertigkeiten;
create policy "anon can read fertigkeiten"
on public.fertigkeiten
for select
to anon
using (true);

drop policy if exists "service role can manage fertigkeiten" on public.fertigkeiten;
create policy "service role can manage fertigkeiten"
on public.fertigkeiten
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage arbeiter_fertigkeiten" on public.arbeiter_fertigkeiten;
create policy "service role can manage arbeiter_fertigkeiten"
on public.arbeiter_fertigkeiten
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage aufgaben" on public.aufgaben;
create policy "service role can manage aufgaben"
on public.aufgaben
for all
to service_role
using (true)
with check (true);

-- RPC gezielt fuer anon freigeben. Die Funktion gibt nur id/name/email/distanz/fertigkeit
-- der passenden Heinzelchen zur gewaehlten Aufgabe zurueck.
grant usage on schema public to anon;
grant execute on function public.passende_arbeiter(uuid, double precision) to anon;
grant select on public.fertigkeiten to anon;

commit;
