create table if not exists auftrag_counter (
  id integer primary key,
  counter integer not null
);

alter table public.auftrag_counter enable row level security;

revoke all on table public.auftrag_counter from anon, authenticated;
grant select, update on table public.auftrag_counter to service_role;

insert into auftrag_counter (id, counter)
values (1, 1000)
on conflict (id) do nothing;

create or replace function get_next_auftragsnummer()
returns integer
language plpgsql
as $$
declare
  next_counter integer;
begin
  select counter + 1
    into next_counter
    from auftrag_counter
   where id = 1
   for update;

  if next_counter is null then
    raise exception 'auftrag_counter row with id = 1 does not exist';
  end if;

  update auftrag_counter
     set counter = next_counter
   where id = 1;

  return next_counter;
end;
$$;

revoke execute on function public.get_next_auftragsnummer() from anon, authenticated;
grant execute on function public.get_next_auftragsnummer() to service_role;
